// Anticipation signals: how many people are reading about a game and how
// many follow it on Steam. Neither needs an API key.
import { fetchJson, fetchText } from './http.js';

const API = 'https://en.wikipedia.org/w/api.php';
const BATCH = 50;

// English Wikipedia page views over the last `days` days for many articles at
// once (the PageViewInfo API takes 50 titles a request, where the per-article
// REST endpoint throttles after about a hundred calls).
// Returns Map(requestedTitle -> views).
export async function fetchPageviews(titles, days = 30) {
  const results = new Map();
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    const resolve = new Map();
    let cont = {};
    do {
      const url = new URL(API);
      url.search = new URLSearchParams({
        action: 'query',
        format: 'json',
        formatversion: '2',
        redirects: '1',
        prop: 'pageviews',
        pvipdays: String(days),
        titles: chunk.join('|'),
        ...cont,
      });
      const data = await fetchJson(url);
      const query = data?.query || {};
      for (const n of [...(query.normalized || []), ...(query.redirects || [])]) resolve.set(n.from, n.to);
      for (const page of query.pages || []) {
        if (!page.pageviews) continue;
        const views = Object.values(page.pageviews).reduce((sum, v) => sum + (v || 0), 0);
        results.set(page.title, views);
      }
      cont = data?.continue || null;
    } while (cont);

    for (const title of chunk) {
      let t = title;
      for (let hops = 0; resolve.has(t) && hops < 3; hops++) t = resolve.get(t);
      results.set(title, results.get(t) ?? 0);
    }
  }
  return results;
}

// Members of the game's Steam community hub, which is what Steam shows as
// "followers". Returns null when the app has no hub.
export async function fetchSteamFollowers(appid) {
  const xml = await fetchText(`https://steamcommunity.com/games/${appid}/memberslistxml/?xml=1`);
  const match = xml?.match(/<memberCount>(\d+)<\/memberCount>/);
  return match ? Number(match[1]) : null;
}
