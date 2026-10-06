import { Model } from './model.js';
import { PLATFORM_FILTERS, GENRE_BUCKETS } from './catalog.js';
import { renderCalendar, shiftMonth } from './calendar.js';
import { renderUpcoming } from './upcoming.js';
import { renderGameDetail, renderDayList, watchButton, ownMenu, storeSection } from './detail.js';
import { row, ownedFlag } from './components.js';
import { downloadIcs } from './ics.js';
import { icon } from './icons.js';
import { esc, localIso, debounce, storage, timeAgo } from './util.js';

const $ = (sel, root = document) => root.querySelector(sel);

const model = new Model();
const state = {
  view: 'calendar',
  month: localIso().slice(0, 7),
  drawerStack: [],
  expanded: new Set(),
  showRecent: storage.get('launchday.showRecent', false),
  playing: false,
  status: null,
  filtersOpen: false,
  ready: false,
};
const ctx = { model, state, cleanup: [] };

const els = {
  main: $('#main'),
  filters: $('#filters'),
  drawer: $('#drawer'),
  scrim: $('#scrim'),
  search: $('#search'),
  results: $('#search-results'),
  footer: $('#footer'),
  progress: $('#progress'),
  toast: $('#toast'),
  lightbox: $('#lightbox'),
};

// ---------------------------------------------------------------------------
// Theme

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('#theme-toggle');
  btn.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
  btn.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0d0e12' : '#f5f2ec';
}
applyTheme(
  storage.get('launchday.theme', null) ||
    (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'),
);

// ---------------------------------------------------------------------------
// URL state: #view=calendar&month=2026-10&game=some-id

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const view = params.get('view');
  if (view === 'calendar' || view === 'upcoming') state.view = view;
  const month = params.get('month');
  if (/^\d{4}-\d{2}$/.test(month || '')) state.month = month;
  const game = params.get('game');
  if (game && model.byId.has(game)) {
    if (state.drawerStack.at(-1)?.id !== game) state.drawerStack = [{ type: 'game', id: game }];
  }
  return { game };
}

function writeHash() {
  const params = new URLSearchParams();
  params.set('view', state.view);
  if (state.view === 'calendar') params.set('month', state.month);
  const top = state.drawerStack.at(-1);
  if (top?.type === 'game') params.set('game', top.id);
  const next = `#${params}`;
  if (location.hash !== next) history.replaceState(null, '', next);
}

// ---------------------------------------------------------------------------
// Rendering

function renderViewSwitch() {
  for (const btn of document.querySelectorAll('[data-action="view"]')) {
    const on = btn.dataset.view === state.view;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on);
  }
}

