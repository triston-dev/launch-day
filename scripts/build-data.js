// One-shot dataset build: `npm run build-data`.
// The server does this on its own schedule; this is for a manual refresh or
// for producing data/games.json without running the server.
import { buildDataset } from '../src/pipeline.js';

let lastLine = '';
const started = Date.now();

const data = await buildDataset({
  onProgress: ({ stage, done, total }) => {
    const line = total ? `${stage}: ${done}/${total}` : stage;
    if (line !== lastLine && (!total || done === total || done % 25 === 0)) {
      console.log(line);
      lastLine = line;
    }
  },
});

const withArt = data.games.filter((g) => g.cover || g.banner).length;
const onSteam = data.games.filter((g) => g.steam).length;
console.log(
  `\nDone in ${Math.round((Date.now() - started) / 1000)}s: ${data.count} games, ` +
    `${withArt} with artwork, ${onSteam} matched on Steam.`,
);
