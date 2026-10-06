// "Sign in through Steam", the same way SteamDB and similar sites do it:
// Steam's OpenID login tells us which account signed in (the password goes
// to Steam, never to us), then the server reads that account's games with
// its own Web API key. The wishlist needs no key at all.
import { fetchJson, fetchText } from './http.js';
import { config } from './config.js';

const OPENID = 'https://steamcommunity.com/openid/login';
const API = 'https://api.steampowered.com';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';

export class SteamAuthError extends Error {}

export function loginUrl(baseUrl, state) {
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': `${baseUrl}/auth/steam/return?state=${encodeURIComponent(state)}`,
    'openid.realm': baseUrl,
    'openid.identity': SELECT,
    'openid.claimed_id': SELECT,
  });
  return `${OPENID}?${params}`;
}

// Checks what Steam sent back before asking Steam to confirm it. Returns the
// SteamID64 the response claims, or throws.
export function readAssertion(query, baseUrl) {
  if (query.get('openid.mode') !== 'id_res') throw new SteamAuthError('Steam sign-in was cancelled.');
  if (query.get('openid.op_endpoint') !== OPENID) throw new SteamAuthError('Unexpected sign-in provider.');
  const returnTo = query.get('openid.return_to') || '';
  if (!returnTo.startsWith(`${baseUrl}/auth/steam/return`)) throw new SteamAuthError('Sign-in response was meant for another site.');
  const claimed = query.get('openid.claimed_id') || '';
  const match = claimed.match(/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
  if (!match || query.get('openid.identity') !== claimed) throw new SteamAuthError('Steam did not return an account.');
  return match[1];
}

// Asks Steam to confirm the signed response really came from it.
export async function verifyAssertion(query) {
  const body = new URLSearchParams();
  for (const [key, value] of query) if (key.startsWith('openid.')) body.set(key, value);
  body.set('openid.mode', 'check_authentication');
  const res = await fetch(OPENID, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': config.userAgent },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!/^is_valid\s*:\s*true$/m.test(text)) throw new SteamAuthError('Steam could not confirm the sign-in. Try again.');
}

// Display name and avatar from the public profile.
export async function fetchProfile(steamid) {
  try {
    const xml = await fetchText(`https://steamcommunity.com/profiles/${steamid}/?xml=1`);
    const field = (name) => xml?.match(new RegExp(`<${name}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`))?.[1] || null;
    return { name: field('steamID'), avatar: field('avatarMedium') };
  } catch {
    return { name: null, avatar: null };
  }
}

// Owned app IDs, or a reason they could not be read.
export async function fetchOwnedGames(steamid) {
  if (!config.steamApiKey) return { appids: null, reason: 'no-key' };
  const url = new URL(`${API}/IPlayerService/GetOwnedGames/v1/`);
  url.search = new URLSearchParams({
    key: config.steamApiKey,
    steamid,
    include_played_free_games: '1',
    include_appinfo: '0',
  });
  try {
    const data = await fetchJson(url);
    const games = data?.response?.games;
    if (!games) return { appids: null, reason: 'private' };
    return { appids: games.map((g) => g.appid), reason: null };
  } catch (err) {
    // Never log or return the URL: it carries the key.
    return { appids: null, reason: err.status === 401 || err.status === 403 ? 'bad-key' : 'unavailable' };
  }
}

export async function fetchWishlist(steamid) {
  try {
    const data = await fetchJson(`${API}/IWishlistService/GetWishlist/v1/?steamid=${steamid}`);
    return (data?.response?.items || []).map((item) => item.appid);
  } catch {
    return [];
  }
}

export async function loadAccount(steamid) {
  const [profile, owned, wishlist] = await Promise.all([
    fetchProfile(steamid),
    fetchOwnedGames(steamid),
    fetchWishlist(steamid),
  ]);
  return {
    steamid,
    name: profile.name,
    avatar: profile.avatar,
    appids: owned.appids,
    ownedReason: owned.reason,
    wishlist,
    syncedAt: new Date().toISOString(),
  };
}
