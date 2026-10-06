import { fetchJson } from './http.js';
import { isSameGame, similarity } from './text.js';
import { config } from './config.js';

const ASSET_BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/';
const VIDEO_BASE = 'https://video.akamai.steamstatic.com/store_trailers/';
const ITEMS_BATCH = 40;

// Finds the Steam app for a title using the store's own search endpoint.
// Returns { appid, name } or null when nothing is a confident match.
export async function searchSteamApp(title) {
  const url = new URL('https://store.steampowered.com/api/storesearch/');
  url.search = new URLSearchParams({ term: title, l: 'english', cc: config.country });
  const data = await fetchJson(url);
  const candidates = (data?.items || [])
    .filter((item) => item.type === 'app' && isSameGame(title, item.name))
    .sort((a, b) => similarity(title, b.name) - similarity(title, a.name));
  if (!candidates.length) return null;
  return { appid: candidates[0].id, name: candidates[0].name };
}

function asset(format, file) {
  if (!file) return null;
  return ASSET_BASE + format.replace('${FILENAME}', file);
}

function mapTrailer(trailer) {
  const format = trailer.trailer_url_format || 'steam/apps/${FILENAME}';
  const hls = (trailer.adaptive_trailers || []).find((t) => t.encoding === 'hls_h264');
  const micro = (trailer.microtrailer || []).find((t) => t.type === 'video/mp4');
  if (!hls && !micro) return null;
  return {
    name: trailer.trailer_name || 'Trailer',
    hls: hls ? VIDEO_BASE + hls.cdn_path : null,
    preview: micro ? VIDEO_BASE + micro.filename : null,
    poster: asset(format, trailer.screenshot_medium),
  };
}

// Condenses a Steam store item into the fields the calendar shows.
export function mapStoreItem(item) {
  const assets = item.assets || {};
  const format = assets.asset_url_format || `steam/apps/${item.appid}/\${FILENAME}`;
  const release = item.release || {};
  const reviews = item.reviews?.summary_filtered;
  const purchase = item.best_purchase_option;
  const platforms = item.platforms || {};
  const deckCategory = platforms.steam_deck_compat_category;

  return {
    appid: item.appid,
    name: item.name,
    url: `https://store.steampowered.com/${item.store_url_path || `app/${item.appid}/`}`,
    description: item.basic_info?.short_description || null,
    developers: (item.basic_info?.developers || []).map((d) => d.name),
    publishers: (item.basic_info?.publishers || []).map((d) => d.name),
    images: {
      header: asset(format, assets.header),
      capsule: asset(format, assets.main_capsule),
      cover: asset(format, assets.library_capsule_2x || assets.library_capsule),
      hero: asset(format, assets.library_hero),
      small: asset(format, assets.small_capsule),
    },
    screenshots: (item.screenshots?.all_ages_screenshots || [])
      .slice(0, 6)
      .map((s) => ASSET_BASE + s.filename),
    trailers: (item.trailers?.highlights || []).map(mapTrailer).filter(Boolean).slice(0, 2),
    release: {
      comingSoon: Boolean(release.is_coming_soon),
      timestamp: release.steam_release_date || null,
      display: release.custom_release_date_message || null,
      isEarlyAccess: Boolean(release.is_early_access),
    },
    price: purchase?.formatted_final_price || (item.is_free ? 'Free' : null),
    discountPct: purchase?.discount_pct || 0,
    reviews: reviews?.review_count
      ? { label: reviews.review_score_label, percent: reviews.percent_positive, count: reviews.review_count }
      : null,
    platforms: {
      windows: Boolean(platforms.windows),
      mac: Boolean(platforms.mac),
      linux: Boolean(platforms.steamos_linux || platforms.linux),
      vr: Boolean(platforms.vr_support && Object.keys(platforms.vr_support).length),
      deck: deckCategory === 3 ? 'Verified' : deckCategory === 2 ? 'Playable' : null,
    },
  };
}

// Batch-fetches store details for many apps at once through the
// IStoreBrowseService API (no key required).
export async function fetchSteamItems(appids) {
  const out = new Map();
  for (let i = 0; i < appids.length; i += ITEMS_BATCH) {
    const chunk = appids.slice(i, i + ITEMS_BATCH);
    const input = {
      ids: chunk.map((appid) => ({ appid })),
      context: { language: 'english', country_code: config.country },
      data_request: {
        include_assets: true,
        include_basic_info: true,
        include_release: true,
        include_trailers: true,
        include_screenshots: true,
        include_platforms: true,
        include_reviews: true,
      },
    };
    const url = new URL('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/');
    url.search = new URLSearchParams({ input_json: JSON.stringify(input) });
    const data = await fetchJson(url);
    for (const item of data?.response?.store_items || []) {
      if (item.success === 1 && item.visible !== false) out.set(item.appid, mapStoreItem(item));
    }
    for (const appid of chunk) if (!out.has(appid)) out.set(appid, null);
  }
  return out;
}
