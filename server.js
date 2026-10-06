import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { config } from './src/config.js';
import { buildDataset } from './src/pipeline.js';
import { fetchSteamLibrary, LibraryError } from './src/library.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const VENDOR = {
  '/vendor/hls.min.js': path.join(config.root, 'node_modules', 'hls.js', 'dist', 'hls.min.js'),
};

// ---------------------------------------------------------------------------
// Dataset state, kept in memory and served pre-compressed.

const state = {
  dataset: null,
  body: null,
  gzipped: null,
  etag: null,
  building: false,
  progress: null,
  lastError: null,
  lastBuildStarted: 0,
};

function setDataset(data) {
  state.dataset = data;
  state.body = Buffer.from(JSON.stringify(data));
  state.gzipped = zlib.gzipSync(state.body, { level: 6 });
  state.etag = `"${crypto.createHash('sha1').update(state.body).digest('base64url').slice(0, 20)}"`;
}

async function loadFromDisk() {
  try {
    setDataset(JSON.parse(await fs.readFile(config.gamesFile, 'utf8')));
    console.log(`Loaded ${state.dataset.count} games from ${path.relative(config.root, config.gamesFile)}`);
  } catch {
    console.log('No cached dataset yet; building one now (first run takes a few minutes).');
  }
}

async function refresh(reason) {
  if (state.building) return false;
  state.building = true;
  state.lastError = null;
  state.lastBuildStarted = Date.now();
  console.log(`Refreshing data (${reason})...`);
  try {
    await buildDataset({
      onProgress: (p) => {
        state.progress = p;
      },
      onUpdate: setDataset,
      log: (line) => console.log(line),
    });
    console.log(`Data ready: ${state.dataset.count} games.`);
  } catch (err) {
    state.lastError = err.message;
    console.error('Refresh failed:', err);
  } finally {
    state.building = false;
    state.progress = null;
  }
  return true;
}

function datasetAgeHours() {
  if (!state.dataset) return Infinity;
  return (Date.now() - Date.parse(state.dataset.generatedAt)) / 3600000;
}

// ---------------------------------------------------------------------------
// HTTP

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveGames(req, res) {
  if (!state.body) return sendJson(res, 503, { error: 'Dataset is still being built.', status: statusPayload() });
  if (req.headers['if-none-match'] === state.etag) {
    res.writeHead(304, { ETag: state.etag });
    return res.end();
  }
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  res.writeHead(200, {
    'Content-Type': MIME['.json'],
    'Cache-Control': 'no-cache',
    ETag: state.etag,
    Vary: 'Accept-Encoding',
    ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(gzip ? state.gzipped : state.body);
}

function statusPayload() {
  return {
    building: state.building,
    progress: state.progress,
    generatedAt: state.dataset?.generatedAt || null,
    complete: state.dataset?.complete ?? false,
    count: state.dataset?.count ?? 0,
    etag: state.etag,
    lastError: state.lastError,
    refreshHours: config.refreshHours,
    steamImport: Boolean(config.steamApiKey),
  };
}

async function serveFile(req, res, file, cacheControl = 'no-cache') {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
    const lastModified = stat.mtime.toUTCString();
    if (req.headers['if-modified-since'] === lastModified) {
      res.writeHead(304, { 'Last-Modified': lastModified, 'Cache-Control': cacheControl });
      return res.end();
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': cacheControl,
      'Last-Modified': lastModified,
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': MIME['.txt'] });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = url.pathname;

  if (route === '/api/games' && req.method === 'GET') return serveGames(req, res);
  if (route === '/api/status' && req.method === 'GET') return sendJson(res, 200, statusPayload());
  if (route === '/api/refresh' && req.method === 'POST') {
    // Throttled so an impatient click-fest cannot hammer the upstream APIs.
    const tooSoon = Date.now() - state.lastBuildStarted < 10 * 60 * 1000;
    if (state.building || tooSoon) return sendJson(res, 202, { started: false, ...statusPayload() });
    refresh('requested from the app');
    return sendJson(res, 202, { started: true, ...statusPayload() });
  }
  if (route === '/api/steam-library' && req.method === 'GET') {
    try {
      return sendJson(res, 200, await fetchSteamLibrary(url.searchParams.get('profile')));
    } catch (err) {
      if (err instanceof LibraryError) return sendJson(res, err.code === 'not-configured' ? 501 : 400, { error: err.message, code: err.code });
      // Log the status only: the failing URL carries the API key.
      console.error(`Steam library import failed (${err.status || err.name})`);
      return sendJson(res, 502, { error: 'Steam did not answer. Try again in a minute.' });
    }
  }
  if (VENDOR[route]) return serveFile(req, res, VENDOR[route], 'public, max-age=604800');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }

  // Static files from /public, with traversal protection.
  const rel = decodeURIComponent(route === '/' ? '/index.html' : route);
  const file = path.normalize(path.join(config.publicDir, rel));
  if (!file.startsWith(config.publicDir + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  return serveFile(req, res, file);
});

await loadFromDisk();

server.listen(config.port, config.host, () => {
  const shown = config.host === '0.0.0.0' ? 'localhost' : config.host;
  console.log(`Launch Day is running at http://${shown}:${config.port}`);
});

if (datasetAgeHours() >= config.refreshHours || !state.dataset?.complete) {
  refresh(state.dataset ? 'cached data is stale' : 'first run');
}
setInterval(() => {
  if (datasetAgeHours() >= config.refreshHours) refresh('scheduled');
}, 15 * 60 * 1000).unref();
