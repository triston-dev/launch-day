// Static knowledge about platforms, stores and genres.
import { listJoin } from './util.js';

export const PLATFORMS = {
  pc: { label: 'PC', short: 'PC', family: 'pc' },
  mac: { label: 'Mac', short: 'Mac', family: 'pc' },
  linux: { label: 'Linux / SteamOS', short: 'Linux', family: 'pc' },
  ps5: { label: 'PlayStation 5', short: 'PS5', family: 'ps' },
  ps4: { label: 'PlayStation 4', short: 'PS4', family: 'ps' },
  psvr: { label: 'PlayStation VR2', short: 'PS VR2', family: 'vr' },
  xsx: { label: 'Xbox Series X|S', short: 'Xbox X|S', family: 'xbox' },
  xone: { label: 'Xbox One', short: 'Xbox One', family: 'xbox' },
  switch2: { label: 'Nintendo Switch 2', short: 'Switch 2', family: 'nintendo' },
  switch: { label: 'Nintendo Switch', short: 'Switch', family: 'nintendo' },
  quest: { label: 'Meta Quest', short: 'Quest', family: 'vr' },
  consoles: { label: 'Consoles (TBA)', short: 'Consoles', family: 'other' },
  ios: { label: 'iOS', short: 'iOS', family: 'mobile' },
  android: { label: 'Android', short: 'Android', family: 'mobile' },
  mobile: { label: 'Mobile', short: 'Mobile', family: 'mobile' },
  tvos: { label: 'Apple TV', short: 'tvOS', family: 'mobile' },
  luna: { label: 'Amazon Luna', short: 'Luna', family: 'other' },
  retro: { label: 'Retro hardware', short: 'Retro', family: 'other' },
};

// The platform chips in the filter bar; each can cover several platform keys.
export const PLATFORM_FILTERS = [
  { key: 'pc', label: 'PC', match: ['pc', 'mac', 'linux'], family: 'pc' },
  { key: 'ps5', label: 'PS5', match: ['ps5'], family: 'ps' },
  { key: 'ps4', label: 'PS4', match: ['ps4'], family: 'ps' },
  { key: 'xsx', label: 'Xbox Series X|S', match: ['xsx'], family: 'xbox' },
  { key: 'xone', label: 'Xbox One', match: ['xone'], family: 'xbox' },
  { key: 'switch2', label: 'Switch 2', match: ['switch2'], family: 'nintendo' },
  { key: 'switch', label: 'Switch', match: ['switch'], family: 'nintendo' },
  { key: 'vr', label: 'VR', match: ['psvr', 'quest'], family: 'vr' },
];

export const GENRE_BUCKETS = [
  ['Action', /\baction\b(?!.?(rpg|role))|hack and slash|brawler|beat .em up|character action|musou/i],
  ['Action RPG', /action rpg|action role|soulslike|souls-like/i],
  ['Adventure', /adventure|point.and.click|walking sim|narrative/i],
  ['RPG', /\b[jc]?rpg\b|role-playing|dungeon crawl|monster.taming|creature/i],
  ['Shooter', /shoot|\bfps\b|\btps\b|bullet/i],
  ['Horror', /horror/i],
  ['Platformer', /platform/i],
  ['Metroidvania', /metroidvania/i],
  ['Roguelike', /rogue/i],
  ['Strategy', /strateg|\b4x\b|\brts\b|tactic|tower defen|auto battler|wargame/i],
  ['Simulation', /\bsim\b|simulat|management|city.build|\bcms\b|farming|business|tycoon|colony/i],
  ['Survival', /survival(?! horror)|crafting|sandbox/i],
  ['Puzzle', /puzzle|logic/i],
  ['Racing', /racing|kart|driving/i],
  ['Sports', /sport|football|soccer|basketball|golf|tennis|baseball|wrestling|boxing|skate|hockey|cricket|rugby|fishing/i],
  ['Fighting', /fighting|arena fighter/i],
  ['Visual novel', /visual novel|otome|dating/i],
  ['Party & Family', /party|family|casual|cozy|educational|kids/i],
  ['Rhythm & Music', /rhythm|music/i],
  ['Online & MMO', /mmo|battle royale|extraction|hero shooter|moba|live service/i],
  ['Stealth', /stealth|immersive sim/i],
  ['Card & Board', /deck|card|board game|digital tabletop|mahjong|chess/i],
];

