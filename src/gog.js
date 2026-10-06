import { fetchJson, HttpError } from './http.js';
import { isSameGame, similarity } from './text.js';

// Looks a title up in GOG's public catalog. Returns the product page and
// cover art when a listing confidently matches, otherwise null.
export async function searchGog(title) {
  const url = new URL('https://catalog.gog.com/v1/catalog');
  // The catalog's query parser rejects quotes and some punctuation outright.
  const term = title.replace(/[^\p{L}\p{N}\s.&-]/gu, ' ').replace(/\s+/g, ' ').trim();
  url.search = new URLSearchParams({
    limit: '8',
    query: `like:${term}`,
    order: 'desc:score',
    productType: 'in:game,pack',
  });
  let data;
  try {
    data = await fetchJson(url);
  } catch (err) {
    // The catalog answers some zero-hit queries with a bare 400.
    if (err instanceof HttpError && err.status === 400) return null;
    throw err;
  }
  const match = (data?.products || [])
    .filter((p) => isSameGame(title, p.title))
    .sort((a, b) => similarity(title, b.title) - similarity(title, a.title))[0];
  if (!match) return null;
  return {
    url: match.storeLink || `https://www.gog.com/en/game/${match.slug}`,
    cover: match.coverVertical || null,
    image: match.coverHorizontal || null,
    comingSoon: match.productState === 'coming-soon',
  };
}
