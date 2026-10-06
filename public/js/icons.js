// Inline stroke icons (24px grid), drawn to share one visual weight.
const paths = {
  star: '<polygon points="12 2.5 15 8.6 21.7 9.6 16.8 14.3 18 21 12 17.8 6 21 7.2 14.3 2.3 9.6 9 8.6 12 2.5"/>',
  chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.6-4.6"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
  calendarPlus: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18M12 13.5v5M9.5 16h5"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/>',
  refresh: '<path d="M20 4v6h-6"/><path d="M4 20v-6h6"/><path d="M5.6 9a7.5 7.5 0 0 1 12.9-2.6L20 10M4 14l1.5 3.6A7.5 7.5 0 0 0 18.4 15"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4l-1.1 1.1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.1-1.1"/>',
  download: '<path d="M12 3.5v12M7 10.5l5 5 5-5M4 20.5h16"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4M12 17.2v.1"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  flame: '<path d="M12 2.5c.9 3.4 5 5.6 5 10.8a5 5 0 0 1-10 0c0-2.5 1.2-4.2 2.5-5.3.2 1.7 1 2.9 2.3 3.1-.8-3-.4-5.9.2-8.6z" fill="currentColor" stroke="none"/>',
  thumb: '<path d="M7.5 10.5v9h-3v-9z"/><path d="M7.5 19.5h9.3a2 2 0 0 0 2-1.6l1.1-5.5a2 2 0 0 0-2-2.4h-4.4l.7-3.4a1.8 1.8 0 0 0-3.3-1.2l-3.4 5.1"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  library: '<path d="M4.5 4.5v15M9 4.5v15"/><path d="M13.2 5.3l3.9-1 3.6 14.6-3.9 1z"/>',
  deck: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><circle cx="7.5" cy="12" r="1.5"/><circle cx="16.5" cy="12" r="1.5"/>',
};

export function icon(name, { size = 18, cls = '', filled = false } = {}) {
  const body = paths[name] || '';
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