function renderFilters() {
  const f = model.filters;
  const counts = new Map();
  for (const g of model.games) for (const b of g.buckets) counts.set(b, (counts.get(b) || 0) + 1);
  const watchCount = model.watchlist.size;
  const active = model.activeFilterCount();

  els.filters.innerHTML = `
    <div class="filters-inner ${state.filtersOpen ? 'is-open' : ''}">
      <div class="chips" role="group" aria-label="Platforms">
        <button class="chip ${f.platforms.length ? '' : 'is-on'}" data-action="platform" data-key="">All platforms</button>
        ${PLATFORM_FILTERS.map(
          (p) => `<button class="chip chip--${p.family} ${f.platforms.includes(p.key) ? 'is-on' : ''}" data-action="platform" data-key="${p.key}" aria-pressed="${f.platforms.includes(p.key)}">
            <i class="fdot fdot--${p.family}"></i>${esc(p.label)}</button>`,
        ).join('')}
        <button class="chip chip--more" data-action="toggle-filters" aria-expanded="${state.filtersOpen}">
          ${icon('sliders', { size: 15 })} Filters${active - f.platforms.length > 0 ? ` <span class="n">${active - f.platforms.length}</span>` : ''}
        </button>
      </div>
      <div class="filter-row">
        <label class="select">
          <span class="sr-only">Genre</span>
          <select data-action="genre">
            <option value="">All genres</option>
            ${GENRE_BUCKETS.map(([name]) => name)
              .filter((name) => counts.get(name))
              .map((name) => `<option value="${esc(name)}" ${f.genre === name ? 'selected' : ''}>${esc(name)} (${counts.get(name)})</option>`)
              .join('')}
          </select>
          ${icon('chevronDown', { size: 14 })}
        </label>
        ${toggle('headliners', 'Headliners only', 'Only games notable enough for their own Wikipedia article')}
        ${toggle('hideReissues', 'Hide ports & re-releases', 'Hide ports, remasters, compilations and re-releases')}
        ${toggle('includeAsia', 'Include Asia-only releases', 'Show releases limited to Japan, China or Korea')}
        ${toggle('hideOwned', 'Hide games I own', 'Hide games you have marked as owned or imported from Steam')}
        <span class="filter-spacer"></span>
        <button class="btn btn--small" data-action="steam-library" title="Mark the games you own on Steam">
          ${icon('library', { size: 14 })} ${model.steamLibrary ? `Steam library <span class="n">${model.steamLibrary.appids.length.toLocaleString()}</span>` : 'Import Steam library'}
        </button>
        <button class="chip chip--watch ${f.watchlistOnly ? 'is-on' : ''}" data-action="watchlist-only" aria-pressed="${f.watchlistOnly}">
          ${icon('star', { size: 14, filled: f.watchlistOnly })} Watchlist <span class="n">${watchCount}</span>
        </button>
        ${watchCount ? `<button class="btn btn--small" data-action="ics-watchlist" title="Download your watchlist as a calendar file">${icon('download', { size: 14 })} Export .ics</button>` : ''}
        ${active ? '<button class="link-btn" data-action="reset-filters">Reset</button>' : ''}
      </div>
    </div>`;
}

function toggle(key, label, title) {
  return `<label class="switch" title="${esc(title)}">
    <input type="checkbox" data-action="toggle-filter" data-key="${key}" ${model.filters[key] ? 'checked' : ''}>
    <span class="switch-track"></span><span>${esc(label)}</span>
  </label>`;
}

function renderMain() {
  for (const fn of ctx.cleanup.splice(0)) fn();
  if (!model.data) return;
  if (state.view === 'calendar') renderCalendar(els.main, ctx);
  else renderUpcoming(els.main, ctx);
}

function renderDrawer() {
  const top = state.drawerStack.at(-1);
  stopTrailer();
  if (!top) {
    els.drawer.classList.remove('is-open');
    els.drawer.setAttribute('aria-hidden', 'true');
    els.scrim.classList.remove('is-open');
    document.documentElement.classList.remove('has-drawer');
    return;
  }
  if (top.type === 'game') {
    const game = model.byId.get(top.id);
    if (!game) {
      state.drawerStack.pop();
      return renderDrawer();
    }
    els.drawer.innerHTML = renderGameDetail(game, ctx);
    document.title = `${game.title} · Launch Day`;
  } else {
    els.drawer.innerHTML = renderDayList(top.day, ctx);
  }
  els.drawer.classList.add('is-open');
  els.drawer.setAttribute('aria-hidden', 'false');
  els.scrim.classList.add('is-open');
  document.documentElement.classList.add('has-drawer');
  els.drawer.scrollTop = 0;
}

function renderFooter() {
  const s = state.status;
  const data = model.data;
  const updated = data ? `Updated ${timeAgo(data.generatedAt)}` : 'Not loaded yet';
  const sources = (data?.sources || [])
    .map((src) => `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.name.replace('List of video games released in ', ''))}</a>`)
    .join(', ');
  els.footer.innerHTML = `
    <p>Release lists from Wikipedia${sources ? ` (${sources})` : ''}, used under CC BY-SA 4.0. Store art, prices and trailers from Steam; links from GOG. Not affiliated with any store or platform holder.</p>
    <p class="footer-status">
      <span>${esc(updated)}${data ? ` <span class="dot">·</span> ${data.count.toLocaleString()} releases tracked` : ''}</span>
      <button class="link-btn" data-action="refresh" ${s?.building ? 'disabled' : ''}>${icon('refresh', { size: 13 })} ${s?.building ? 'Refreshing…' : 'Refresh data'}</button>
    </p>`;
}

