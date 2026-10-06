import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewScores } from '../src/reviews.js';
import { hypeScore, hypeLevel, attention, criticScore } from '../public/js/rank.js';
import { storeLinks } from '../public/js/catalog.js';

const TODAY = '2026-10-06';

const game = (overrides) => ({
  title: 'Game',
  date: '2026-11-19',
  endDate: '2026-11-19',
  precision: 'day',
  platforms: ['pc'],
  types: ['Original'],
  wiki: null,
  steam: null,
  hype: null,
  critic: null,
  art: null,
  asiaOnly: false,
  reissue: false,
  ...overrides,
});

test('a hyped new release outranks a port with old Steam reviews', () => {
  // The real pair from November 19, 2026.
  const gta = game({
    title: 'Grand Theft Auto VI',
    platforms: ['ps5', 'xsx'],
    wiki: 'Grand Theft Auto VI',
    art: 'cover.jpg',
    hype: { views: 348390, viewsInherited: false, followers: 0, followersInherited: false },
  });
  const isaac = game({
    title: 'The Binding of Isaac: Repentance+',
    platforms: ['switch2'],
    types: ['Port'],
    reissue: true,
    wiki: 'The Binding of Isaac: Rebirth',
    art: 'header.jpg',
    steam: { appid: 1426300, reviews: { label: 'Very Positive', percent: 84, count: 13706 } },
    hype: { views: 14872, viewsInherited: true, followers: 20000, followersInherited: true },
  });
  assert.ok(hypeScore(gta, TODAY) > hypeScore(isaac, TODAY) + 1);
  assert.equal(hypeLevel(gta), 3);
});

test('inherited interest counts for less than direct interest', () => {
  const own = game({ hype: { views: 50000, viewsInherited: false, followers: 0 } });
  const borrowed = game({ hype: { views: 50000, viewsInherited: true, followers: 0 } });
  assert.ok(attention(own) > attention(borrowed) * 3);
});

test('reviews lift good games and sink bad ones once they are out', () => {
  const released = { date: '2026-09-01', endDate: '2026-09-01' };
  const hype = { views: 20000, viewsInherited: false, followers: 0 };
  const acclaimed = game({ ...released, hype, critic: { metacritic: 92 } });
  const panned = game({ ...released, hype, critic: { metacritic: 48 } });
  const unscored = game({ ...released, hype });
  assert.ok(hypeScore(acclaimed, TODAY) > hypeScore(unscored, TODAY));
  assert.ok(hypeScore(unscored, TODAY) > hypeScore(panned, TODAY));
  assert.equal(criticScore(acclaimed), 92);
});

test('parseReviewScores reads Metacritic and OpenCritic with links', () => {
  const wikitext = `== Reception ==
{{Video game reviews
| MC = (PC) 90/100<ref name="MCPC">{{cite web |url=https://www.metacritic.com/game/hollow-knight-silksong/critic-reviews/?platform=pc |title=Reviews}}</ref><br />(NS2) 92/100<ref>x</ref>
| OC = 97% recommend<ref name="OC">{{cite web |url=https://opencritic.com/game/7425/hollow-knight-silksong |title=Reviews}}</ref>
| GSpot = 9/10
}}
The game received "universal acclaim".`;
  assert.deepEqual(parseReviewScores(wikitext), {
    metacritic: 91,
    metacriticUrl: 'https://www.metacritic.com/game/hollow-knight-silksong/',
    opencriticRecommend: 97,
    opencriticUrl: 'https://opencritic.com/game/7425/hollow-knight-silksong',
  });
  assert.equal(parseReviewScores('No reception section yet.'), null);
});

test('store buttons say where you own the game', () => {
  const port = game({ platforms: ['switch2', 'ps5'], steam: { url: 'https://store.steampowered.com/app/1/', comingSoon: false } });
  const before = storeLinks(port);
  assert.equal(before.find((l) => l.key === 'steam').note, 'Already on PC');

  const after = storeLinks(port, ['steam', 'ps5']);
  assert.equal(after.find((l) => l.key === 'steam').note, 'Owned on Steam');
  assert.equal(after.find((l) => l.key === 'ps').note, 'Owned on PS5');
  assert.equal(after.find((l) => l.key === 'nintendo').owned, undefined);
});
