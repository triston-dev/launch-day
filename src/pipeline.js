import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { createLimiter, sleep } from './http.js';
import { JsonCache } from './cache.js';
import { fetchReleaseListHtml, parseReleaseList, releaseListTitle } from './wikipedia.js';
import { fetchArticleInfo } from './wikiInfo.js';
import { searchSteamApp, fetchSteamItems } from './steam.js';
import { searchGog } from './gog.js';
import { fetchPageviews, fetchSteamFollowers } from './hype.js';
import { fetchCriticScores } from './reviews.js';
import { isCalendarRelevant, PC_PLATFORMS } from './platforms.js';
import { normalizeTitle, similarity, slugify } from './text.js';

const DAY = 24 * 60 * 60 * 1000;

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

function yearsToFetch(now = new Date()) {
  const y = now.getUTCFullYear();
  const years = [y, y + 1, y + 2];
  if (now.getUTCMonth() < 2) years.unshift(y - 1); // keep last December reachable early in the year
  return years;
}

// ---------------------------------------------------------------------------
// Entry clean-up: dedupe, stable ids.

const PRECISION_RANK = { day: 0, month: 1, season: 2, quarter: 3, year: 4 };

function dedupe(entries) {
  const byKey = new Map();
  for (const e of entries) {
    const key = [normalizeTitle(e.title), e.region || '', [...e.platforms].sort().join(','), e.types.join(',')].join('|');
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, e);
      continue;
    }
    // The same release listed twice (often once dated, once in "unscheduled"
    // on another year's page): keep whichever is more specific.
    const better =
      PRECISION_RANK[e.precision] < PRECISION_RANK[existing.precision] ||
      (e.precision === existing.precision && e.scheduled && !existing.scheduled);
    if (better) byKey.set(key, { ...e, article: e.article || existing.article });
    else if (!existing.article && e.article) existing.article = e.article;
  }
  return [...byKey.values()];
}

// Ids survive date changes so a watchlisted game stays watchlisted when it
// slips. When one title has several releases (a PC launch and a later
// console port), the earliest keeps the plain id.
function assignIds(entries) {
  const groups = new Map();
  for (const e of entries) {
    const base = slugify(e.title) + (e.region ? `-${e.region.toLowerCase().replace(/[^a-z]/g, '')}` : '');
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(e);
  }
  const used = new Set();
  for (const [base, group] of groups) {
    group.sort((a, b) => a.date.localeCompare(b.date));
    group.forEach((e, i) => {
      let id = i === 0 ? base : `${base}-${e.platforms.join('-') || 'tba'}`;
      if (used.has(id)) id = `${id}-${e.date}`;
      let n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      used.add(id);
      e.id = id;
    });
  }
  return entries;
}

function priority(entry, today) {
  // Upcoming releases first (soonest first), then recent history.
  const diff = daysBetween(today, entry.endDate);
  return diff >= 0 ? diff : -diff * 3;
}

const isPcEligible = (e) => e.platforms.length === 0 || e.platforms.some((p) => PC_PLATFORMS.has(p));
const searchKey = (e) => normalizeTitle(e.title);

// ---------------------------------------------------------------------------
// Assembly: merge an entry with whatever the caches know about it.

const REISSUE_TYPES = ['Port', 'Remaster', 'Rerelease', 'Compilation'];

function plausibleSteamMatch(entry, steam) {
  if (!steam?.release?.timestamp || steam.release.comingSoon) return true;
  if (entry.precision === 'year') return true;
  if (entry.types.some((t) => ['Full release', 'Early access', 'Expansion'].includes(t))) return true;
  // A console port of something already on Steam: the older store page is
  // exactly the game, just the PC edition.
  if (!isPcEligible(entry) && entry.types.some((t) => REISSUE_TYPES.includes(t))) return true;
  const steamDate = new Date(steam.release.timestamp * 1000).toISOString().slice(0, 10);
  // A store page that went live long before this release is a different,
  // older game sharing the name (common with remakes).
  return daysBetween(steamDate, entry.date) < 400;
}

