import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

  // Optional Steam Web API key (free at https://steamcommunity.com/dev/apikey).
  // Only used to import your own Steam library so owned games are marked.
  steamApiKey: process.env.STEAM_API_KEY || '',

  // Wikimedia asks API clients to identify themselves.
  userAgent:
    process.env.USER_AGENT ||
    'LaunchDay/1.0 (open-source game release calendar; https://github.com/triston-dev/launch-day)',
};
