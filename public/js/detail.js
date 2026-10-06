// The side drawer: a full game page, or every release on one day.
import { PLATFORMS, storeLinks, infoLinks, fallbackDescription } from './catalog.js';
import { art, platformBadges, countdown, changeBadge, newBadge, row, hypeMeter } from './components.js';
import { attention, scoreTier, compactNumber } from './rank.js';
import { googleCalendarUrl } from './ics.js';
import { icon } from './icons.js';
import { esc, dateLabel, fmt, parseIso, localIso, daysBetween, relativeDays } from './util.js';

function topBar(ctx, title = '') {
  const canGoBack = ctx.state.drawerStack.length > 1;
  return `<div class="drawer-top">
    ${canGoBack ? `<button class="icon-btn" data-action="drawer-back" aria-label="Back">${icon('back')}</button>` : '<span></span>'}
    <span class="drawer-top-title">${esc(title)}</span>
    <button class="icon-btn" data-action="close-drawer" aria-label="Close (Esc)" title="Close (Esc)">${icon('close')}</button>
  </div>`;
}

export function storeSection(game, owned) {
  const links = storeLinks(game, owned);
  if (!links.length) return '';
  return `<section class="detail-section store-section">
    <h3>Where to get it</h3>
    <div class="store-list">
      ${links
        .map(
          (l) => `<a class="store store--${l.key} ${l.owned ? 'is-owned' : ''}" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
            <span class="store-mark"></span>
            <span class="store-text">
              <span class="store-name">${esc(l.store)}</span>
              <span class="store-note">${l.exact ? 'Store page' : 'Search the store'}${l.note ? ` <span class="dot">·</span> ${esc(l.note)}` : ''}</span>
            </span>
            ${icon('external', { size: 15, cls: 'store-go' })}
          </a>`,
        )
        .join('')}
    </div>
  </section>`;
}

function reviewBox({ name, kind, score, display, url, tier }) {
  const tag = url ? 'a' : 'div';
  const attrs = url ? ` href="${esc(url)}" target="_blank" rel="noopener noreferrer"` : '';
  return `<${tag} class="review"${attrs}>
    <span class="review-score review-score--${tier}">${esc(display ?? score)}</span>
    <span class="review-text"><b>${esc(name)}</b><span>${esc(kind)}</span></span>
    ${url ? icon('external', { size: 14, cls: 'store-go' }) : ''}
  </${tag}>`;
}

function reviewsSection(game) {
  const c = game.critic;
  const r = game.steam?.reviews;
  if (!c && !r) return '';
  const q = encodeURIComponent(game.title);
  const boxes = [];
  if (c?.metacritic != null) {
    boxes.push(reviewBox({
      name: 'Metacritic', kind: 'Critic score', score: c.metacritic, tier: scoreTier(c.metacritic),
      url: c.metacriticUrl || `https://www.metacritic.com/search/${q}/?category=13`,
    }));
  }
  if (c?.opencritic != null || c?.opencriticRecommend != null) {
    const avg = c.opencritic != null;
    const value = avg ? c.opencritic : c.opencriticRecommend;
    boxes.push(reviewBox({
      name: 'OpenCritic', kind: avg ? 'Top critic average' : 'Critics recommend', score: value,
      display: avg ? value : `${value}%`, tier: scoreTier(value), url: c.opencriticUrl,
    }));
  }
  if (r) {
    boxes.push(reviewBox({
      name: 'Steam users', kind: `${r.label}, ${compactNumber(r.count)} reviews`, score: r.percent,
      display: `${r.percent}%`, tier: scoreTier(r.percent), url: `${game.steam.url}#app_reviews_hash`,
    }));
  }
  const notes = [];
  if (c?.inherited) notes.push('Critic scores are from the original release.');
  if (r && !game.platforms.some((p) => ['pc', 'mac', 'linux'].includes(p))) notes.push('Steam reviews are for the PC edition.');
  return `<section class="detail-section">
    <h3>Reviews</h3>
    <div class="review-list">${boxes.join('')}</div>
    ${notes.length ? `<p class="detail-note">${esc(notes.join(' '))}</p>` : ''}
  </section>`;
}

function hypeSection(game) {
  const h = game.hype;
  if (!h || !attention(game)) return '';
  const lines = [];
  if (h.views) {
    lines.push(`<li><b>${compactNumber(h.views)}</b> Wikipedia page views in the last 30 days${h.viewsInherited ? ' <span class="muted">(article on the original game)</span>' : ''}</li>`);
  }
  if (h.followers) {
    lines.push(`<li><b>${compactNumber(h.followers)}</b> followers on Steam${h.followersInherited ? ' <span class="muted">(PC edition)</span>' : ''}</li>`);
  }
  return `<section class="detail-section">
    <h3>Hype</h3>
    <div class="hype-block">
      ${hypeMeter(game) || '<span class="hype hype--0"></span>'}
      <ul>${lines.join('')}</ul>
    </div>
  </section>`;
}

const OWN_ORDER = ['pc', 'ps5', 'ps4', 'xsx', 'xone', 'switch2', 'switch', 'psvr', 'quest'];

