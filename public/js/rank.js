// Ordering by hype: how much attention a game is drawing right now, nudged
// by how it reviewed once it is out. Signals come from the dataset:
//   hype.views      English Wikipedia page views, last 30 days
//   hype.followers  Steam community followers
//   critic          Metacritic / OpenCritic scores cited on Wikipedia
//   steam.reviews   Steam user reviews

// Interest borrowed from an original game (a port's parent article, the PC
// edition's followers) says less about this particular release.
const INHERITED_WEIGHT = 0.3;

export function attention(game) {
  const h = game.hype;
  if (!h) return 0;
  const views = h.views * (h.viewsInherited ? INHERITED_WEIGHT : 1);
  // Following a game is a deliberate act, so a follower outweighs a page view.
  const follows = h.followers * 3 * (h.followersInherited ? INHERITED_WEIGHT : 1);
  return Math.max(views, follows) + 0.25 * Math.min(views, follows);
}

// A 0-100 critic score where one exists on that scale.
export function criticScore(game) {
  const c = game.critic;
  if (!c) return null;
  return c.metacritic ?? c.opencritic ?? null;
}

export function reviewAdjustment(game, today) {
  const steam = game.steam?.reviews;
  const critic = criticScore(game);
  let adj = 0;
  if (critic != null) adj = (critic - 70) / 10;
  else if (game.critic?.opencriticRecommend != null) adj = (game.critic.opencriticRecommend - 60) / 15;
  else if (steam && steam.count >= 50) adj = (steam.percent - 70) / 15;
  // Scores from an earlier release (a port's PC reviews) count for half.
  const released = game.precision === 'day' && game.date <= today;
  if (!released || game.critic?.inherited) adj *= 0.5;
  return adj;
}

export function hypeScore(game, today) {
  const a = attention(game);
  let score = a > 0 ? Math.log10(1 + a) : (game.wiki ? 1.5 : 0) + (game.steam ? 0.8 : 0);
  score += reviewAdjustment(game, today);
  if (game.art) score += 0.3;
  score += Math.min(game.platforms.length, 5) * 0.08;
  if (game.asiaOnly) score -= 2;
  if (game.reissue) score -= 0.5;
  return score;
}

// 0-3 flames for the hype meter.
export function hypeLevel(game) {
  const a = attention(game);
  if (a >= 150000) return 3;
  if (a >= 40000) return 2;
  if (a >= 8000) return 1;
  return 0;
}

export function scoreTier(score) {
  if (score >= 75) return 'good';
  if (score >= 50) return 'mixed';
  return 'bad';
}

export function compactNumber(n) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
