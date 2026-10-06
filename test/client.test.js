// The browser modules are plain ES modules with no DOM work at import time,
// so their pure helpers can be tested directly under Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs } from '../public/js/ics.js';
import { storeLinks, fallbackDescription, genreBuckets } from '../public/js/catalog.js';
import { dateLabel, relativeDays, addMonths } from '../public/js/util.js';

const base = {
  id: 'example-game',
  title: 'Example Game: Director’s Cut',
  date: '2026-10-08',
  endDate: '2026-10-08',
  precision: 'day',
  platforms: ['pc', 'ps5', 'switch2'],
  types: ['Original'],
  genres: ['Survival horror'],
  developers: ['Small Studio'],
  publishers: ['Big Publisher'],
  steam: null,
  gog: null,
};

test('buildIcs produces a valid all-day event with escaped text', () => {
  const ics = buildIcs([{ ...base, title: 'Semi; Colon, Game' }], 'Test');
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261008\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261009\r\n/);
  assert.match(ics, /SUMMARY:Semi\\; Colon\\, Game releases\r\n/);
  for (const line of ics.split('\r\n')) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  }
});

test('storeLinks prefers exact store pages and covers each platform family', () => {
  const links = storeLinks({ ...base, steam: { url: 'https://store.steampowered.com/app/1/', price: '$19.99' } });
  const byKey = Object.fromEntries(links.map((l) => [l.key, l]));
  assert.equal(byKey.steam.exact, true);
  assert.equal(byKey.steam.note, '$19.99');
  assert.equal(byKey.ps.exact, false);
  assert.ok(byKey.nintendo);
  assert.equal(byKey.xbox, undefined);
});

test('storeLinks marks console ports that already exist on Steam', () => {
  const links = storeLinks({ ...base, platforms: ['switch2'], steam: { url: 'https://store.steampowered.com/app/2/', comingSoon: false } });
  const steam = links.find((l) => l.key === 'steam');
  assert.equal(steam.note, 'Already on PC');
});

test('fallbackDescription reads naturally', () => {
  assert.equal(
    fallbackDescription(base),
    'A survival horror game from Small Studio, published by Big Publisher. Coming to PC, PlayStation 5 and Nintendo Switch 2.',
  );
  assert.match(fallbackDescription({ ...base, types: ['Port'], genres: ['RPG'] }), /^A port of the RPG from/);
});

test('date labels are honest about precision', () => {
  assert.equal(dateLabel({ date: '2026-10-01', precision: 'quarter', quarters: [4, 4] }), 'Q4 2026');
  assert.equal(dateLabel({ date: '2027-01-01', precision: 'quarter', quarters: [1, 2] }), 'Q1/Q2 2027');
  assert.equal(dateLabel({ date: '2027-01-01', precision: 'year' }), '2027, date TBA');
  assert.equal(dateLabel({ date: '2026-09-01', precision: 'season', season: 'fall' }), 'Fall 2026');
  assert.equal(relativeDays(0), 'Today');
  assert.equal(relativeDays(1), 'Tomorrow');
  assert.equal(relativeDays(12), 'in 12 days');
  assert.equal(addMonths('2026-12', 1), '2027-01');
});

test('genre buckets group the long tail of genre names', () => {
  assert.deepEqual(genreBuckets(['Survival horror']), ['Horror']);
  assert.ok(genreBuckets(['Action RPG']).includes('Action RPG'));
  assert.ok(!genreBuckets(['Action RPG']).includes('Action'));
  assert.ok(genreBuckets(['Roguelike', 'TPS']).includes('Shooter'));
});