function renderProgress() {
  const s = state.status;
  const p = s?.building ? s.progress : null;
  if (!p) {
    els.progress.hidden = true;
    return;
  }
  els.progress.hidden = false;
  const pct = p.total ? Math.round((p.done / p.total) * 100) : null;
  els.progress.querySelector('.progress-bar').style.width = pct === null ? '' : `${pct}%`;
  els.progress.classList.toggle('is-indeterminate', pct === null);
  els.progress.querySelector('.progress-label').textContent = p.total ? `${p.stage} · ${p.done}/${p.total}` : p.stage;
}

function renderLoading(message) {
  const p = state.status?.progress;
  els.main.innerHTML = `<div class="loading">
    <div class="loading-mark">${icon('calendar', { size: 40 })}</div>
    <h1>${esc(message)}</h1>
    <p>${p ? esc(p.total ? `${p.stage}: ${p.done} of ${p.total}` : p.stage) : 'Reading this year’s release lists…'}</p>
    <p class="muted">The first build reads every release list and matches each game to its store page. Later visits load instantly.</p>
  </div>`;
}

function renderAll() {
  state.ready = true;
  renderViewSwitch();
  renderFilters();
  renderMain();
  renderDrawer();
  renderFooter();
  writeHash();
}

// ---------------------------------------------------------------------------
// Drawer navigation

function openGame(id, { fromDrawer = false } = {}) {
  if (!model.byId.has(id)) return;
  const entry = { type: 'game', id };
  state.drawerStack = fromDrawer ? [...state.drawerStack, entry] : [entry];
  renderDrawer();
  writeHash();
}

function openDay(day) {
  state.drawerStack = [{ type: 'day', day }];
  renderDrawer();
  writeHash();
}

function closeDrawer() {
  state.drawerStack = [];
  document.title = 'Launch Day · Game Release Calendar';
  renderDrawer();
  writeHash();
}

// ---------------------------------------------------------------------------
// Trailers (Steam serves HLS; Safari plays it natively, others via hls.js)

let hls = null;
let hlsLoader = null;

function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  hlsLoader ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/hls.min.js';
    s.onload = () => resolve(window.Hls);
    s.onerror = reject;
    document.head.append(s);
  });
  return hlsLoader;
}

async function playTrailer(button, trailer) {
  const video = document.createElement('video');
  video.className = 'trailer-video';
  video.controls = true;
  video.playsInline = true;
  if (trailer.poster) video.poster = trailer.poster;
  button.replaceWith(video);
  state.playing = true;
  try {
    if (video.canPlayType('application/vnd.apple.mpegurl') && trailer.hls) {
      video.src = trailer.hls;
    } else {
      const Hls = trailer.hls ? await loadHls() : null;
      if (Hls?.isSupported()) {
        hls?.destroy();
        hls = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 20 });
        hls.loadSource(trailer.hls);
        hls.attachMedia(video);
      } else if (trailer.preview) {
        video.src = trailer.preview;
      }
    }
    await video.play();
  } catch {
    /* autoplay can be refused; the controls are there */
  }
}

function stopTrailer() {
  hls?.destroy();
  hls = null;
  // Native HLS playback isn't tied to hls.js, so silence any video directly.
  for (const video of els.drawer.querySelectorAll('video')) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  state.playing = false;
}

// ---------------------------------------------------------------------------
// Lightbox for screenshots

let lightboxShots = [];
let lightboxIndex = 0;

function openLightbox(shots, index) {
  lightboxShots = shots;
  lightboxIndex = index;
  renderLightbox();
  els.lightbox.hidden = false;
}

function renderLightbox() {
  els.lightbox.innerHTML = `
    <button class="lb-close icon-btn" data-action="lightbox-close" aria-label="Close">${icon('close')}</button>
    <button class="lb-nav lb-prev icon-btn" data-action="lightbox-step" data-step="-1" aria-label="Previous">${icon('chevronLeft')}</button>
    <img src="${esc(lightboxShots[lightboxIndex])}" alt="Screenshot ${lightboxIndex + 1} of ${lightboxShots.length}" referrerpolicy="no-referrer">
    <button class="lb-nav lb-next icon-btn" data-action="lightbox-step" data-step="1" aria-label="Next">${icon('chevronRight')}</button>
    <span class="lb-count">${lightboxIndex + 1} / ${lightboxShots.length}</span>`;
}