export function ownMenu(game, model) {
  const mine = model.ownedOn(game);
  const pcLike = game.steam || game.platforms.some((p) => ['pc', 'mac', 'linux'].includes(p));
  let options = OWN_ORDER.filter((k) => game.platforms.includes(k) || (k === 'pc' && pcLike));
  if (!options.length) options = ['pc', 'ps5', 'xsx', 'switch2'];
  const label = model.ownedLabel(game);
  return `<details class="menu own-menu">
    <summary class="btn ${label ? 'btn--owned' : ''}">${icon(label ? 'check' : 'library', { size: 16 })}<span>${esc(label || 'I own this')}</span>${icon('chevronDown', { size: 14 })}</summary>
    <div class="menu-list">
      <p class="menu-note">Which platforms do you own it on?</p>
      ${options
        .map(
          (k) => `<label class="menu-check">
            <input type="checkbox" data-action="own" data-id="${esc(game.id)}" data-key="${k}" ${mine.includes(k) ? 'checked' : ''}>
            <span class="menu-box">${icon('check', { size: 12 })}</span>
            <span>${esc(k === 'pc' ? 'PC' : PLATFORMS[k]?.label || k)}</span>
          </label>`,
        )
        .join('')}
      ${mine.includes('steam') ? `<p class="menu-note">${icon('check', { size: 12 })} In your imported Steam library</p>` : ''}
    </div>
  </details>`;
}

