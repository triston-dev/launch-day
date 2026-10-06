import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Settings can live in a .env file next to package.json (see .env.example).
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  /* no .env file, or a Node version without loadEnvFile: use the real environment */
}

export const config = {
  root,
  publicDir: path.join(root, 'public'),
  dataDir: path.join(root, 'data'),
  cacheDir: path.join(root, 'data', 'cache'),
  gamesFile: path.join(root, 'data', 'games.json'),

  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT) || 4310,

  // How often the server rebuilds the dataset in the background.
  refreshHours: Number(process.env.REFRESH_HOURS) || 6,

  // Store region used for Steam prices and search results.
  country: (process.env.STORE_COUNTRY || 'US').toUpperCase(),

  // Steam Web API key (free at https://steamcommunity.com/dev/apikey). With
  // it, "Sign in through Steam" can read the signed-in account's library,
  // the same way SteamDB does. Without it, sign-in still imports the wishlist.
  steamApiKey: process.env.STEAM_API_KEY || '',

  // The address people reach this server at, if it is not plain
  // http://<host header> (for example behind HTTPS). Used for Steam sign-in.
  publicUrl: process.env.PUBLIC_URL || '',

  // Wikimedia asks API clients to identify themselves.
  userAgent:
    process.env.USER_AGENT ||
    'LaunchDay/1.0 (open-source game release calendar; https://github.com/triston-dev/launch-day)',
};
