// Small HTML builders shared by every view.
import { PLATFORMS } from './catalog.js';
import { icon } from './icons.js';
import { criticScore, scoreTier, compactNumber } from './rank.js';
import { esc, initials, dateLabel, daysBetween, localIso, relativeDays, parseIso, fmt } from './util.js';

const COMPACT_ORDER = ['pc', 'ps5', 'ps4', 'xsx', 'xone', 'switch2', 'switch', 'psvr', 'quest', 'consoles'];

// Artwork with graceful fallbacks: landscape art fills the frame, portrait
// covers sit on a blurred copy of themselves, and games without any art get
// a generated monogram tile.
export function art(game, { prefer = 'banner', cls = '' } = {}) {
  const landscape = prefer === 'banner' ? game.banner : null;
  const src = prefer === 'cover' ? game.cover || game.banner : landscape || game.cover;
  const portrait = src && src === game.cover && prefer !== 'cover';
  const placeholder = `<div class="art-ph"><span>${esc(initials(game.title))}</span></div>`;
  if (!src) return `<div class="art ${cls}" style="--h:${game.hue}">${placeholder}</div>`;
  return `<div class="art ${portrait ? 'art--portrait' : ''} ${cls}" style="--h:${game.hue};${portrait ? `--img:url('${esc(src)}')` : ''}">
    ${placeholder}<img class="art-img" src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
  </div>`;
}

export function platformBadges(game, { compact = true } = {}) {
  let keys = game.platforms;
  if (compact) keys = COMPACT_ORDER.filter((k) => keys.includes(k));
  if (!keys.length) return '<span class="badge badge--muted">Platforms TBA</span>';
  return keys
    .map((k) => {
      const p = PLATFORMS[k] || { short: k, label: k, family: 'other' };
      return `<span class="badge badge--${p.family}" title="${esc(p.label)}">${esc(compact ? p.short : p.label)}</span>`;
    })
    .join('');
}

export function starButton(game, watched, { cls = '' } = {}) {
  return `<button class="star ${watched ? 'is-on' : ''} ${cls}" data-action="watch" data-id="${esc(game.id)}"
    aria-pressed="${watched}" title="${watched ? 'Remove from watchlist' : 'Add to watchlist'}">${icon('star', { size: 16, filled: watched })}</button>`;
}

export function countdown(game, today = localIso()) {
  if (game.precision !== 'day') return '';
  return relativeDays(daysBetween(today, game.date));
}

export function dateChip(game) {
  if (game.precision !== 'day') {
    return `<span class="date-chip date-chip--tba">${esc(dateLabel(game))}</span>`;
  }
  const d = parseIso(game.date);
  return `<span class="date-chip"><b>${esc(fmt.monthShort.format(d))}</b><i>${d.getDate()}</i></span>`;
}

const CHANGE_LABELS = {
  delayed: 'Delayed',
  'moved-up': 'Moved up',
  dated: 'Date announced',
  changed: 'Date changed',
};

export function changeBadge(game, { withinDays = 45 } = {}) {
  const change = game.dateChange;
  if (!change || Date.now() - Date.parse(change.at) > withinDays * 86400000) return '';
  const was = dateLabel({ ...change.from, date: change.from.date }, 'short');
  return `<span class="flag flag--${esc(change.kind)}" title="Previously ${esc(was)}">${esc(CHANGE_LABELS[change.kind] || 'Changed')}</span>`;
}

export function newBadge(game, { withinDays = 7 } = {}) {
  if (!game.firstSeen || Date.now() - Date.parse(game.firstSeen) > withinDays * 86400000) return '';
  return '<span class="flag flag--new">New</span>';
}

// Critic score (Metacritic, else OpenCritic) or, failing that, Steam user score.
export function reviewChip(game) {
  const critic = criticScore(game);
  if (critic != null) {
    const source = game.critic.metacritic != null ? 'Metacritic' : 'OpenCritic';
    const note = game.critic.inherited ? ', original release' : '';
    return `<span class="score score--${scoreTier(critic)}" title="${source} ${critic}${note}">${critic}</span>`;
  }
  const r = game.steam?.reviews;
  if (r && r.count >= 10) {
    return `<span class="steam-score steam-score--${scoreTier(r.percent)}" title="Steam user reviews: ${esc(r.label)}, ${r.percent}% of ${r.count.toLocaleString()} positive">${icon('thumb', { size: 12 })}${r.percent}%</span>`;
  }
  return '';
}

