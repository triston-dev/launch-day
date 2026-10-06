import { config } from './config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
  }
}

// GET a URL, retrying transient failures (429, 5xx, network) with
// exponential backoff, and hand the response to `read`. Returns null for 404
// so callers can treat a missing page as "no data" rather than an error.
async function fetchWithRetry(url, read, { retries = 4, timeoutMs = 30000, headers = {}, accept = '*/*' } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': config.userAgent, Accept: accept, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new HttpError(res.status, url);
      return await read(res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 0;
      const transient = status === 0 || status === 429 || status >= 500;
      if (!transient || attempt >= retries) throw err;
      const wait = status === 429 ? 30000 * (attempt + 1) : 1000 * 2 ** attempt;
      attempt += 1;
      await sleep(wait);
    }
  }
}

export function fetchJson(url, options = {}) {
  return fetchWithRetry(url, (res) => res.json(), { accept: 'application/json', ...options });
}

export function fetchText(url, options = {}) {
  return fetchWithRetry(url, (res) => res.text(), options);
}

// Runs async tasks with bounded concurrency and a minimum gap between task
// starts, which keeps us comfortably inside the public APIs' rate limits.
export function createLimiter({ concurrency = 2, minIntervalMs = 0 } = {}) {
  let active = 0;
  let lastStart = 0;
  const queue = [];

  const pump = async () => {
    if (active >= concurrency || queue.length === 0) return;
    active += 1;
    const { task, resolve, reject } = queue.shift();
    const wait = lastStart + minIntervalMs - Date.now();
    lastStart = Math.max(Date.now(), lastStart + minIntervalMs);
    if (wait > 0) await sleep(wait);
    try {
      resolve(await task());
    } catch (err) {
      reject(err);
    } finally {
      active -= 1;
      pump();
    }
  };

  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      pump();
    });
}

export { sleep };
