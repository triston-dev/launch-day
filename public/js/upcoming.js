// Upcoming view: everything from today onward, grouped into weeks for the
// near future, months further out, then the vaguer windows (quarters,
// seasons, "sometime in 2027") in the order they would land.
import { card } from './components.js';
import { icon } from './icons.js';
import { esc, localIso, startOfWeek, addDays, daysBetween, fmt, parseIso, dateLabel } from './util.js';

const WEEKS_AS_GROUPS = 6;
const BATCH = 48;

function lastDayOfMonth(iso) {
  const d = parseIso(iso);
  return localIso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function weekRange(start) {
  const end = addDays(start, 6);
  return `${fmt.short.format(parseIso(start))} to ${fmt.short.format(parseIso(end))}`;
}

function groupFor(game, today, weekStart) {
  const horizon = addDays(weekStart, WEEKS_AS_GROUPS * 7);
  if (game.precision === 'day') {
    if (game.date < today) {
      return { key: 'recent', sort: '0000', label: 'Out in the past week', sub: 'Already released', muted: true };
    }
    if (game.date < horizon) {
      const ws = startOfWeek(game.date);
      const n = daysBetween(weekStart, ws) / 7;
      const label = n === 0 ? 'This week' : n === 1 ? 'Next week' : `Week of ${fmt.short.format(parseIso(ws))}`;
      return { key: `w-${ws}`, sort: ws, label, sub: weekRange(ws) };
    }
    const m = game.date.slice(0, 7);
    return { key: `m-${m}`, sort: `${m}-01`, label: fmt.monthYear.format(parseIso(`${m}-01`)) };
  }
  if (game.precision === 'month') {
    const m = game.date.slice(0, 7);
    if (game.date >= horizon) {
      return { key: `m-${m}`, sort: `${m}-01`, label: fmt.monthYear.format(parseIso(`${m}-01`)) };
    }
    return {
      key: `mt-${m}`,
      sort: `${lastDayOfMonth(game.date)}~`,
      label: `Sometime in ${fmt.monthYear.format(parseIso(game.date))}`,
      sub: 'Month confirmed, day not announced',
    };
  }
  if (game.precision === 'year') {
    const y = game.date.slice(0, 4);
    return { key: `y-${y}`, sort: `${y}-12-31~~`, label: `${y}, date TBA`, sub: 'Announced for the year, no window yet' };
  }
  const label = dateLabel(game);
  return { key: `q-${label}`, sort: `${game.endDate}~${game.date}`, label, sub: 'Release window, no exact date' };
}

export function buildGroups(model, { today = localIso(), showRecent = false } = {}) {
  const weekStart = startOfWeek(today);
  const recentFrom = addDays(today, -7);
  const groups = new Map();
  for (const g of model.filtered()) {
    if (g.endDate < today) {
      if (!(showRecent && g.precision === 'day' && g.date >= recentFrom)) continue;
    }
    const info = groupFor(g, today, weekStart);
    if (!groups.has(info.key)) groups.set(info.key, { ...info, games: [] });
    groups.get(info.key).games.push(g);
  }
  const sorted = [...groups.values()].sort((a, b) => a.sort.localeCompare(b.sort));
  for (const group of sorted) {
    const ranked = model.rank(group.games);
    const rankOf = new Map(ranked.map((g, i) => [g.id, i]));
    const precisionOrder = { day: 0, month: 1, season: 2, quarter: 3, year: 4 };
    group.games.sort(
      (a, b) =>
        precisionOrder[a.precision] - precisionOrder[b.precision] ||
        (group.muted ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) ||
        rankOf.get(a.id) - rankOf.get(b.id),
    );
  }
  return sorted;
}

export function renderUpcoming(root, ctx) {
  const { model, state } = ctx;
  const today = localIso();
  const groups = buildGroups(model, { today, showRecent: state.showRecent });
  const total = groups.reduce((n, g) => n + (g.muted ? 0 : g.games.length), 0);
  const thisWeek = groups.find((g) => g.label === 'This week')?.games.length || 0;
  const watched = model.watchedGames().filter((g) => g.endDate >= today).length;

  root.innerHTML = `
    <div class="list-toolbar">
      <div>
        <h1 class="cal-title">${model.filters.watchlistOnly ? 'Your watchlist' : 'Upcoming releases'}</h1>
        <p class="cal-summary"><b>${total}</b> upcoming${thisWeek ? ` <span class="dot">·</span> <b>${thisWeek}</b> this week` : ''}${
          watched ? ` <span class="dot">·</span> <b>${watched}</b> on your watchlist` : ''
        }</p>
      </div>
      <label class="switch">
        <input type="checkbox" data-action="toggle-recent" ${state.showRecent ? 'checked' : ''}>
        <span class="switch-track"></span>
        <span>Show past week</span>
      </label>
    </div>
    <div class="groups" id="groups"></div>
    <div class="sentinel" id="sentinel"></div>
  `;

  const container = root.querySelector('#groups');
  if (!groups.length) {
    container.innerHTML = `<div class="empty">
      ${icon('calendar', { size: 34 })}
      <h2>Nothing matches</h2>
      <p>${model.filters.watchlistOnly ? 'Star a game to follow it here.' : 'Try loosening the filters.'}</p>
      ${model.activeFilterCount() ? '<button class="btn" data-action="reset-filters">Clear filters</button>' : ''}
    </div>`;
    return;
  }

  // Render in batches as the reader scrolls; a full year is well over a thousand cards.
  let gi = 0;
  let ii = 0;
  const renderMore = () => {
    let budget = BATCH;
    let html = '';
    while (gi < groups.length && budget > 0) {
      const group = groups[gi];
      if (ii === 0) {
        html += `<section class="group ${group.muted ? 'group--muted' : ''}" data-group="${esc(group.key)}">
          <header class="section-head section-head--sticky">
            <div><h2>${esc(group.label)}</h2>${group.sub ? `<p>${esc(group.sub)}</p>` : ''}</div>
            <span class="count-pill">${group.games.length}</span>
          </header>
          <div class="card-grid" data-grid="${esc(group.key)}"></div>
        </section>`;
      }
      const slice = group.games.slice(ii, ii + budget);
      html += `<template data-fill="${esc(group.key)}">${slice
        .map((g) => card(g, { watched: model.isWatched(g.id), owned: model.ownedLabel(g), today }))
        .join('')}</template>`;
      budget -= slice.length;
      ii += slice.length;
      if (ii >= group.games.length) {
        gi += 1;
        ii = 0;
      }
    }
    container.insertAdjacentHTML('beforeend', html);
    for (const tpl of container.querySelectorAll('template[data-fill]')) {
      container.querySelector(`[data-grid="${CSS.escape(tpl.dataset.fill)}"]`).append(tpl.content);
      tpl.remove();
    }
    return gi < groups.length;
  };

  renderMore();
  const sentinel = root.querySelector('#sentinel');
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting) && !renderMore()) observer.disconnect();
    },
    { rootMargin: '1200px 0px' },
  );
  observer.observe(sentinel);
  ctx.cleanup.push(() => observer.disconnect());
}
