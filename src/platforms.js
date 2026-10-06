// Wikipedia platform abbreviations mapped to the keys the app uses.
// Order matters: longer codes must be tried before their prefixes (NS2 before NS).
const CODES = [
  ['XBX/S', 'xsx'],
  ['XSX/S', 'xsx'],
  ['XBO', 'xone'],
  ['PS5', 'ps5'],
  ['PS4', 'ps4'],
  ['PSVR2', 'psvr'],
  ['PSVR', 'psvr'],
  ['NS2', 'switch2'],
  ['NS', 'switch'],
  ['WIN', 'pc'],
  ['OSX', 'mac'],
  ['LIN', 'linux'],
  ['Meta VR Glasses', 'quest'],
  ['Quest', 'quest'],
  ['iOS', 'ios'],
  ['DROID', 'android'],
  ['Droid', 'android'],
  ['MOBI', 'mobile'],
  ['tvOS', 'tvos'],
  ['Luna', 'luna'],
  ['GEN', 'retro'],
  ['consoles', 'consoles'],
];

const PATTERN = new RegExp(
  `(?<![A-Za-z0-9])(${CODES.map(([code]) => code.replace(/[/]/g, '\\/')).join('|')})`,
  'g',
);
const LOOKUP = new Map(CODES);

// Platforms that qualify a release for the calendar (PC and consoles, VR included).
export const CORE_PLATFORMS = new Set([
  'pc', 'mac', 'linux', 'ps5', 'ps4', 'psvr', 'xsx', 'xone', 'switch2', 'switch', 'quest', 'consoles',
]);
export const PC_PLATFORMS = new Set(['pc', 'mac', 'linux']);

// "WIN, PS5, XBX/S" -> ['pc', 'ps5', 'xsx']. Tolerates region-qualified cells
// such as "PS5WW: WIN" where the editor glued two lines together.
export function parsePlatforms(text) {
  const found = [];
  for (const match of String(text || '').matchAll(PATTERN)) {
    const key = LOOKUP.get(match[1]);
    if (key && !found.includes(key)) found.push(key);
  }
  return found;
}

export function isCalendarRelevant(platforms) {
  // Unknown platforms stay in: big announcements often arrive before platforms do.
  return platforms.length === 0 || platforms.some((p) => CORE_PLATFORMS.has(p));
}
