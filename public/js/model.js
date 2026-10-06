// Client-side model: loads the dataset, derives per-game fields used for
// filtering and ranking, and owns the user's filters, watchlist and library.
import { PLATFORM_FILTERS, genreBuckets, ownedPlatformName } from './catalog.js';
import { hypeScore, hypeLevel } from './rank.js';
import { hashHue, normalize, storage, localIso, listJoin } from './util.js';

const ASIA_ONLY = /^(JP|CN|KR|AS|TW|HK)(\/(JP|CN|KR|AS|TW|HK))*$/;
const REISSUE_TYPES = new Set(['Port', 'Rerelease', 'Remaster', 'Compilation']);

export const DEFAULT_FILTERS = {
  platforms: [],
  genre: '',
  headliners: false,
  hideReissues: false,
  includeAsia: false,
  hideOwned: false,
  watchlistOnly: false,
};

function derive(game, today) {
  game.searchText = normalize([game.title, ...game.developers, ...game.publishers].join(' '));
  game.titleNorm = normalize(game.title);
  game.asiaOnly = ASIA_ONLY.test(game.region || '');
  game.reissue = game.types.length > 0 && game.types.every((t) => REISSUE_TYPES.has(t));
  game.buckets = genreBuckets(game.genres);
  game.hue = hashHue(game.title);
  game.headliner = Boolean(game.wiki);
  game.art = game.banner || game.cover || null;

  game.score = hypeScore(game, today);
  game.hypeLevel = hypeLevel(game);
  return game;
}

export class Model {
  constructor() {
    this.data = null;
    this.games = [];
    this.byId = new Map();
    this.etag = null;
    this.filters = { ...DEFAULT_FILTERS, ...storage.get('launchday.filters', {}) };
    this.watchlist = new Set(storage.get('launchday.watchlist', []));
    // Ownership: platforms marked by hand per game, plus an imported Steam library.
    this.owned = storage.get('launchday.owned', {});
    this.steamLibrary = storage.get('launchday.steamLibrary', null);
    this.steamOwned = new Set(this.steamLibrary?.appids || []);
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  emit(reason, detail) {
    for (const fn of this.listeners) fn(reason, detail);
  }

  // Returns 'ok', 'unchanged', or 'pending' (server is still building its first dataset).
  async load() {
    const res = await fetch('/api/games', { headers: this.etag ? { 'If-None-Match': this.etag } : {} });
    if (res.status === 304) return 'unchanged';
    if (res.status === 503) return 'pending';
    if (!res.ok) throw new Error(`Could not load games (HTTP ${res.status})`);
    this.etag = res.headers.get('ETag');
    const data = await res.json();
    this.data = data;
    const today = localIso();
    this.games = data.games.map((g) => derive(g, today));
    this.byId = new Map(this.games.map((g) => [g.id, g]));
    this.emit('data');
    return 'ok';
  }

  setFilters(patch) {
    this.filters = { ...this.filters, ...patch };
    storage.set('launchday.filters', this.filters);
    this.emit('filters');
  }

  resetFilters() {
    this.setFilters({ ...DEFAULT_FILTERS });
  }

  activeFilterCount() {
    const f = this.filters;
    return (
      f.platforms.length +
      (f.genre ? 1 : 0) +
      (f.headliners ? 1 : 0) +
      (f.hideReissues ? 1 : 0) +
      (f.includeAsia ? 1 : 0) +
      (f.hideOwned ? 1 : 0) +
      (f.watchlistOnly ? 1 : 0)
    );
  }

  isWatched(id) {
    return this.watchlist.has(id);
  }

  toggleWatch(id) {
    if (this.watchlist.has(id)) this.watchlist.delete(id);
    else this.watchlist.add(id);
    storage.set('launchday.watchlist', [...this.watchlist]);
    this.emit('watchlist', id);
    return this.watchlist.has(id);
  }

  watchedGames() {
    return this.games.filter((g) => this.watchlist.has(g.id));
  }

  // Platform keys this game is owned on; 'steam' stands for the imported library.
  ownedOn(game) {
    const keys = [...(this.owned[game.id] || [])];
    if (game.steam && this.steamOwned.has(game.steam.appid) && !keys.includes('steam')) keys.push('steam');
    return keys;
  }

  isOwned(game) {
    return this.ownedOn(game).length > 0;
  }

  // "Owned on PS5 and Steam", or null.
  ownedLabel(game) {
    const keys = this.ownedOn(game);
    if (!keys.length) return null;
    return `Owned on ${listJoin(keys.map(ownedPlatformName))}`;
  }

  setOwned(id, key, on) {
    const keys = new Set(this.owned[id] || []);
    if (on) keys.add(key);
    else keys.delete(key);
    if (keys.size) this.owned[id] = [...keys];
    else delete this.owned[id];
    storage.set('launchday.owned', this.owned);
    this.emit('owned', id);
  }

  setSteamLibrary(library) {
    this.steamLibrary = library;
    this.steamOwned = new Set(library?.appids || []);
    storage.set('launchday.steamLibrary', library);
    this.emit('owned');
  }

  matches(game) {
    const f = this.filters;
    if (f.watchlistOnly) return this.watchlist.has(game.id);
    if (!f.includeAsia && game.asiaOnly) return false;
    if (f.headliners && !game.headliner) return false;
    if (f.hideReissues && game.reissue) return false;
    if (f.hideOwned && this.isOwned(game)) return false;
    if (f.genre && !game.buckets.includes(f.genre)) return false;
    if (f.platforms.length) {
      const wanted = PLATFORM_FILTERS.filter((p) => f.platforms.includes(p.key)).flatMap((p) => p.match);
      if (!game.platforms.some((p) => wanted.includes(p))) return false;
    }
    return true;
  }

  filtered() {
    return this.games.filter((g) => this.matches(g));
  }

  // Most hyped first (see rank.js).
  rank(games) {
    return [...games].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  }

  search(query, limit = 8) {
    const q = normalize(query);
    if (!q) return [];
    const today = new Date().toISOString().slice(0, 10);
    const hits = [];
    for (const g of this.games) {
      let rank;
      if (g.titleNorm === q) rank = 0;
      else if (g.titleNorm.startsWith(q)) rank = 1;
      else if (g.titleNorm.includes(` ${q}`)) rank = 2;
      else if (g.titleNorm.includes(q)) rank = 3;
      else if (g.searchText.includes(q)) rank = 4;
      else continue;
      hits.push({ g, rank: rank + (g.endDate < today ? 0.5 : 0) - g.score / 100 });
    }
    return hits.sort((a, b) => a.rank - b.rank).slice(0, limit).map((h) => h.g);
  }
}
