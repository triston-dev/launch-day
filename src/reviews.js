// Critic scores, read from the "Video game reviews" template that Wikipedia
// game articles carry in their Reception section. Editors cite Metacritic and
// OpenCritic there, links included.
import { fetchJson } from './http.js';

const API = 'https://en.wikipedia.org/w/api.php';
const BATCH = 20;

// Returns the full {{Video game reviews ...}} call, braces balanced, or null.
function findTemplate(wikitext) {
  const start = wikitext.search(/\{\{\s*video game reviews/i);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < wikitext.length - 1; i++) {
    const pair = wikitext.slice(i, i + 2);
    if (pair === '{{') {
      depth += 1;
      i += 1;
    } else if (pair === '}}') {
      depth -= 1;
      i += 1;
      if (depth === 0) return wikitext.slice(start, i + 1);
    }
  }
  return null;
}

// Splits a template call into its named parameters, ignoring pipes that sit
// inside nested templates, links or refs.
function templateParams(template) {
  const params = {};
  const inner = template.slice(2, -2);
  let depth = 0;
  let current = '';
  const parts = [];
  for (let i = 0; i < inner.length; i++) {
    const pair = inner.slice(i, i + 2);
    if (pair === '{{' || pair === '[[') {
      depth += 1;
      current += pair;
      i += 1;
    } else if ((pair === '}}' || pair === ']]') && depth > 0) {
      depth -= 1;
      current += pair;
      i += 1;
    } else if (inner[i] === '|' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += inner[i];
    }
  }
  parts.push(current);
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    params[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1).trim();
  }
  return params;
}

const stripRefs = (text) =>
  text.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');

function average(numbers) {
  return numbers.length ? Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length) : null;
}

export function parseReviewScores(wikitext) {
  const template = findTemplate(String(wikitext || ''));
  if (!template) return null;
  const params = templateParams(template);
  const out = {};

  if (params.MC) {
    const shown = stripRefs(params.MC);
    const scores = [...shown.matchAll(/(\d{1,3})\s*\/\s*100/g)].map((m) => Number(m[1])).filter((n) => n <= 100);
    if (scores.length) {
      out.metacritic = average(scores);
      const link = params.MC.match(/https?:\/\/www\.metacritic\.com\/game\/[a-z0-9-]+/i);
      if (link) out.metacriticUrl = `${link[0]}/`;
    }
  }

  if (params.OC) {
    const shown = stripRefs(params.OC);
    const recommend = shown.match(/(\d{1,3})\s*%\s*recommend/i);
    const score = shown.match(/(\d{1,3})\s*\/\s*100/);
    if (recommend) out.opencriticRecommend = Number(recommend[1]);
    if (score) out.opencritic = Number(score[1]);
    const link = params.OC.match(/https?:\/\/(?:www\.)?opencritic\.com\/game\/\d+\/[a-z0-9-]+/i);
    if ((recommend || score) && link) out.opencriticUrl = link[0];
  }

  return Object.keys(out).length ? out : null;
}

// Fetches article wikitext in batches and extracts review scores.
// Returns Map(title -> scores | null).
export async function fetchCriticScores(titles) {
  const results = new Map();
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    const url = new URL(API);
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: chunk.join('|'),
    });
    const data = await fetchJson(url, { timeoutMs: 60000 });
    const normalized = new Map((data?.query?.normalized || []).map((n) => [n.to, n.from]));
    for (const page of data?.query?.pages || []) {
      const requested = normalized.get(page.title) || page.title;
      const text = page.revisions?.[0]?.slots?.main?.content;
      results.set(requested, text ? parseReviewScores(text) : null);
    }
    for (const title of chunk) if (!results.has(title)) results.set(title, null);
  }
  return results;
}