function trailerSection(game) {
  const trailers = game.steam?.trailers || [];
  if (!trailers.length) {
    return `<section class="detail-section">
      <h3>Trailer</h3>
      <a class="trailer trailer--empty" href="https://www.youtube.com/results?search_query=${encodeURIComponent(`${game.title} trailer`)}" target="_blank" rel="noopener noreferrer" style="--h:${game.hue}">
        <span class="trailer-play">${icon('play', { size: 22 })}</span>
        <span class="trailer-name">Search YouTube for trailers</span>
      </a>
    </section>`;
  }
  return `<section class="detail-section">
    <h3>Trailer${trailers.length > 1 ? 's' : ''}</h3>
    <div class="trailers">
      ${trailers
        .map(
          (t, i) => `<button class="trailer" data-action="play-trailer" data-index="${i}" style="--h:${game.hue}">
            ${t.poster ? `<img src="${esc(t.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
            <span class="trailer-play">${icon('play', { size: 22 })}</span>
            <span class="trailer-name">${esc(t.name)}</span>
          </button>`,
        )
        .join('')}
    </div>
  </section>`;
}

function aboutSection(game) {
  const parts = [];
  if (game.summary) parts.push(`<p>${esc(game.summary)}</p>`);
  if (game.blurb && game.blurb !== game.summary) {
    parts.push(
      game.summary
        ? `<blockquote class="blurb"><p>${esc(game.blurb)}</p><cite>From the Steam store page</cite></blockquote>`
        : `<p>${esc(game.blurb)}</p>`,
    );
  }
  if (!parts.length) {
    parts.push(`<p>${esc(fallbackDescription(game))}</p>`);
    parts.push('<p class="muted">No store page or encyclopedia entry describes this one yet.</p>');
  }
  return `<section class="detail-section about"><h3>About</h3>${parts.join('')}</section>`;
}

function screenshotSection(game) {
  const shots = game.steam?.screenshots || [];
  if (!shots.length) return '';
  return `<section class="detail-section">
    <h3>Screenshots</h3>
    <div class="shots">
      ${shots
        .map(
          (src, i) => `<button class="shot" data-action="lightbox" data-index="${i}">
            <img src="${esc(src.replace(/\.jpg(\?|$)/, '.600x338.jpg$1'))}" data-full="${esc(src)}" alt="Screenshot ${i + 1}" loading="lazy" referrerpolicy="no-referrer">
          </button>`,
        )
        .join('')}
    </div>
  </section>`;
}

function factsSection(game) {
  const facts = [];
  const add = (label, value) => value && facts.push(`<dt>${esc(label)}</dt><dd>${value}</dd>`);
  add('Platforms', game.platforms.map((p) => esc(PLATFORMS[p]?.label || p)).join(', ') || 'To be announced');
  add('Genre', esc(game.genres.join(', ')));
  add('Release type', esc(game.types.join(', ')));
  add('Developer', esc(game.developers.join(', ')));
  add('Publisher', esc(game.publishers.join(', ')));
  if (game.region) add('Region', esc(regionName(game.region)));
  if (game.steam?.deck) add('Steam Deck', esc(game.steam.deck));
  if (game.steam?.earlyAccess) add('Steam status', 'Early access');
  return `<section class="detail-section"><h3>Details</h3><dl class="facts">${facts.join('')}</dl></section>`;
}

const REGIONS = { WW: 'Worldwide', JP: 'Japan', NA: 'North America', EU: 'Europe', PAL: 'PAL regions', CN: 'China', KR: 'South Korea', AS: 'Asia', TW: 'Taiwan', HK: 'Hong Kong' };
function regionName(code) {
  return code.split('/').map((c) => REGIONS[c] || c).join(', ');
}

function dateBlock(game) {
  const today = localIso();
  const label = dateLabel(game, 'long');
  let rel = '';
  if (game.precision === 'day') rel = countdown(game, today);
  else if (game.endDate < today) rel = 'Window has passed without a date';
  const change = game.dateChange;
  const changeNote = change
    ? `<p class="detail-change">${icon('alert', { size: 14 })} ${
        change.kind === 'dated' ? 'Narrowed from' : 'Previously'
      } ${esc(dateLabel({ ...change.from }, 'medium'))}, changed ${esc(fmt.short.format(new Date(change.at)))}</p>`
    : '';
  return `<p class="detail-date">${icon('calendar', { size: 16 })}<span>${esc(label)}</span>${
    rel ? `<span class="countdown">${esc(rel)}</span>` : ''
  }</p>${changeNote}`;
}

export function watchButton(game, watched) {
  return `<button class="btn ${watched ? 'btn--on' : 'btn--primary'}" data-action="watch" data-id="${esc(game.id)}" aria-pressed="${watched}">
    ${icon('star', { size: 16, filled: watched })}<span>${watched ? 'On your watchlist' : 'Add to watchlist'}</span>
  </button>`;
}

export function renderGameDetail(game, ctx) {
  const { model } = ctx;
  const watched = model.isWatched(game.id);
  const released = game.precision === 'day' && game.date <= localIso();
  const heroSrc = game.hero || game.banner || game.cover;
  const typeFlags = game.types
    .filter((t) => t !== 'Original')
    .map((t) => `<span class="flag flag--type">${esc(t)}</span>`)
    .join('');

  return `
    ${topBar(ctx)}
    <div class="detail">
      <div class="hero ${heroSrc ? '' : 'hero--empty'} ${!game.hero && !game.banner ? 'hero--blur' : ''}" style="--h:${game.hue}">
        ${heroSrc ? `<img src="${esc(heroSrc)}" alt="" referrerpolicy="no-referrer">` : ''}
      </div>
      <div class="detail-head">
        <div class="detail-cover">${art(game, { prefer: 'cover', cls: 'art--cover' })}</div>
        <div class="detail-heading">
          <div class="card-flags">${changeBadge(game)}${newBadge(game)}${typeFlags}${game.region ? `<span class="flag flag--region">${esc(game.region)}</span>` : ''}</div>
          <h2 class="detail-title">${esc(game.title)}</h2>
          ${game.tagline ? `<p class="detail-tagline">${esc(game.tagline)}</p>` : ''}
        </div>
      </div>
      <div class="detail-body">
        ${dateBlock(game)}
        <div class="badges badges--wide">${platformBadges(game, { compact: false })}</div>
        <div class="detail-actions">
          ${watchButton(game, watched)}
          <details class="menu">
            <summary class="btn">${icon('calendarPlus', { size: 16 })}<span>Add to calendar</span>${icon('chevronDown', { size: 14 })}</summary>
            <div class="menu-list">
              <a href="${esc(googleCalendarUrl(game))}" target="_blank" rel="noopener noreferrer">Google Calendar</a>
              <button data-action="ics-one" data-id="${esc(game.id)}">Download .ics (Apple, Outlook)</button>
            </div>
          </details>
          ${ownMenu(game, model)}
          <button class="btn btn--icon" data-action="copy-link" data-id="${esc(game.id)}" title="Copy a link to this game">${icon('link', { size: 16 })}</button>
        </div>
        ${storeSection(game, model.ownedOn(game))}
        ${released ? reviewsSection(game) + hypeSection(game) : hypeSection(game) + reviewsSection(game)}
        ${aboutSection(game)}
        ${trailerSection(game)}
        ${screenshotSection(game)}
        ${factsSection(game)}
        <section class="detail-section">
          <h3>More</h3>
          <div class="link-list">
            ${infoLinks(game)
              .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ${icon('external', { size: 13 })}</a>`)
              .join('')}
          </div>
        </section>
        <p class="detail-source">Listed on Wikipedia's <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(game.source.replace(/ /g, '_'))}" target="_blank" rel="noopener noreferrer">${esc(game.source)}</a>${
          game.steam ? ', with store details from Steam' : ''
        }.</p>
      </div>
    </div>`;
}

export function renderDayList(day, ctx) {
  const { model } = ctx;
  const games = model.rank(model.filtered().filter((g) => g.precision === 'day' && g.date === day));
  const today = localIso();
  const n = daysBetween(today, day);
  return `
    ${topBar(ctx)}
    <div class="day-sheet">
      <header class="day-sheet-head">
        <h2>${esc(fmt.long.format(parseIso(day)))}</h2>
        <p>${games.length} release${games.length === 1 ? '' : 's'} <span class="dot">·</span> ${esc(relativeDays(n))}</p>
      </header>
      ${
        games.length
          ? `<div class="rows">${games.map((g) => row(g, { watched: model.isWatched(g.id), owned: model.ownedLabel(g) })).join('')}</div>`
          : '<div class="empty empty--small"><p>No releases match your filters on this day.</p></div>'
      }
    </div>`;
}
