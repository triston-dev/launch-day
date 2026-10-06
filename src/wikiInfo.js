import { fetchJson } from './http.js';

const API = 'https://en.wikipedia.org/w/api.php';
const BATCH = 20; // the extracts module caps intro extracts at 20 pages per request

// Strips the noise Wikipedia leads carry that reads badly out of context:
// native-script titles, pronunciation guides, and dangling empty parens.
export function cleanExtract(text) {
  return String(text || '')
    .replace(/\s*\((?:[^()]*(?:Japanese|Chinese|Korean|lit\.|Hepburn|romanized|pronounced)[^()]*(?:\([^()]*\)[^()]*)*)\)/g, '')
    .replace(/\s*\(\s*[;,]?\s*\)/g, '')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Fetches intro summaries and lead images for a list of article titles.
// Returns Map(requestedTitle -> info | null). Redirects and normalisation are
// resolved so the caller can look results up by the title it asked for.
export async function fetchArticleInfo(titles) {
  const results = new Map();
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    const url = new URL(API);
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      prop: 'extracts|pageimages|description',
      exintro: '1',
      explaintext: '1',
      exsentences: '4',
      exlimit: String(BATCH),
      piprop: 'thumbnail',
      pithumbsize: '600',
      pilicense: 'any',
      pilimit: String(BATCH),
      titles: chunk.join('|'),
    });
    const data = await fetchJson(url);
    const query = data?.query || {};

    const resolve = new Map();
    for (const n of query.normalized || []) resolve.set(n.from, n.to);
    const redirectFragment = new Map();
    for (const r of query.redirects || []) {
      resolve.set(r.from, r.to);
      if (r.tofragment) redirectFragment.set(r.to, r.tofragment);
    }
    const pages = new Map((query.pages || []).map((p) => [p.title, p]));

    for (const requested of chunk) {
      let title = requested;
      const seen = new Set();
      while (resolve.has(title) && !seen.has(title)) {
        seen.add(title);
        title = resolve.get(title);
      }
      const page = pages.get(title);
      if (!page || page.missing || page.invalid) {
        results.set(requested, null);
        continue;
      }
      results.set(requested, {
        title: page.title,
        // A redirect into a section means the game has no article of its own;
        // the lead then describes a parent topic, so flag it as indirect.
        direct: !redirectFragment.has(page.title),
        extract: cleanExtract(page.extract),
        shortDescription: page.description || null,
        image: page.thumbnail?.source || null,
      });
    }
  }
  return results;
}
