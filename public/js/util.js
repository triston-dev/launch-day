const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

const pad = (n) => String(n).padStart(2, '0');

export function localIso(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

export function addDays(iso, n) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return localIso(d);
}

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysBetween(fromIso, toIso) {
  return Math.round((parseIso(toIso) - parseIso(fromIso)) / 86400000);
}

// First day of the week for the viewer's locale (0 = Sunday, 1 = Monday).
export const WEEK_START = (() => {
  try {
    const locale = new Intl.Locale(navigator.language || 'en-US');
    const info = locale.getWeekInfo?.() || locale.weekInfo;
    if (info?.firstDay) return info.firstDay % 7;
  } catch {
    /* older browsers */
  }
  return 0;
})();

export function startOfWeek(iso) {
  const d = parseIso(iso);
  const shift = (d.getDay() - WEEK_START + 7) % 7;
  return addDays(iso, -shift);
}

export const fmt = {
  long: new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  medium: new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
  short: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }),
  monthYear: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }),
  month: new Intl.DateTimeFormat(undefined, { month: 'long' }),
  monthShort: new Intl.DateTimeFormat(undefined, { month: 'short' }),
  weekdayShort: new Intl.DateTimeFormat(undefined, { weekday: 'short' }),
  relative: new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }),
};

const SEASON_LABELS = {
  spring: 'Spring', summer: 'Summer', fall: 'Fall', autumn: 'Autumn', winter: 'Winter',
  early: 'Early', mid: 'Mid', late: 'Late', holiday: 'Holiday',
};

// Human label for a release window, honest about how precise it is.
export function dateLabel(game, style = 'long') {
  const year = game.date.slice(0, 4);
  switch (game.precision) {
    case 'day':
      return fmt[style === 'long' ? 'long' : style === 'medium' ? 'medium' : 'short'].format(parseIso(game.date));
    case 'month':
      return fmt.monthYear.format(parseIso(game.date));
    case 'quarter': {
      const [a, b] = game.quarters || [Math.ceil(Number(game.date.slice(5, 7)) / 3)];
      return b && b !== a ? `Q${a}/Q${b} ${year}` : `Q${a} ${year}`;
    }
    case 'season':
      if (game.season) return `${SEASON_LABELS[game.season] || game.season} ${year}`;
      return game.date.slice(5, 7) === '01' ? `H1 ${year}` : `H2 ${year}`;
    default:
      return `${year}, date TBA`;
  }
}

export function relativeDays(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days < 45) return `in ${days} days`;
  if (days >= 45) return `in ~${Math.round(days / 30.4)} months`;
  if (days > -45) return `${-days} days ago`;
  return `${Math.round(-days / 30.4)} months ago`;
}

export function timeAgo(isoTimestamp) {
  const seconds = (Date.parse(isoTimestamp) - Date.now()) / 1000;
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return fmt.relative.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export function hashHue(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

export function initials(title) {
  const words = title.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const pick = words.filter((w) => !/^(the|of|and|a|an)$/i.test(w));
  return (pick.length ? pick : words).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function normalize(text) {
  return String(text || '')
    .replace(/[™®©’'`]/g, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function listJoin(items) {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode or full storage: preferences just won't persist */
    }
  },
};