export function hypeTitle(game) {
  const h = game.hype;
  if (!h) return '';
  const parts = [];
  if (h.views) parts.push(`${compactNumber(h.views)} Wikipedia views in 30 days${h.viewsInherited ? ' (original game)' : ''}`);
  if (h.followers) parts.push(`${compactNumber(h.followers)} Steam followers${h.followersInherited ? ' (PC edition)' : ''}`);
  return parts.join(', ');
}

export function hypeMeter(game) {
  if (!game.hypeLevel) return '';
  const flames = Array.from({ length: 3 }, (_, i) =>
    `<i class="${i < game.hypeLevel ? 'on' : ''}">${icon('flame', { size: 12 })}</i>`,
  ).join('');
  return `<span class="hype hype--${game.hypeLevel}" title="Hype: ${esc(hypeTitle(game))}">${flames}</span>`;
}

// Hype for what's coming, reviews for what's out.
export function mediaTags(game, today = localIso()) {
  const upcoming = game.endDate >= today;
  const tags = upcoming ? hypeMeter(game) + reviewChip(game) : reviewChip(game) || hypeMeter(game);
  return tags ? `<div class="media-tags">${tags}</div>` : '';
}

export function ownedFlag(label) {
  return label ? `<span class="flag flag--owned" title="${esc(label)}">${icon('check', { size: 11 })}${esc(label)}</span>` : '';
}

export function metaLine(game) {
  const parts = [];
  if (game.genres.length) parts.push(game.genres.slice(0, 2).join(', '));
  const studio = game.developers[0] || game.publishers[0];
  if (studio) parts.push(studio);
  return parts.map(esc).join(' <span class="dot">·</span> ');
}

// The main release card used in lists and grids.
export function card(game, { watched, today, owned, showDate = true } = {}) {
  const desc = game.summary || game.blurb || '';
  const cd = countdown(game, today);
  return `<article class="card ${watched ? 'is-watched' : ''}" data-game="${esc(game.id)}" tabindex="0">
    <div class="card-media">
      ${art(game)}
      ${showDate ? dateChip(game) : ''}
      ${starButton(game, watched, { cls: 'star--float' })}
      ${mediaTags(game, today)}
    </div>
    <div class="card-body">
      <div class="card-flags">${ownedFlag(owned)}${changeBadge(game)}${newBadge(game)}${game.region ? `<span class="flag flag--region">${esc(game.region)}</span>` : ''}</div>
      <h3 class="card-title">${esc(game.title)}</h3>
      <div class="card-meta">${metaLine(game)}</div>
      ${desc ? `<p class="card-desc">${esc(desc)}</p>` : ''}
      <div class="card-foot">
        <div class="badges">${platformBadges(game)}</div>
        ${cd ? `<span class="countdown">${esc(cd)}</span>` : ''}
      </div>
    </div>
  </article>`;
}

// A one-line row for dense lists (day sheet, search results).
export function row(game, { watched, showDate = false, today, owned } = {}) {
  const thumb = game.thumb || game.art;
  return `<button class="row ${watched ? 'is-watched' : ''}" data-game="${esc(game.id)}">
    <span class="row-thumb" style="--h:${game.hue}">${
      thumb
        ? `<img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : `<span>${esc(initials(game.title))}</span>`
    }</span>
    <span class="row-main">
      <span class="row-title">${watched ? icon('star', { size: 13, filled: true, cls: 'row-star' }) : ''}${esc(game.title)}${
        game.region ? ` <span class="flag flag--region">${esc(game.region)}</span>` : ''
      }</span>
      <span class="row-meta">${owned ? `<span class="row-owned">${esc(owned)}</span> <span class="dot">·</span> ` : ''}${showDate ? `${esc(dateLabel(game, 'medium'))} <span class="dot">·</span> ` : ''}${metaLine(game)}</span>
    </span>
    <span class="row-side">
      <span class="row-tags">${hypeMeter(game)}${reviewChip(game)}</span>
      <span class="badges">${platformBadges(game)}</span>
      ${showDate && game.precision === 'day' ? `<span class="countdown">${esc(countdown(game, today))}</span>` : ''}
    </span>
  </button>`;
}
