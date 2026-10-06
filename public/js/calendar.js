// Month view: a calendar grid with the biggest releases surfaced in each
// day, plus the releases that only have a month, season or year attached.
import { icon } from './icons.js';
import { card, reviewChip, hypeMeter } from './components.js';
import { PLATFORMS } from './catalog.js';
import {
  esc, parseIso, addDays, addMonths, startOfWeek, localIso, fmt, WEEK_START, dateLabel,
} from './util.js';

const FAMILY_ORDER = ['pc', 'ps', 'xbox', 'nintendo', 'vr', 'other'];

function lastDayOfMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return localIso(new Date(y, m, 0));
}

function familyDots(game) {
  const families = [...new Set(game.platforms.map((p) => PLATFORMS[p]?.family).filter((f) => FAMILY_ORDER.includes(f)))];
  return families
    .sort((a, b) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b))
    .map((f) => `<i class="fdot fdot--${f}"></i>`)
    .join('');
}

function feature(game, watched, today) {
  const src = game.banner || game.thumb;
  if (!src) return null;
  const tag = game.endDate >= today ? hypeMeter(game) : reviewChip(game);
  return `<button class="feature ${watched ? 'is-watched' : ''}" data-game="${esc(game.id)}" title="${esc(game.title)}" style="--h:${game.hue}">
    <img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
    ${tag ? `<span class="feature-tag">${tag}</span>` : ''}
    <span class="feature-title">${watched ? icon('star', { size: 11, filled: true }) : ''}${esc(game.title)}</span>
  </button>`;
}

function pill(game, watched) {
  return `<button class="pill ${watched ? 'is-watched' : ''}" data-game="${esc(game.id)}" title="${esc(game.title)}">
    <span class="pill-dots">${familyDots(game)}</span>
    <span class="pill-title">${watched ? icon('star', { size: 11, filled: true }) : ''}${esc(game.title)}</span>
  </button>`;
}

function yearStrip(model, month, games) {
  const year = month.slice(0, 4);
  const counts = Array.from({ length: 12 }, () => 0);
  for (const g of games) {
    if (g.date.slice(0, 4) !== year) continue;
    if (g.precision === 'day' || g.precision === 'month') counts[Number(g.date.slice(5, 7)) - 1] += 1;
  }
  const max = Math.max(1, ...counts);
  const current = localIso().slice(0, 7);
  return `<div class="year-strip" role="tablist" aria-label="Months of ${year}">
    ${counts
      .map((n, i) => {
        const key = `${year}-${String(i + 1).padStart(2, '0')}`;
        const label = fmt.monthShort.format(new Date(Number(year), i, 1));
        return `<button class="ys-month ${key === month ? 'is-active' : ''} ${key === current ? 'is-now' : ''} ${key < current ? 'is-past' : ''}"
          data-action="goto-month" data-month="${key}" title="${n} release${n === 1 ? '' : 's'} in ${esc(fmt.monthYear.format(new Date(Number(year), i, 1)))}">
          <span class="ys-bar"><i style="height:${Math.round((n / max) * 100)}%"></i></span>
          <span class="ys-label">${esc(label)}</span>
        </button>`;
      })
      .join('')}
  </div>`;
}

function extrasSection(title, subtitle, games, ctx, key) {
  if (!games.length) return '';
  const { model, state } = ctx;
  const expanded = state.expanded.has(key);
  const ranked = model.rank(games);
  const shown = expanded ? ranked : ranked.slice(0, 8);
  return `<section class="extras">
    <header class="section-head">
      <div>
        <h2>${esc(title)}</h2>
        <p>${esc(subtitle)}</p>
      </div>
      <span class="count-pill">${games.length}</span>
    </header>
    <div class="card-grid card-grid--compact">
      ${shown.map((g) => card(g, { watched: model.isWatched(g.id), owned: model.ownedLabel(g), showDate: false })).join('')}
    </div>
    ${
      ranked.length > shown.length
        ? `<button class="btn btn--ghost btn--block" data-action="expand" data-key="${esc(key)}">Show all ${ranked.length}</button>`
        : ''
    }
  </section>`;
}

// Cells only have room for a few titles. Hype decides the order, but a
// watchlisted game never hides behind "+N more": it takes the last visible slot.
const VISIBLE = 4;
function keepWatchedVisible(model, ranked) {
  const hidden = ranked.slice(VISIBLE).filter((g) => model.isWatched(g.id));
  if (!hidden.length) return ranked;
  const shown = ranked.slice(0, VISIBLE);
  for (const g of hidden) {
    const swap = shown.findLastIndex((s) => !model.isWatched(s.id));
    if (swap <= 0) break;
    shown[swap] = g;
  }
  const shownIds = new Set(shown.map((g) => g.id));
  return [...shown, ...ranked.filter((g) => !shownIds.has(g.id))];
}

