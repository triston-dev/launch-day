// iCalendar export, so releases land in Google Calendar, Outlook or Apple Calendar.
import { addDays, dateLabel } from './util.js';
import { platformLabels, storeLinks } from './catalog.js';

const compact = (iso) => iso.replace(/-/g, '');

function escapeText(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

// RFC 5545 caps lines at 75 octets; longer ones continue after CRLF + space.
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

function eventDetails(game) {
  const lines = [];
  if (game.precision !== 'day') lines.push(`Expected ${dateLabel(game)} (no exact day announced yet).`);
  if (game.platforms.length) lines.push(`Platforms: ${platformLabels(game.platforms).join(', ')}`);
  const store = storeLinks(game).find((l) => l.exact);
  if (store) lines.push(`${store.store}: ${store.url}`);
  return lines.join('\n');
}

function vevent(game, stamp) {
  const start = game.date;
  return [
    'BEGIN:VEVENT',
    `UID:${game.id}@launch-day`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(start)}`,
    `DTEND;VALUE=DATE:${compact(addDays(start, 1))}`,
    `SUMMARY:${escapeText(`${game.title} releases${game.precision === 'day' ? '' : ' (expected)'}`)}`,
    `DESCRIPTION:${escapeText(eventDetails(game))}`,
    ...(game.steam?.url ? [`URL:${game.steam.url}`] : []),
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

export function buildIcs(games, name = 'Game releases') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Launch Day//Game Release Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    ...games.flatMap((g) => vevent(g, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadIcs(games, filename, name) {
  const blob = new Blob([buildIcs(games, name)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function googleCalendarUrl(game) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${game.title} releases`,
    dates: `${compact(game.date)}/${compact(addDays(game.date, 1))}`,
    details: eventDetails(game),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