function describeDateChange(prev, entry) {
  if (prev.date === entry.date && prev.precision === entry.precision) return null;
  let kind = 'changed';
  if (entry.endDate > prev.endDate) kind = 'delayed';
  else if (entry.endDate < prev.date) kind = 'moved-up';
  else if (PRECISION_RANK[entry.precision] < PRECISION_RANK[prev.precision]) kind = 'dated';
  return { kind, from: { date: prev.date, endDate: prev.endDate, precision: prev.precision }, at: new Date().toISOString() };
}

// True when the linked article is about this exact game rather than the
// original it ports, or a parent topic it redirects into.
function isOwnArticle(entry, wikiInfo) {
  if (!wikiInfo?.direct) return false;
  const bare = wikiInfo.title.replace(/\s*\([^)]*\)$/, '');
  return normalizeTitle(bare) === normalizeTitle(entry.title) || similarity(bare, entry.title) >= 0.9;
}

function matchedSteam(entry, ctx) {
  const hit = ctx.steamSearch.get(searchKey(entry))?.value;
  const steam = hit ? ctx.steamItems.get(String(hit.appid))?.value : null;
  return steam && plausibleSteamMatch(entry, steam) ? steam : null;
}

function hypeFor(entry, ctx, wikiInfo, steam) {
  const views = wikiInfo ? ctx.pageviews.get(wikiInfo.title)?.value || 0 : 0;
  const followers = steam ? ctx.followers.get(String(steam.appid))?.value || 0 : 0;
  if (!views && !followers) return null;
  return {
    views,
    // Interest borrowed from the original game (ports, or an article about
    // the series) counts for less than interest in this release itself.
    viewsInherited: views > 0 && !isOwnArticle(entry, wikiInfo),
    followers,
    followersInherited: followers > 0 && !isPcEligible(entry),
  };
}

function assembleGame(entry, ctx) {
  const wikiInfo = entry.article ? ctx.wiki.get(entry.article)?.value : null;
  const steam = matchedSteam(entry, ctx);
  const gog = isPcEligible(entry) ? ctx.gog.get(searchKey(entry))?.value : null;

  const directWiki = wikiInfo?.direct ? wikiInfo : null;
  const critic = isOwnArticle(entry, wikiInfo) ? ctx.critic.get(wikiInfo.title)?.value : null;
  const prev = ctx.previous.get(entry.id);
  const dateChange = prev ? describeDateChange(prev, entry) || prev.dateChange || null : null;

  return {
    id: entry.id,
    title: entry.title,
    region: entry.region,
    date: entry.date,
    endDate: entry.endDate,
    precision: entry.precision,
    ...(entry.season ? { season: entry.season } : {}),
    ...(entry.quarters ? { quarters: entry.quarters } : {}),
    platforms: entry.platforms,
    types: entry.types,
    genres: entry.genres,
    developers: entry.developers,
    publishers: entry.publishers,
    wiki: wikiInfo ? wikiInfo.title : entry.article || null,
    summary: directWiki?.extract || null,
    blurb: steam?.description || null,
    tagline: directWiki?.shortDescription || null,
    cover: steam?.images.cover || directWiki?.image || gog?.cover || null,
    banner: steam?.images.header || steam?.images.capsule || gog?.image || null,
    hero: steam?.images.hero || null,
    thumb: steam?.images.small || steam?.images.header || directWiki?.image || gog?.cover || null,
    steam: steam
      ? {
          appid: steam.appid,
          url: steam.url,
          price: steam.price,
          discountPct: steam.discountPct,
          reviews: steam.reviews,
          deck: steam.platforms.deck,
          vr: steam.platforms.vr,
          comingSoon: steam.release.comingSoon,
          earlyAccess: steam.release.isEarlyAccess,
          screenshots: steam.screenshots.slice(0, 6),
          trailers: steam.trailers.slice(0, 2),
        }
      : null,
    gog: gog ? { url: gog.url } : null,
    hype: hypeFor(entry, ctx, wikiInfo, steam),
    critic: critic
      ? { ...critic, ...(entry.types.some((t) => REISSUE_TYPES.includes(t)) ? { inherited: true } : {}) }
      : null,
    firstSeen: prev ? prev.firstSeen : ctx.hadPrevious ? new Date().toISOString() : null,
    dateChange,
    source: releaseListTitle(entry.sourceYear),
  };
}

