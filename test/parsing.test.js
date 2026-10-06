import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import { expandTable, cellText } from '../src/wikitable.js';
import { parseReleaseDate } from '../src/dates.js';
import { parsePlatforms, isCalendarRelevant } from '../src/platforms.js';
import { parseReleaseList, splitTitleAndRegion } from '../src/wikipedia.js';
import { isSameGame, normalizeTitle, slugify } from '../src/text.js';
import { cleanExtract } from '../src/wikiInfo.js';

test('expandTable resolves rowspan and colspan into a rectangular grid', () => {
  const $ = cheerio.load(`<table>
    <tr><th>A</th><th>B</th><th>C</th></tr>
    <tr><td rowspan="2">a1</td><td>b1</td><td>c1</td></tr>
    <tr><td colspan="2">bc2</td></tr>
    <tr><td>a3</td><td rowspan="2">b3</td><td>c3</td></tr>
    <tr><td>a4</td><td>c4</td></tr>
  </table>`);
  const grid = expandTable($, $('table')[0]).map((row) => row.map((el) => cellText($, el)));
  assert.deepEqual(grid, [
    ['A', 'B', 'C'],
    ['a1', 'b1', 'c1'],
    ['a1', 'bc2', 'bc2'],
    ['a3', 'b3', 'c3'],
    ['a4', 'b3', 'c4'],
  ]);
});

test('cellText drops footnote markers', () => {
  const $ = cheerio.load('<table><tr><td>Hades<sup class="reference">[12]</sup></td></tr></table>');
  assert.equal(cellText($, $('td')[0]), 'Hades');
});

test('parseReleaseDate handles every date shape the lists use', () => {
  assert.deepEqual(parseReleaseDate('October 8', 2026), { date: '2026-10-08', endDate: '2026-10-08', precision: 'day' });
  assert.deepEqual(parseReleaseDate('8 October', 2026), { date: '2026-10-08', endDate: '2026-10-08', precision: 'day' });
  assert.deepEqual(parseReleaseDate('November', 2026), { date: '2026-11-01', endDate: '2026-11-30', precision: 'month' });
  assert.deepEqual(parseReleaseDate('February', 2028), { date: '2028-02-01', endDate: '2028-02-29', precision: 'month' });
  assert.deepEqual(parseReleaseDate('Q4', 2026), {
    date: '2026-10-01', endDate: '2026-12-31', precision: 'quarter', quarters: [4, 4],
  });
  assert.deepEqual(parseReleaseDate('Q1/Q2', 2027), {
    date: '2027-01-01', endDate: '2027-06-30', precision: 'quarter', quarters: [1, 2],
  });
  assert.equal(parseReleaseDate('Fall', 2026).precision, 'season');
  assert.equal(parseReleaseDate('Late 2027', 2026).date, '2027-09-01');
  assert.deepEqual(parseReleaseDate('Unknown', 2027), { date: '2027-01-01', endDate: '2027-12-31', precision: 'year' });
  assert.equal(parseReleaseDate('February 31', 2026).date, '2026-02-28');
});

test('parsePlatforms reads abbreviations, including glued region notes', () => {
  assert.deepEqual(parsePlatforms('WIN, PS5, XBX/S'), ['pc', 'ps5', 'xsx']);
  assert.deepEqual(parsePlatforms('NS, NS2'), ['switch', 'switch2']);
  assert.deepEqual(parsePlatforms('PS5WW: WIN'), ['ps5', 'pc']);
  assert.deepEqual(parsePlatforms('Unknown'), []);
  assert.equal(isCalendarRelevant(parsePlatforms('iOS, DROID')), false);
  assert.equal(isCalendarRelevant(parsePlatforms('DROID, NS2')), true);
  assert.equal(isCalendarRelevant([]), true);
});

test('splitTitleAndRegion separates trailing region codes only', () => {
  assert.deepEqual(splitTitleAndRegion('Ys X: Proud Nordics (WW)'), { title: 'Ys X: Proud Nordics', region: 'WW' });
  assert.deepEqual(splitTitleAndRegion('Memories Off (JP/AS)'), { title: 'Memories Off', region: 'JP/AS' });
  assert.deepEqual(splitTitleAndRegion('Hitman (2016)'), { title: 'Hitman (2016)', region: null });
});