function stepLightbox(step) {
  lightboxIndex = (lightboxIndex + step + lightboxShots.length) % lightboxShots.length;
  renderLightbox();
}

// ---------------------------------------------------------------------------
// Feedback

let toastTimer;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-on'), 2400);
}

// Star buttons are updated in place so long lists keep their scroll position.
function syncWatchState(id) {
  const watched = model.isWatched(id);
  for (const btn of document.querySelectorAll(`.star[data-id="${CSS.escape(id)}"]`)) {
    btn.classList.toggle('is-on', watched);
    btn.setAttribute('aria-pressed', watched);
    btn.title = watched ? 'Remove from watchlist' : 'Add to watchlist';
    btn.innerHTML = icon('star', { size: 16, filled: watched });
  }
  for (const el of document.querySelectorAll(`.card[data-game="${CSS.escape(id)}"]`)) {
    el.classList.toggle('is-watched', watched);
    if (!watched && model.filters.watchlistOnly) el.remove();
  }
}

// Ownership changes patch the page in place, keeping the open menu, the
// scroll position and any playing trailer as they were.
function patchCardOwnership(id) {
  const game = model.byId.get(id);
  for (const el of document.querySelectorAll(`.card[data-game="${CSS.escape(id)}"] .card-flags`)) {
    el.querySelector('.flag--owned')?.remove();
    const label = model.ownedLabel(game);
    if (label) el.insertAdjacentHTML('afterbegin', ownedFlag(label));
  }
}

function patchDetailOwnership(id) {
  const game = model.byId.get(id);
  const menu = els.drawer.querySelector('.own-menu');
  if (menu) {
    const wasOpen = menu.open;
    menu.outerHTML = ownMenu(game, model);
    if (wasOpen) els.drawer.querySelector('.own-menu').open = true;
  }
  const stores = els.drawer.querySelector('.store-section');
  if (stores) stores.outerHTML = storeSection(game, model.ownedOn(game));
}

// ---------------------------------------------------------------------------
// Steam library import

function openLibraryDialog() {
  const lib = model.steamLibrary;
  const enabled = Boolean(state.status?.steamImport);
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog';
  dialog.innerHTML = `<form class="dialog-body" method="dialog">
    <h2>${icon('library', { size: 20 })} Steam library</h2>
    <p>${
      lib
        ? `${lib.appids.length.toLocaleString()} games imported ${esc(timeAgo(lib.importedAt))}. Anything you own there is marked “Owned on Steam”.`
        : 'Import your Steam library and every game you own there is marked “Owned on Steam”.'
    }</p>
    ${
      enabled
        ? `<label class="field">
            <span>Steam profile link or SteamID</span>
            <input name="profile" required autocomplete="off" spellcheck="false" placeholder="https://steamcommunity.com/id/yourname" value="${esc(storage.get('launchday.steamProfile', ''))}">
          </label>
          <p class="muted">Your profile’s “Game details” must be set to Public in Steam’s privacy settings.</p>
          <p class="dialog-error" hidden></p>`
        : `<p>Steam only shares libraries through its Web API, which needs a free key:</p>
          <ol>
            <li>Get one at <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener noreferrer">steamcommunity.com/dev/apikey</a>.</li>
            <li>Set it as the <code>STEAM_API_KEY</code> environment variable and restart the server (the README shows how).</li>
          </ol>
          <p class="muted">Without it, mark games as owned from any game’s page with “I own this”.</p>`
    }
    <div class="dialog-actions">
      ${lib ? '<button type="button" class="btn btn--ghost" data-dialog="forget">Forget library</button>' : ''}
      <span class="filter-spacer"></span>
      <button type="button" class="btn" data-dialog="close">${enabled ? 'Cancel' : 'Close'}</button>
      ${enabled ? `<button type="submit" class="btn btn--primary">${lib ? 'Re-import' : 'Import'}</button>` : ''}
    </div>
  </form>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    const action = e.target.closest('[data-dialog]')?.dataset.dialog;
    if (action === 'close' || e.target === dialog) dialog.close();
    if (action === 'forget') {
      model.setSteamLibrary(null);
      toast('Steam library forgotten');
      dialog.close();
    }
  });
  dialog.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = dialog.querySelector('input[name="profile"]');
    const error = dialog.querySelector('.dialog-error');
    const submit = dialog.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Importing…';
    error.hidden = true;
    try {
      const res = await fetch(`/api/steam-library?profile=${encodeURIComponent(input.value.trim())}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Import failed.');
      storage.set('launchday.steamProfile', input.value.trim());
      model.setSteamLibrary(body);
      const matched = model.games.filter((g) => g.steam && model.steamOwned.has(g.steam.appid)).length;
      toast(`Imported ${body.appids.length.toLocaleString()} games; ${matched} on the calendar`);
      dialog.close();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = lib ? 'Re-import' : 'Import';
    }
  });
  dialog.showModal();
}

