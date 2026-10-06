// Imports a Steam library so the calendar can mark games you already own.
// Steam only shares libraries through its Web API, which needs a key.
import { fetchJson } from './http.js';
import { config } from './config.js';

const API = 'https://api.steampowered.com';

export class LibraryError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Accepts a SteamID64, a /profiles/<id> URL, a /id/<name> URL or a bare custom name.
export function parseProfile(input) {
  const text = String(input || '').trim();
  let m = text.match(/^(\d{17})$/) || text.match(/\/profiles\/(\d{17})/);
  if (m) return { steamid: m[1] };
  m = text.match(/\/id\/([^/?#]+)/) || text.match(/^([A-Za-z0-9_-]{2,32})$/);
  if (m) return { vanity: m[1] };
  return null;
}

export async function fetchSteamLibrary(input) {
  if (!config.steamApiKey) {
    throw new LibraryError('not-configured', 'Steam import needs a STEAM_API_KEY on the server.');
  }
  const profile = parseProfile(input);
  if (!profile) throw new LibraryError('bad-profile', 'That does not look like a Steam profile link or ID.');

  let { steamid } = profile;
  if (!steamid) {
    const url = new URL(`${API}/ISteamUser/ResolveVanityURL/v1/`);
    url.search = new URLSearchParams({ key: config.steamApiKey, vanityurl: profile.vanity });
    const data = await fetchJson(url);
    if (data?.response?.success !== 1) throw new LibraryError('not-found', 'No Steam profile goes by that name.');
    steamid = data.response.steamid;
  }

  const url = new URL(`${API}/IPlayerService/GetOwnedGames/v1/`);
  url.search = new URLSearchParams({
    key: config.steamApiKey,
    steamid,
    include_played_free_games: '1',
    include_appinfo: '0',
  });
  const data = await fetchJson(url);
  const games = data?.response?.games;
  if (!games) {
    throw new LibraryError('private', 'Steam returned no games. Set "Game details" to Public in your Steam privacy settings.');
  }
  return { steamid, appids: games.map((g) => g.appid), importedAt: new Date().toISOString() };
}
