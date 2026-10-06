import * as cheerio from 'cheerio';
import { fetchJson } from './http.js';
import { expandTable, cellText, isHeaderRow } from './wikitable.js';
import { parsePlatforms } from './platforms.js';
import { parseReleaseDate } from './dates.js';
import { normalizeTitle, similarity } from './text.js';

const API = 'https://en.wikipedia.org/w/api.php';

export function releaseListTitle(year) {
  return `List of video games released in ${year}`;
}

// Returns the rendered HTML of a yearly release list, or null if the page
// does not exist yet (Wikipedia usually opens next year's list mid-year).
export async function fetchReleaseListHtml(year) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    action: 'parse',
    page: releaseListTitle(year),
    prop: 'text|revid',
    format: 'json',
    formatversion: '2',
    redirects: '1',
  });
  const data = await fetchJson(url);
  if (!data || data.error || !data.parse) return null;
  return { html: data.parse.text, revid: data.parse.revid };
}

const TYPE_WORDS = [
  ['full release', 'Full release'],
  ['early access', 'Early access'],
  ['original', 'Original'],
  ['port', 'Port'],
  ['compilation', 'Compilation'],
  ['remaster', 'Remaster'],
  ['remake', 'Remake'],
  ['expansion', 'Expansion'],
  ['rerelease', 'Rerelease'],
  ['re-release', 'Rerelease'],
  ['episod', 'Episodic'],
  ['limited', 'Limited'],
];

function parseTypes(text) {
  const lower = text.toLowerCase();
  const out = [];
  for (const [needle, label] of TYPE_WORDS) {
    if (lower.includes(needle) && !out.includes(label)) out.push(label);
  }
  return out;
}

function splitList(text) {
  if (!text || /^(unknown|tba|n\/a|—|-)$/i.test(text)) return [];
  const parts = text.split(/\s*,\s*(?![^()]*\))/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}

const REGION_SUFFIX = /\s*\(((?:[A-Z]{2,3})(?:\s*[/,]\s*[A-Z]{2,3})*)\)\s*$/;

export function splitTitleAndRegion(text) {
  const match = text.match(REGION_SUFFIX);
  if (!match) return { title: text.trim(), region: null };
  return {
    title: text.slice(0, match.index).trim(),
    region: match[1].replace(/\s+/g, ''),
  };
}

// Finds the article a title cell links to, but only when the link is the
// game itself. Cells often link a series page or a section of a related
// article ("MXGP 26" -> the MXGP series), which would give the wrong summary.
function articleFromCell($, cell, title) {
  const links = $(cell).find('a[href^="/wiki/"]').toArray();
  if (links.length !== 1) return null;
  const a = $(links[0]);
  const href = a.attr('href');
  if (!href || href.includes('#') || /^\/wiki\/(File|Special|Help|Wikipedia|Category):/i.test(href)) {
    return null;
  }
  const linkText = a.text().replace(/\s+/g, ' ').trim().toLowerCase();
  if (linkText !== title.toLowerCase()) return null;
  const target = decodeURIComponent(href.slice('/wiki/'.length)).replace(/_/g, ' ');
  // Piped links can point somewhere else entirely (a studio's previous game),
  // so the target itself must also look like the title, minus "(video game)".
  const bare = target.replace(/\s*\([^)]*\)$/, '');
  if (normalizeTitle(bare) !== normalizeTitle(title) && similarity(bare, title) < 0.85) return null;
  return target;
}

const HEADER_KEYS = [
  ['date', /release date|approximate date|^date/i],
  ['title', /^title/i],
  ['platforms', /platform/i],
  ['types', /^type/i],
  ['genres', /genre/i],
  ['developers', /developer/i],
  ['publishers', /publisher/i],
];

function mapHeaders($, headerRow) {
  const index = {};
  headerRow.forEach((cell, i) => {
    const text = cellText($, cell);
    for (const [key, re] of HEADER_KEYS) {
      if (index[key] === undefined && re.test(text)) index[key] = i;
    }
  });
  return index;
}

// Parses every release table on a yearly list page into plain entries.
export function parseReleaseList(html, year) {
  const $ = cheerio.load(html);
  const entries = [];

  $('table.wikitable').each((_, table) => {
    const grid = expandTable($, table);
    const headerAt = grid.findIndex((row) => isHeaderRow($, row));
    if (headerAt === -1) return;
    const cols = mapHeaders($, grid[headerAt]);
    if (cols.title === undefined || cols.date === undefined) return;
    const scheduled = cols.date < cols.title; // dated tables lead with the date column

    for (const row of grid.slice(headerAt + 1)) {
      if (isHeaderRow($, row)) continue;
      const titleCell = row[cols.title];
      if (!titleCell || titleCell === row[cols.date]) continue; // full-width note rows

      const { title, region } = splitTitleAndRegion(cellText($, titleCell));
      if (!title || /^(unknown|tba)$/i.test(title)) continue;

      const get = (key) => (cols[key] === undefined ? '' : cellText($, row[cols[key]]));
      const dateText = get('date');

      entries.push({
        title,
        region,
        article: articleFromCell($, titleCell, title),
        dateText,
        scheduled,
        ...parseReleaseDate(dateText, year),
        platforms: parsePlatforms(get('platforms')),
        types: parseTypes(get('types')),
        genres: splitList(get('genres')),
        developers: splitList(get('developers')),
        publishers: splitList(get('publishers')),
        sourceYear: year,
      });
    }
  });

  return entries;
}