// ---------------------------------------------------------------------------
// Search

let searchActive = -1;

function renderSearch() {
  const q = els.search.value.trim();
  if (!q) {
    els.results.hidden = true;
    return;
  }
  const hits = model.search(q, 8);
  searchActive = hits.length ? 0 : -1;
  els.results.innerHTML = hits.length
    ? hits.map((g) => row(g, { watched: model.isWatched(g.id), owned: model.ownedLabel(g), showDate: true, today: localIso() })).join('')
    : `<p class="search-empty">No games match “${esc(q)}”.</p>`;
  highlightSearch();
  els.results.hidden = false;
}

function highlightSearch() {
  [...els.results.querySelectorAll('.row')].forEach((el, i) => el.classList.toggle('is-active', i === searchActive));
}

function closeSearch({ clear = false } = {}) {
  els.results.hidden = true;
  if (clear) els.search.value = '';
}

function chooseGame(id) {
  const game = model.byId.get(id);
  if (!game) return;
  if (state.view === 'calendar' && game.precision !== 'year') {
    const month = game.date.slice(0, 7);
    if (month !== state.month) {
      state.month = month;
      renderMain();
    }
  }
  openGame(id);
}

els.search.addEventListener('input', debounce(renderSearch, 70));
els.search.addEventListener('focus', () => els.search.value.trim() && renderSearch());
els.search.addEventListener('keydown', (e) => {
  const rows = els.results.querySelectorAll('.row');
  if (e.key === 'ArrowDown' && rows.length) {
    e.preventDefault();
    searchActive = (searchActive + 1) % rows.length;
    highlightSearch();
  } else if (e.key === 'ArrowUp' && rows.length) {
    e.preventDefault();
    searchActive = (searchActive - 1 + rows.length) % rows.length;
    highlightSearch();
  } else if (e.key === 'Enter' && searchActive >= 0 && rows[searchActive]) {
    e.preventDefault();
    chooseGame(rows[searchActive].dataset.game);
    closeSearch({ clear: true });
    els.search.blur();
  } else if (e.key === 'Escape') {
    closeSearch({ clear: true });
    els.search.blur();
  }
});

// ---------------------------------------------------------------------------
// Events

function currentGame() {
  const top = state.drawerStack.at(-1);
  return top?.type === 'game' ? model.byId.get(top.id) : null;
}