export function renderCalendar(root, ctx) {
  const { model, state } = ctx;
  const month = state.month;
  const today = localIso();
  const first = `${month}-01`;
  const last = lastDayOfMonth(month);
  const gridStart = startOfWeek(first);
  const weeks = Math.ceil((Math.round((parseIso(last) - parseIso(gridStart)) / 86400000) + 1) / 7);
  const gridEnd = addDays(gridStart, weeks * 7 - 1);

  const games = model.filtered();
  const byDay = new Map();
  let monthCount = 0;
  for (const g of games) {
    if (g.precision === 'day' && g.date >= gridStart && g.date <= gridEnd) {
      if (!byDay.has(g.date)) byDay.set(g.date, []);
      byDay.get(g.date).push(g);
    }
    if ((g.precision === 'day' || g.precision === 'month') && g.date.slice(0, 7) === month) monthCount += 1;
  }

  const monthTba = games.filter((g) => g.precision === 'month' && g.date.slice(0, 7) === month);
  const windowTba = games.filter(
    (g) => (g.precision === 'quarter' || g.precision === 'season') && g.date <= last && g.endDate >= first,
  );
  const yearTba = games.filter((g) => g.precision === 'year' && g.date.slice(0, 4) === month.slice(0, 4));

  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    fmt.weekdayShort.format(new Date(2023, 0, 1 + ((WEEK_START + i) % 7))),
  );

  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const day = addDays(gridStart, i);
    const inMonth = day.slice(0, 7) === month;
    const list = keepWatchedVisible(model, model.rank(byDay.get(day) || []));
    const dow = parseIso(day).getDay();
    const classes = [
      'day',
      inMonth ? '' : 'is-out',
      day === today ? 'is-today' : '',
      day < today ? 'is-past' : '',
      dow === 0 || dow === 6 ? 'is-weekend' : '',
      list.length ? 'has-games' : '',
    ].join(' ');

    let body = '';
    let used = 0;
    if (list.length) {
      const top = feature(list[0], model.isWatched(list[0].id), today);
      if (top) {
        body += top;
        used = 1;
      }
      const room = top ? 3 : 4;
      const rest = list.slice(used, used + room);
      body += rest.map((g) => pill(g, model.isWatched(g.id))).join('');
      used += rest.length;
    }
    const more = list.length - used;
    const watchedHere = list.filter((g) => model.isWatched(g.id)).length;

    cells += `<div class="${classes}" data-day="${day}" role="gridcell" aria-label="${esc(fmt.long.format(parseIso(day)))}: ${list.length} releases">
      <div class="day-head">
        <button class="day-num" data-action="open-day" data-day="${day}">${parseIso(day).getDate()}</button>
        ${list.length ? `<button class="day-count" data-action="open-day" data-day="${day}" title="See all ${list.length} releases">${list.length}${watchedHere ? `<span class="day-watch">${icon('star', { size: 9, filled: true })}</span>` : ''}</button>` : ''}
      </div>
      <div class="day-body">${body}</div>
      ${more > 0 ? `<button class="more" data-action="open-day" data-day="${day}">+${more} more</button>` : ''}
    </div>`;
  }

  const thisMonth = month === today.slice(0, 7);
  const monthName = fmt.monthYear.format(parseIso(first));
  const quarterLabel = windowTba.length
    ? [...new Set(windowTba.map((g) => dateLabel(g)))].slice(0, 3).join(', ')
    : '';

  root.innerHTML = `
    <div class="cal-toolbar">
      <div class="cal-nav">
        <button class="icon-btn" data-action="prev-month" aria-label="Previous month" title="Previous month (←)">${icon('chevronLeft')}</button>
        <h1 class="cal-title">${esc(monthName)}</h1>
        <button class="icon-btn" data-action="next-month" aria-label="Next month" title="Next month (→)">${icon('chevronRight')}</button>
        ${thisMonth ? '' : `<button class="btn btn--small" data-action="today">Today</button>`}
      </div>
      <p class="cal-summary"><b>${monthCount}</b> release${monthCount === 1 ? '' : 's'} this month${
        model.filters.watchlistOnly ? ' on your watchlist' : ''
      }</p>
    </div>
    ${yearStrip(model, month, games)}
    <div class="cal" role="grid">
      ${weekdayNames.map((n) => `<div class="cal-dow" role="columnheader">${esc(n)}</div>`).join('')}
      ${cells}
    </div>
    ${extrasSection(`Also in ${fmt.month.format(parseIso(first))}`, 'Confirmed for this month, exact day not announced yet.', monthTba, ctx, `month-${month}`)}
    ${extrasSection(`Expected ${quarterLabel}`, 'Release window covers this month; no firm date yet.', windowTba, ctx, `window-${month}`)}
    ${extrasSection(`Sometime in ${month.slice(0, 4)}`, 'Announced for this year with no window narrower than that.', yearTba, ctx, `year-${month.slice(0, 4)}`)}
  `;
}

export function shiftMonth(month, n) {
  return addMonths(month, n);
}