test('isSameGame accepts store naming quirks and rejects add-ons', () => {
  assert.ok(isSameGame('Dynasty Warriors 3: Complete Edition Remastered', 'DYNASTY WARRIORS 3: Complete Edition Remastered'));
  assert.ok(isSameGame('Star Wars: Galactic Racer', 'STAR WARS™: Galactic Racer'));
  assert.ok(isSameGame('Muchi Muchi Pork! & PinkSweets', 'Muchi Muchi Pork! and PinkSweets'));
  assert.ok(!isSameGame('Dynasty Warriors 3: Complete Edition Remastered', 'DYNASTY WARRIORS 3: Complete Edition Remastered DEMO'));
  assert.ok(!isSameGame('The Witcher 4', 'GWENT: The Witcher Card Game - 4k graphic assets pack'));
  assert.ok(!isSameGame('Doom', 'Doom Eternal'));
});

test('normalizeTitle and slugify are stable', () => {
  assert.equal(normalizeTitle('The Légend of Zelda™'), 'legend of zelda');
  assert.equal(slugify("Clive Barker's Hellraiser: Revival"), 'clive-barkers-hellraiser-revival');
});

test('cleanExtract strips native-script parentheticals', () => {
  assert.equal(
    cleanExtract('Ys X (Japanese: イースX, Hepburn: Īsu Ten) is a game.'),
    'Ys X is a game.',
  );
});

test('parseReleaseList reads dated and unscheduled tables', () => {
  const html = `
    <table class="wikitable"><tbody>
      <tr><th>Release date</th><th>Title</th><th>Platform(s)</th><th>Type(s)</th><th>Genre(s)</th><th>Developer(s)</th><th>Publisher(s)</th><th>Ref.</th></tr>
      <tr id="October"><td rowspan="2">October 8</td>
        <td><i><a href="/wiki/Hell_Is_Us" title="Hell Is Us">Hell Is Us</a></i></td>
        <td>NS2</td><td>Port</td><td>Action-adventure</td><td>Rogue Factor</td><td>Nacon</td><td></td></tr>
      <tr><td><i><a href="/wiki/MXGP" title="MXGP">MXGP</a> 26</i> (WW)</td>
        <td>WIN, PS5, XBX/S</td><td>Original</td><td>Racing</td><td colspan="2">Artefacts Studio</td><td></td></tr>
      <tr><td>October 9</td><td><i><a href="/wiki/F.I.S.T." title="F.I.S.T.">Zoopunk</a></i></td>
        <td>WIN</td><td>Original</td><td>Action</td><td>TiGames</td><td>TiGames</td><td></td></tr>
    </tbody></table>
    <table class="wikitable"><tbody>
      <tr><th>Title</th><th>Approximate date</th><th>Platform(s)</th><th>Type(s)</th><th>Genre(s)</th><th>Developer(s)</th><th>Publisher(s)</th><th>Ref.</th></tr>
      <tr><td><i>Mystery Game</i></td><td>Q4</td><td>PS5</td><td>Original</td><td>RPG, Horror</td><td>Studio A</td><td>Studio B</td><td></td></tr>
      <tr><td><i>Phone Game</i></td><td>Unknown</td><td>iOS</td><td></td><td>Puzzle</td><td>X</td><td>Y</td><td></td></tr>
    </tbody></table>`;
  const entries = parseReleaseList(html, 2026);
  assert.equal(entries.length, 5);

  const [hell, mxgp, zoopunk, mystery] = entries;
  assert.equal(hell.title, 'Hell Is Us');
  assert.equal(hell.article, 'Hell Is Us');
  assert.equal(hell.date, '2026-10-08');
  assert.deepEqual(hell.platforms, ['switch2']);
  assert.deepEqual(hell.types, ['Port']);

  assert.equal(mxgp.title, 'MXGP 26');
  assert.equal(mxgp.region, 'WW');
  assert.equal(mxgp.article, null, 'a link to the series is not the game');
  assert.equal(mxgp.date, '2026-10-08', 'rowspan date carries down');
  assert.deepEqual(mxgp.developers, ['Artefacts Studio']);
  assert.deepEqual(mxgp.publishers, ['Artefacts Studio']);

  assert.equal(zoopunk.article, null, 'piped link to a different article is ignored');

  assert.equal(mystery.precision, 'quarter');
  assert.equal(mystery.scheduled, false);
  assert.deepEqual(mystery.genres, ['RPG', 'Horror']);
});