const actions = {
  view(el) {
    if (state.view === el.dataset.view) return;
    state.view = el.dataset.view;
    renderViewSwitch();
    renderMain();
    writeHash();
    window.scrollTo({ top: 0 });
  },
  theme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    storage.set('launchday.theme', next);
    applyTheme(next);
  },
  'prev-month'() {
    state.month = shiftMonth(state.month, -1);
    renderMain();
    writeHash();
  },
  'next-month'() {
    state.month = shiftMonth(state.month, 1);
    renderMain();
    writeHash();
  },
  today() {
    state.month = localIso().slice(0, 7);
    renderMain();
    writeHash();
  },
  'goto-month'(el) {
    state.month = el.dataset.month;
    renderMain();
    writeHash();
  },
  'open-day'(el) {
    openDay(el.dataset.day);
  },
  expand(el) {
    state.expanded.add(el.dataset.key);
    renderMain();
  },
  platform(el) {
    const key = el.dataset.key;
    const set = new Set(model.filters.platforms);
    if (!key) set.clear();
    else if (set.has(key)) set.delete(key);
    else set.add(key);
    model.setFilters({ platforms: [...set] });
  },
  'toggle-filters'() {
    state.filtersOpen = !state.filtersOpen;
    renderFilters();
  },
  'watchlist-only'() {
    model.setFilters({ watchlistOnly: !model.filters.watchlistOnly });
  },
  'steam-library'() {
    openLibraryDialog();
  },
  'reset-filters'() {
    model.resetFilters();
  },
  watch(el) {
    const id = el.dataset.id;
    const game = model.byId.get(id);
    const on = model.toggleWatch(id);
    toast(on ? `Watching ${game.title}` : `Removed ${game.title} from your watchlist`);
  },
  'ics-watchlist'() {
    const games = model.watchedGames().filter((g) => g.endDate >= localIso());
    if (!games.length) return toast('Nothing upcoming on your watchlist yet.');
    downloadIcs(games, 'launch-day-watchlist.ics', 'Launch Day watchlist');
    toast(`Exported ${games.length} release${games.length === 1 ? '' : 's'}`);
  },
  'ics-one'(el) {
    const game = model.byId.get(el.dataset.id);
    downloadIcs([game], `${game.id}.ics`, game.title);
    el.closest('details')?.removeAttribute('open');
  },
  async 'copy-link'(el) {
    const url = `${location.origin}${location.pathname}#game=${encodeURIComponent(el.dataset.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      prompt('Copy this link', url);
    }
  },
  'close-drawer'() {
    closeDrawer();
  },
  'drawer-back'() {
    state.drawerStack.pop();
    renderDrawer();
    writeHash();
  },
  'play-trailer'(el) {
    const game = currentGame();
    const trailer = game?.steam?.trailers?.[Number(el.dataset.index)];
    if (trailer) playTrailer(el, trailer);
  },
  lightbox(el) {
    const game = currentGame();
    if (game?.steam?.screenshots?.length) openLightbox(game.steam.screenshots, Number(el.dataset.index));
  },
  'lightbox-close'() {
    els.lightbox.hidden = true;
  },
  'lightbox-step'(el) {
    stepLightbox(Number(el.dataset.step));
  },
  async refresh() {
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const body = await res.json();
      toast(body.started ? 'Refreshing release data in the background' : 'A refresh ran recently; data is current');
      pollSoon();
    } catch {
      toast('Could not reach the server');
    }
  },
};

document.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl && actionEl.tagName !== 'INPUT' && actionEl.tagName !== 'SELECT' && !actionEl.disabled) {
    const fn = actions[actionEl.dataset.action];
    if (fn) {
      e.preventDefault();
      fn(actionEl, e);
      return;
    }
  }

  const gameEl = e.target.closest('[data-game]');
  if (gameEl) {
    const inSearch = els.results.contains(gameEl);
    if (inSearch) {
      chooseGame(gameEl.dataset.game);
      closeSearch({ clear: true });
      return;
    }
    openGame(gameEl.dataset.game, { fromDrawer: els.drawer.contains(gameEl) });
    return;
  }

  const day = e.target.closest('.day.has-games');
  if (day) {
    openDay(day.dataset.day);
    return;
  }

  if (!e.target.closest('.search')) closeSearch();
  if (e.target === els.scrim) closeDrawer();
  if (e.target === els.lightbox) els.lightbox.hidden = true;
  for (const menu of document.querySelectorAll('details.menu[open]')) {
    if (!menu.contains(e.target)) menu.removeAttribute('open');
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  switch (el.dataset.action) {
    case 'genre':
      model.setFilters({ genre: el.value });
      break;
    case 'toggle-filter':
      model.setFilters({ [el.dataset.key]: el.checked });
      break;
    case 'own':
      model.setOwned(el.dataset.id, el.dataset.key, el.checked);
      break;
    case 'toggle-recent':
      state.showRecent = el.checked;
      storage.set('launchday.showRecent', state.showRecent);
      renderMain();
      break;
    default:
  }
});

const typing = (target) => target.closest('input, textarea, select, [contenteditable="true"]');

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return; // the dialog handles its own keys
  if (!els.lightbox.hidden) {
    if (e.key === 'Escape') els.lightbox.hidden = true;
    if (e.key === 'ArrowLeft') stepLightbox(-1);
    if (e.key === 'ArrowRight') stepLightbox(1);
    return;
  }
  if (e.key === 'Escape') {
    if (state.drawerStack.length) closeDrawer();
    return;
  }
  if (typing(e.target)) return;
  if (e.key === '/') {
    e.preventDefault();
    els.search.focus();
  } else if (e.key === 'Enter' && e.target.matches('.card[data-game]')) {
    openGame(e.target.dataset.game);
  } else if (!state.drawerStack.length && state.view === 'calendar') {
    if (e.key === 'ArrowLeft') actions['prev-month']();
    else if (e.key === 'ArrowRight') actions['next-month']();
    else if (e.key === 't') actions.today();
  }
});

// Broken artwork falls back to the monogram tile underneath it.
document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    if (img.classList.contains('art-img')) img.closest('.art')?.classList.remove('art--portrait');
    if (img.closest('.hero')) img.closest('.hero').classList.add('hero--empty');
    img.remove();
  },
  true,
);

window.addEventListener('hashchange', () => {
  readHash();
  renderViewSwitch();
  renderMain();
  renderDrawer();
});

model.onChange((reason, id) => {
  if (!state.ready) return;
  if (reason === 'filters') {
    renderFilters();
    renderMain();
    if (state.drawerStack.at(-1)?.type === 'day') renderDrawer();
    window.scrollTo({ top: Math.min(window.scrollY, els.filters.offsetTop) });
  } else if (reason === 'watchlist') {
    renderFilters();
    if (state.view === 'calendar') renderMain();
    else syncWatchState(id);
    const top = state.drawerStack.at(-1);
    if (top?.type === 'day') renderDrawer();
    else if (top?.type === 'game') {
      // Patch the button rather than re-render, so a playing trailer keeps playing.
      const btn = els.drawer.querySelector('.detail-actions [data-action="watch"]');
      const game = model.byId.get(top.id);
      if (btn && game) btn.outerHTML = watchButton(game, model.isWatched(game.id));
    }
  } else if (reason === 'owned') {
    renderFilters();
    if (!id || state.view === 'calendar' || model.filters.hideOwned) renderMain();
    else patchCardOwnership(id);
    const top = state.drawerStack.at(-1);
    if (top?.type === 'day') renderDrawer();
    else if (top?.type === 'game') patchDetailOwnership(top.id);
    if (!els.results.hidden) renderSearch();
  } else if (reason === 'data') {
    renderFilters();
    // Don't yank a long list out from under someone scrolling it.
    if (state.view === 'calendar' || window.scrollY < 400) renderMain();
    if (!state.playing) renderDrawer();
    renderFooter();
  }
});

// ---------------------------------------------------------------------------
// Data loading and live status

let pollTimer;
let lastLoad = 0;

async function pollStatus() {
  clearTimeout(pollTimer);
  try {
    state.status = await fetch('/api/status').then((r) => r.json());
    renderProgress();
    renderFooter();
    const stale = state.status.etag && state.status.etag !== model.etag;
    const minGap = state.status.building ? 12000 : 0;
    if (stale && Date.now() - lastLoad > minGap) {
      lastLoad = Date.now();
      const first = !model.data;
      const result = await model.load();
      if (result === 'ok' && first) {
        readHash();
        renderAll();
      }
    } else if (!model.data) {
      renderLoading('Building the release calendar');
    }
  } catch {
    if (!model.data) renderLoading('Waiting for the server');
  }
  pollTimer = setTimeout(pollStatus, state.status?.building || !model.data ? 2500 : 60000);
}

function pollSoon() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(pollStatus, 800);
}

async function start() {
  renderViewSwitch();
  renderLoading('Loading releases');
  try {
    const result = await model.load();
    lastLoad = Date.now();
    if (result === 'ok') {
      readHash();
      renderAll();
    }
  } catch (err) {
    renderLoading(err.message);
  }
  pollStatus();
}

start();
