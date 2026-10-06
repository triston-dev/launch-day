// Normalises a game title for comparison across stores: case, diacritics,
// trademark glyphs, punctuation and "&" vs "and" all stop mattering.
export function normalizeTitle(title) {
  return String(title || '')
    .replace(/[™®©]/g, '') // before NFKD, which would expand ™ into "TM"
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .trim();
}

export function slugify(text) {
  return normalizeTitle(text).replace(/ /g, '-').slice(0, 80) || 'game';
}

function bigrams(s) {
  const grams = new Map();
  const compact = s.replace(/ /g, '');
  for (let i = 0; i < compact.length - 1; i++) {
    const g = compact.slice(i, i + 2);
    grams.set(g, (grams.get(g) || 0) + 1);
  }
  return grams;
}

// Sørensen–Dice similarity over character bigrams, 0..1.
export function similarity(a, b) {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const gx = bigrams(x);
  const gy = bigrams(y);
  let overlap = 0;
  let total = 0;
  for (const [g, n] of gx) {
    overlap += Math.min(n, gy.get(g) || 0);
    total += n;
  }
  for (const n of gy.values()) total += n;
  return total === 0 ? 0 : (2 * overlap) / total;
}

const EXTRA_WORDS =
  /\b(demo|soundtrack|ost|dlc|season pass|upgrade|artbook|art book|bundle|playtest|prologue|wallpaper|costume|expansion pass|pack)\b/;

// Decides whether a store listing is the same game as a Wikipedia entry.
// Precision matters more than recall: a wrong store link is worse than a
// search link, so anything doubtful is rejected.
export function isSameGame(wikiTitle, storeName) {
  const a = normalizeTitle(wikiTitle);
  const b = normalizeTitle(storeName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (EXTRA_WORDS.test(b) && !EXTRA_WORDS.test(a)) return false;
  if (similarity(a, b) >= 0.88) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return (
    long.startsWith(`${short} `) &&
    short.split(' ').length >= 2 &&
    short.length / long.length >= 0.7
  );
}
