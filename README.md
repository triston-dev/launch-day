# Launch Day

A release calendar for upcoming PC and console games. It lays out every announced release for this year and next on a month grid and a running list, and every game opens to a page with its description, trailer, screenshots, platforms, and links to its store pages.

No API keys or accounts are needed. The data comes from public sources and refreshes itself.

## Running it

Requires Node.js 20 or newer.

```bash
npm install
npm start
```

Then open <http://localhost:4310>.

The first start builds the dataset, which takes about five minutes because every game gets matched to its store page. The calendar shows up within the first half minute and fills in with art and trailers while the build finishes. After that, the server loads from its cache instantly and refreshes in the background every six hours.

To rebuild the data without running the server:

```bash
npm run build-data
```

## What it does

**Ordered by hype.** Within every day, the most anticipated games come first, so a day with Grand Theft Auto VI and a handful of indie ports leads with GTA. Hype is measured from how many people read a game's Wikipedia article in the last 30 days and how many follow it on Steam. Interest borrowed from an older game (a port whose article is about the original) counts for less. Once a game is out, its reviews move it up or down. Cards show the hype as one to three flames.

**Reviews.** Released games show their Metacritic score (or OpenCritic, read from the review table on the game's Wikipedia article) and their Steam user score. The game page links to each review source.

**Calendar view.** A month grid with the most hyped release of each day shown with its art, and the rest listed below it. A strip of bars above the grid shows how busy each month of the year is; click one to jump there. Games with only a month, a quarter, or a year attached appear in their own sections under the grid, since putting them on a specific day would be a lie.

**Upcoming view.** Everything from today forward as cards, grouped by week for the next six weeks, then by month, then by the vaguer windows ("Q1 2027", "2027, date TBA") in the order they'd land.

**Game page.** Release date with a countdown, platforms, store buttons, the Wikipedia summary and the Steam blurb, playable Steam trailers, screenshots, developer and publisher, Steam review score and Steam Deck status, plus links to Wikipedia, YouTube trailers, Metacritic and HowLongToBeat.

**Store links.** Steam and GOG links go straight to the game's store page when it was found there; the price or "Wishlist" is shown where Steam has one. Console releases of games already sold on Steam get a Steam button marked "Already on PC". PlayStation, Xbox, Nintendo, Epic and Meta stores have no public catalog to look games up in, so those buttons open a search for the title on that store. Each button says which kind of link it is.

**Filters.** Platform chips (PC, PS5, PS4, Xbox Series X|S, Xbox One, Switch 2, Switch, VR), a genre menu, "Headliners only" (games with their own Wikipedia article), "Hide ports & re-releases", and "Include Asia-only releases" (off by default). Filters are remembered between visits.

**Games you own.** Use "I own this" on any game's page to tick the platforms you own it on. The store buttons then read "Owned on PS5", "Owned on Steam" and so on, cards get an "Owned" tag, and "Hide games I own" drops them from the calendar. Ownership is stored in your browser.

**Sign in with Steam.** The button in the top bar uses Steam's official sign-in page, so your password goes to Steam and never to Launch Day. Once you're back, every game in your Steam library is marked "Owned on Steam", games on your Steam wishlist get a "Wishlisted" tag, and one click adds them to your watchlist. Press Sync in the account menu to pick up new purchases.

This works the way SteamDB's sign-in does. Steam's login only says which account signed in; the server then reads that account's library through the Steam Web API with the server's own key. So whoever runs the server adds one free key once (see Configuration), and everyone who uses it just signs in. Without a key, sign-in still brings in your wishlist. Either way, your Steam profile's "Game details" need to be public.

**Watchlist.** Star any game. The Watchlist chip narrows every view to starred games, and "Export .ics" downloads them as a calendar file for Google Calendar, Outlook or Apple Calendar. Each game page also has its own "Add to calendar" button.

**Change tracking.** When a refresh finds that a game's date moved, the game gets a "Delayed", "Moved up" or "Date announced" tag for a few weeks, and its page says what the old date was. Games that appear for the first time get a "New" tag.

**Search.** Type a game or studio into the search box (or press `/`). Results cover every release, past or future.

**Keyboard.** `←` and `→` change months, `t` jumps to today, `/` searches, `Esc` closes whatever is open.

Links to a specific game can be shared: the copy-link button on a game page produces a URL that opens straight to it.

## Where the data comes from

1. **Wikipedia's yearly release lists** ("List of video games released in 2026", and next year's). These tables list each release with its date, platforms, release type, genre, developer and publisher. The parser handles their merged cells and the many ways a date can be written ("October 8", "November", "Q4", "Q1/Q2", "Unknown"). Mobile-only releases are dropped.
2. **Wikipedia article summaries and cover art** for games that have their own article, fetched twenty at a time.
3. **Steam.** Each title is looked up with Steam's store search, and the matches are fetched in batches from Steam's store API for art, the store description, price, reviews, trailers and screenshots. Name matching is deliberately strict, and a store page that went live long before the release in question is rejected as a different, older game sharing the name. Console ports of games already on Steam pick up the PC edition's art and trailers.
4. **GOG's catalog** for direct GOG links on upcoming PC releases.
5. **Wikimedia page views** for each game's article over the last 30 days, and **Steam follower counts** for upcoming games, which together make the hype ranking.
6. **Critic scores** from the "Video game reviews" table in released games' Wikipedia articles, where editors cite Metacritic and OpenCritic.