// ---------------------------------------------------------------------------

async function loadPrevious() {
  try {
    const data = JSON.parse(await fs.readFile(config.gamesFile, 'utf8'));
    return new Map(data.games.map((g) => [g.id, g]));
  } catch {
    return null;
  }
}

async function writeJsonAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (err) {
      // Windows refuses to replace a file another process has open; wait it out.
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      await sleep(200 * (attempt + 1));
    }
  }
}

/**
 * Builds the full dataset: Wikipedia release lists, then Wikipedia summaries,
 * Steam store data and GOG links layered on top. Publishes intermediate
 * snapshots through onUpdate so the UI fills in while enrichment runs.
 */
export async function buildDataset({ onProgress = () => {}, onUpdate = () => {}, log = console.log } = {}) {
  const today = todayIso();
  const caches = {
    wiki: await new JsonCache(path.join(config.cacheDir, 'wikipedia.json')).load(),
    steamSearch: await new JsonCache(path.join(config.cacheDir, 'steam-search.json')).load(),
    steamItems: await new JsonCache(path.join(config.cacheDir, 'steam-items.json')).load(),
    gog: await new JsonCache(path.join(config.cacheDir, 'gog.json')).load(),
    pageviews: await new JsonCache(path.join(config.cacheDir, 'pageviews.json')).load(),
    critic: await new JsonCache(path.join(config.cacheDir, 'critic-scores.json')).load(),
    followers: await new JsonCache(path.join(config.cacheDir, 'steam-followers.json')).load(),
  };
  const saveCaches = () => Promise.all(Object.values(caches).map((c) => c.save()));

  // 1. Release lists ---------------------------------------------------------
  onProgress({ stage: 'Reading Wikipedia release lists', done: 0, total: 0 });
  const sources = [];
  let entries = [];
  for (const year of yearsToFetch()) {
    const page = await fetchReleaseListHtml(year);
    if (!page) continue;
    const parsed = parseReleaseList(page.html, year);
    log(`  ${releaseListTitle(year)}: ${parsed.length} rows`);
    sources.push({
      name: releaseListTitle(year),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(releaseListTitle(year).replace(/ /g, '_'))}`,
      revid: page.revid,
    });
    entries.push(...parsed);
  }
  if (!entries.length) throw new Error('No release lists could be read from Wikipedia.');

  entries = assignIds(dedupe(entries.filter((e) => isCalendarRelevant(e.platforms))));
  entries.sort((a, b) => priority(a, today) - priority(b, today));

  const previousMap = await loadPrevious();
  const ctx = { ...caches, previous: previousMap || new Map(), hadPrevious: Boolean(previousMap) };

  const snapshot = (complete = false) => {
    const games = entries
      .map((e) => assembleGame(e, ctx))
      .sort((a, b) => a.date.localeCompare(b.date) || PRECISION_RANK[a.precision] - PRECISION_RANK[b.precision] || a.title.localeCompare(b.title));
    return {
      generatedAt: new Date().toISOString(),
      complete,
      today,
      sources,
      count: games.length,
      games,
    };
  };
  const publish = async (complete = false) => {
    const data = snapshot(complete);
    onUpdate(data);
    await writeJsonAtomic(config.gamesFile, data);
    await saveCaches();
    return data;
  };
  await publish();
  log(`  ${entries.length} PC/console releases after filtering`);

  // 2. Wikipedia summaries and cover art -------------------------------------
  const articles = [...new Set(entries.map((e) => e.article).filter(Boolean))].filter(
    (a) => !caches.wiki.isFresh(a, 14 * DAY),
  );
  for (let i = 0; i < articles.length; i += 20) {
    onProgress({ stage: 'Fetching Wikipedia summaries', done: i, total: articles.length });
    const chunk = articles.slice(i, i + 20);
    try {
      const info = await fetchArticleInfo(chunk);
      for (const title of chunk) caches.wiki.set(title, info.get(title) || null);
    } catch (err) {
      log(`  wikipedia batch failed: ${err.message}`);
    }
  }
  if (articles.length) await publish();

  // 2b. Hype: Wikipedia page views over the last 30 days --------------------
  const resolvedArticles = [
    ...new Set(entries.map((e) => (e.article ? caches.wiki.get(e.article)?.value?.title : null)).filter(Boolean)),
  ].filter((t) => !caches.pageviews.isFresh(t, DAY));
  for (let i = 0; i < resolvedArticles.length; i += 50) {
    onProgress({ stage: 'Measuring hype', done: i, total: resolvedArticles.length });
    const chunk = resolvedArticles.slice(i, i + 50);
    try {
      const views = await fetchPageviews(chunk);
      for (const title of chunk) caches.pageviews.set(title, views.get(title) || 0);
    } catch (err) {
      log(`  pageviews batch failed: ${err.message}`);
    }
  }

  // 2c. Reviews: critic scores from released games' Wikipedia articles -------
  const criticTitles = new Set();
  for (const e of entries) {
    const info = e.article ? caches.wiki.get(e.article)?.value : null;
    if (!isOwnArticle(e, info) || daysBetween(today, e.date) > 7) continue;
    const ttl = daysBetween(e.date, today) <= 60 ? 2 * DAY : 30 * DAY;
    if (!caches.critic.isFresh(info.title, ttl)) criticTitles.add(info.title);
  }
  const criticList = [...criticTitles];
  for (let i = 0; i < criticList.length; i += 20) {
    onProgress({ stage: 'Collecting critic reviews', done: i, total: criticList.length });
    const chunk = criticList.slice(i, i + 20);
    try {
      const scores = await fetchCriticScores(chunk);
      for (const title of chunk) caches.critic.set(title, scores.get(title) || null);
    } catch (err) {
      log(`  review batch failed: ${err.message}`);
    }
  }
  if (resolvedArticles.length || criticList.length) await publish();

  // 3. Steam: find each release's store page. Console-only entries are
  //    searched too: a console port of a PC game shares its art and trailers.
  const isUpcoming = (e) => e.endDate >= today;
  const searchTargets = [];
  const seenKeys = new Set();
  for (const e of entries) {
    const key = searchKey(e);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const cached = caches.steamSearch.get(key);
    const ttl = cached?.value ? 30 * DAY : isUpcoming(e) ? 2 * DAY : 30 * DAY;
    if (!caches.steamSearch.isFresh(key, ttl)) searchTargets.push(e);
  }

  onProgress({ stage: 'Matching games on Steam', done: 0, total: searchTargets.length });
  const steamLimiter = createLimiter({ concurrency: 3, minIntervalMs: 150 });
  let searched = 0;
  let lastPublish = Date.now();
  let midwayPublish = null;
  await Promise.all(
    searchTargets.map((e) =>
      steamLimiter(async () => {
        try {
          caches.steamSearch.set(searchKey(e), await searchSteamApp(e.title));
        } catch (err) {
          log(`  steam search failed for "${e.title}": ${err.message}`);
        }
        searched += 1;
        onProgress({ stage: 'Matching games on Steam', done: searched, total: searchTargets.length });
        // Every so often, pull store art for what has matched so far so the
        // calendar fills in without waiting for the whole search pass.
        if (!midwayPublish && Date.now() - lastPublish > 20000) {
          midwayPublish = fetchStoreDetails(false)
            .then(() => publish())
            .catch((err) => log(`  interim publish failed: ${err.message}`))
            .finally(() => {
              lastPublish = Date.now();
              midwayPublish = null;
            });
        }
      }),
    ),
  );
  if (midwayPublish) await midwayPublish;

  // 4. Steam store details (art, trailers, prices) in batches ----------------
  async function fetchStoreDetails(reportProgress = true) {
    const wanted = new Map();
    for (const e of entries) {
      const hit = caches.steamSearch.get(searchKey(e))?.value;
      if (!hit) continue;
      const key = String(hit.appid);
      const ttl = isUpcoming(e) ? DAY : 10 * DAY;
      if (!caches.steamItems.isFresh(key, ttl)) wanted.set(hit.appid, true);
    }
    const appids = [...wanted.keys()];
    for (let i = 0; i < appids.length; i += 40) {
      if (reportProgress) onProgress({ stage: 'Loading Steam store pages', done: i, total: appids.length });
      const chunk = appids.slice(i, i + 40);
      try {
        const items = await fetchSteamItems(chunk);
        for (const [appid, item] of items) caches.steamItems.set(String(appid), item);
      } catch (err) {
        log(`  steam details batch failed: ${err.message}`);
      }
      await sleep(400);
    }
  }
  await fetchStoreDetails();
  await publish();

  // 4b. Steam followers for upcoming and recent releases ---------------------
  const followerApps = new Set();
  for (const e of entries) {
    if (daysBetween(today, e.endDate) < -30) continue;
    const steam = matchedSteam(e, caches);
    if (steam && !caches.followers.isFresh(String(steam.appid), 3 * DAY)) followerApps.add(steam.appid);
  }
  // Steam's community site throttles after roughly sixty quick requests, so
  // these go one at a time, soonest releases first, saving as they go.
  onProgress({ stage: 'Counting Steam followers', done: 0, total: followerApps.size });
  const followerLimiter = createLimiter({ concurrency: 1, minIntervalMs: 1500 });
  let followersDone = 0;
  await Promise.all(
    [...followerApps].map((appid) =>
      followerLimiter(async () => {
        try {
          caches.followers.set(String(appid), await fetchSteamFollowers(appid));
        } catch (err) {
          log(`  follower count failed for ${appid}: ${err.message}`);
        }
        followersDone += 1;
        onProgress({ stage: 'Counting Steam followers', done: followersDone, total: followerApps.size });
        if (followersDone % 100 === 0) await publish();
      }),
    ),
  );
  if (followerApps.size) await publish();

  // 5. GOG links for upcoming PC releases -----------------------------------
  const gogTargets = [];
  const gogSeen = new Set();
  for (const e of entries) {
    if (!isPcEligible(e) || daysBetween(today, e.endDate) < -30) continue;
    const key = searchKey(e);
    if (gogSeen.has(key)) continue;
    gogSeen.add(key);
    const cached = caches.gog.get(key);
    if (!caches.gog.isFresh(key, cached?.value ? 14 * DAY : 3 * DAY)) gogTargets.push(e);
  }
  onProgress({ stage: 'Checking GOG', done: 0, total: gogTargets.length });
  const gogLimiter = createLimiter({ concurrency: 2, minIntervalMs: 250 });
  let gogDone = 0;
  await Promise.all(
    gogTargets.map((e) =>
      gogLimiter(async () => {
        try {
          caches.gog.set(searchKey(e), await searchGog(e.title));
        } catch (err) {
          log(`  gog search failed for "${e.title}": ${err.message}`);
        }
        gogDone += 1;
        onProgress({ stage: 'Checking GOG', done: gogDone, total: gogTargets.length });
      }),
    ),
  );

  const final = await publish(true);
  onProgress({ stage: 'Done', done: 1, total: 1 });
  return final;
}