export function genreBuckets(genres) {
  const text = genres.join(' | ');
  return GENRE_BUCKETS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

export function platformLabels(keys, style = 'label') {
  return keys.map((k) => PLATFORMS[k]?.[style] || k);
}

export function ownedPlatformName(key) {
  if (key === 'steam') return 'Steam';
  if (key === 'pc') return 'PC';
  return PLATFORMS[key]?.short || key;
}

// Which ownership keys each storefront answers for.
const STORE_PLATFORMS = {
  steam: ['steam', 'pc'],
  gog: ['pc'],
  epic: ['pc'],
  ps: ['ps5', 'ps4', 'psvr'],
  xbox: ['xsx', 'xone'],
  nintendo: ['switch2', 'switch'],
  vr: ['quest'],
};

// Store buttons for a game: exact store pages where we found them, search
// links otherwise, one per storefront that sells on the game's platforms.
// `owned` lists the platform keys the viewer owns it on (see Model.ownedOn).
export function storeLinks(game, owned = []) {
  const links = baseStoreLinks(game);
  for (const link of links) {
    const mine = owned.filter((k) => STORE_PLATFORMS[link.key]?.includes(k));
    if (mine.length) {
      link.owned = true;
      link.note = `Owned on ${listJoin(mine.map(ownedPlatformName))}`;
    }
  }
  return links;
}

function baseStoreLinks(game) {
  const q = encodeURIComponent(game.title);
  const has = (...keys) => keys.some((k) => game.platforms.includes(k));
  const pc = has('pc', 'mac', 'linux') || game.platforms.length === 0;
  const links = [];

  if (pc) {
    links.push(
      game.steam
        ? {
            store: 'Steam',
            key: 'steam',
            url: game.steam.url,
            exact: true,
            note: game.steam.price || (game.steam.comingSoon ? 'Wishlist' : null),
          }
        : { store: 'Steam', key: 'steam', url: `https://store.steampowered.com/search/?term=${q}`, exact: false },
    );
    if (game.gog) links.push({ store: 'GOG', key: 'gog', url: game.gog.url, exact: true });
    links.push({
      store: 'Epic Games Store',
      key: 'epic',
      url: `https://store.epicgames.com/en-US/browse?q=${q}&sortBy=relevancy&sortDir=DESC`,
      exact: false,
    });
  }
  if (has('ps5', 'ps4', 'psvr')) {
    links.push({ store: 'PlayStation Store', key: 'ps', url: `https://store.playstation.com/en-us/search/${q}`, exact: false });
  }
  if (has('xsx', 'xone')) {
    links.push({ store: 'Xbox Store', key: 'xbox', url: `https://www.xbox.com/en-US/search/results/games?q=${q}`, exact: false });
  }
  if (has('switch', 'switch2')) {
    links.push({
      store: 'Nintendo eShop',
      key: 'nintendo',
      url: `https://www.nintendo.com/us/search/#q=${q}&p=1&cat=gme&sort=df`,
      exact: false,
    });
  }
  if (has('quest')) {
    links.push({ store: 'Meta Horizon Store', key: 'vr', url: `https://www.meta.com/experiences/search/?q=${q}`, exact: false });
  }
  // Console releases of games that already have a PC edition on Steam.
  if (!pc && game.steam) {
    links.push({
      store: 'Steam',
      key: 'steam',
      url: game.steam.url,
      exact: true,
      note: game.steam.comingSoon ? 'PC edition' : 'Already on PC',
    });
  }
  return links;
}

export function infoLinks(game) {
  const q = encodeURIComponent(game.title);
  const links = [];
  if (game.wiki) {
    links.push({ label: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(game.wiki.replace(/ /g, '_'))}` });
  }
  links.push({ label: 'Trailers on YouTube', url: `https://www.youtube.com/results?search_query=${q}+trailer` });
  links.push({ label: 'Metacritic', url: `https://www.metacritic.com/search/${q}/?category=13` });
  links.push({ label: 'HowLongToBeat', url: `https://howlongtobeat.com/?q=${q}` });
  return links;
}

const TYPE_PHRASES = {
  Port: 'a port',
  Remake: 'a remake',
  Remaster: 'a remaster',
  Compilation: 'a compilation',
  Rerelease: 'a re-release',
  Expansion: 'an expansion',
  'Early access': 'an early access launch',
  'Full release': 'the full release',
  Episodic: 'an episodic release',
};

// A plain factual sentence for games no source has described yet.
export function fallbackDescription(game) {
  const genre = game.genres
    .slice(0, 2)
    .join(' and ')
    .split(' ')
    .map((w) => (w === w.toUpperCase() ? w : w.toLowerCase()))
    .join(' ');
  const noun = !genre
    ? 'game'
    : /(novel|game|sim|simulator|shooter|platformer|rpg|roguelike|roguelite|metroidvania|mmo)$/i.test(genre)
      ? genre
      : `${genre} game`;
  const typePhrase = game.types.map((t) => TYPE_PHRASES[t]).find(Boolean);
  const devs = listJoin(game.developers.slice(0, 3));
  const pubs = game.publishers.filter((p) => !game.developers.includes(p));
  const platforms = listJoin(platformLabels(game.platforms));

  let text = typePhrase
    ? `${typePhrase[0].toUpperCase()}${typePhrase.slice(1)} of the ${noun}`
    : `${/^[aeiou]/i.test(noun) ? 'An' : 'A'} ${noun}`;
  if (devs) text += ` from ${devs}`;
  if (pubs.length) text += `, published by ${listJoin(pubs.slice(0, 2))}`;
  text += '.';
  if (platforms) text += ` Coming to ${platforms}.`;
  return text;
}
