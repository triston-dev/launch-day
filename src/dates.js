const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function monthIndex(word) {
  const w = word.toLowerCase();
  const i = MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w)));
  return i === -1 ? null : i + 1;
}

function span(y, m1, m2, precision) {
  return { date: iso(y, m1, 1), endDate: iso(y, m2, lastDay(y, m2)), precision };
}

// Turns the free-form date cells used by Wikipedia's release lists into a
// date window. `precision` tells the UI how much to trust the day:
//   day      "October 14"
//   month    "November"
//   quarter  "Q4", "Q1/Q2"
//   season   "Fall", "Early 2027"
//   year     "Unknown", "2027", "TBA"
export function parseReleaseDate(text, year) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  const t = raw.replace(/\b(19|20)\d\d\b/g, '').replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
  const explicitYear = raw.match(/\b((?:19|20)\d\d)\b/);
  const y = explicitYear ? Number(explicitYear[1]) : year;

  let m = t.match(/^([A-Za-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m && monthIndex(m[1])) {
    const mi = monthIndex(m[1]);
    const d = Math.min(Number(m[2]), lastDay(y, mi));
    return { date: iso(y, mi, d), endDate: iso(y, mi, d), precision: 'day' };
  }

  m = t.match(/^(\d{1,2}) ([A-Za-z]+)\b/);
  if (m && monthIndex(m[2])) {
    const mi = monthIndex(m[2]);
    const d = Math.min(Number(m[1]), lastDay(y, mi));
    return { date: iso(y, mi, d), endDate: iso(y, mi, d), precision: 'day' };
  }

  m = t.match(/^([A-Za-z]+)$/);
  if (m && monthIndex(m[1])) {
    const mi = monthIndex(m[1]);
    return span(y, mi, mi, 'month');
  }

  m = t.match(/^Q([1-4])(?:\s*[/–-]\s*Q([1-4]))?$/i);
  if (m) {
    const q1 = Number(m[1]);
    const q2 = m[2] ? Number(m[2]) : q1;
    return { ...span(y, q1 * 3 - 2, Math.max(q1, q2) * 3, 'quarter'), quarters: [q1, q2] };
  }

  m = t.match(/^H([12])$/i);
  if (m) return m[1] === '1' ? span(y, 1, 6, 'season') : span(y, 7, 12, 'season');

  const lower = t.toLowerCase();
  const seasons = {
    spring: [3, 5],
    summer: [6, 8],
    fall: [9, 11],
    autumn: [9, 11],
    winter: [12, 12],
    early: [1, 4],
    mid: [5, 8],
    late: [9, 12],
    holiday: [11, 12],
  };
  for (const [word, [a, b]] of Object.entries(seasons)) {
    if (lower === word || lower.startsWith(`${word} `)) {
      return { ...span(y, a, b, 'season'), season: word };
    }
  }

  return { ...span(y, 1, 12, 'year') };
}