Every response is cached under `data/cache/`, and each refresh only re-fetches what has gone stale, so after the first build a refresh takes a minute or two. Upcoming games are refreshed more often than ones already out.

Release data from Wikipedia is available under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Store art and text belong to their owners.

## Configuration

All optional. Copy `.env.example` to `.env` next to `package.json` and fill in what you need; the server reads it at startup. Real environment variables work too.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4310` | Port to serve on |
| `HOST` | `127.0.0.1` | Interface to bind; use `0.0.0.0` to reach it from other devices on your network |
| `REFRESH_HOURS` | `6` | How often the server rebuilds the data in the background |
| `STORE_COUNTRY` | `US` | Store region for Steam prices and search |
| `USER_AGENT` | (set) | How the app identifies itself to Wikipedia and the stores |
| `STEAM_API_KEY` | (none) | Lets Steam sign-in read libraries. Free at <https://steamcommunity.com/dev/apikey> (any domain name works for a local install) |
| `PUBLIC_URL` | (from the request) | The address people reach the server at, if it's hosted behind HTTPS or a proxy. Steam sends people back here after sign-in |

For Steam sign-in with library reading, the whole setup is one line in `.env`:

```
STEAM_API_KEY=your-key-here
```

The key never reaches the browser. `.env` is in `.gitignore`, so it won't be committed by accident.

## Project layout

```
server.js            HTTP server, background refresh, JSON API
src/
  pipeline.js        Builds the dataset: lists, then summaries, Steam, GOG
  wikipedia.js       Fetches and parses the yearly release lists
  wikitable.js       Expands rowspan/colspan tables into a plain grid
  wikiInfo.js        Batch summaries and images from Wikipedia
  steam.js           Steam search and batch store details
  gog.js             GOG catalog lookup
  hype.js            Wikipedia page views and Steam follower counts
  reviews.js         Critic scores from Wikipedia review tables
  steamAuth.js       Sign in through Steam, library and wishlist
  dates.js           Release date parsing
  platforms.js       Platform abbreviations
  text.js            Title normalisation and fuzzy matching
  cache.js           JSON file cache
public/
  index.html, css/app.css
  js/app.js          App shell: routing, events, search, drawer, trailers
  js/model.js        Data, filters, watchlist, ownership
  js/rank.js         Hype score and review weighting
  js/calendar.js     Month view
  js/upcoming.js     Upcoming view
  js/detail.js       Game page and day list
  js/components.js   Shared cards, rows, badges
  js/catalog.js      Platforms, stores, genres
  js/ics.js          Calendar export
test/                Parser, matching and export tests (npm test)
data/                Generated dataset and caches (safe to delete)
```

## API

- `GET /api/games`: the full dataset (gzip, ETag)
- `GET /api/status`: whether a refresh is running and how far along it is
- `POST /api/refresh`: start a refresh now (ignored if one ran in the last ten minutes)
- `GET /auth/steam`: starts Steam sign-in; Steam returns to `/auth/steam/return`
- `GET /api/steam/session/<token>`: the signed-in account's library and wishlist, collected once after sign-in

## Limitations

- Coverage is whatever Wikipedia's editors have listed, which is broad and well sourced but leans toward games with press coverage. Small indies announced only on Steam may be missing.
- Console store buttons are searches, not direct links.
- Hype is a proxy. Page views and followers track attention well for big games, but a small game with no article and no Steam page has nothing to measure and sits at the bottom of its day.
- Console libraries (PlayStation, Xbox, Nintendo) have no public API, so ownership there is marked by hand.
- Dates come from the lists and can trail a fresh announcement by a day or so until an editor updates the page.
