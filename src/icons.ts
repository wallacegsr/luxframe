import { html, svg } from 'lit';

// Line icons LuxFrame draws itself, so they show outside Home Assistant too.
const ICONS = {
  previous: svg`<path d="M7 6v12M19 6l-9 6 9 6z" />`,
  next: svg`<path d="M17 6v12M5 6l9 6-9 6z" />`,
  play: svg`<path d="M8 5l12 7-12 7z" />`,
  pause: svg`<path d="M8 5v14M16 5v14" />`,
  speaker: svg`<path d="M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6" />`,
  sun: svg`<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />`,
  ask: svg`<path d="M4 5h16v11H9l-5 4z" />`,
  sunrise: svg`<path d="M3 18h18M6 14a6 6 0 0 1 12 0M12 3v5M9 6l3-3 3 3" />`,
  sunset: svg`<path d="M3 18h18M6 14a6 6 0 0 1 12 0M12 8V3M9 5l3 3 3-3" />`,
  calendar: svg`<rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" />`,
  camera: svg`<path d="M3 8h4l2-3h6l2 3h4v11H3z" /><circle cx="12" cy="13" r="3.5" />`,
  photo: svg`<rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 16l5-5 4 4 3-3 6 6" />`,
  check: svg`<path d="M5 12l5 5 9-10" />`,
  circle: svg`<circle cx="12" cy="12" r="8.5" />`,
  room: svg`<path d="M4 11l8-7 8 7v9H4z" /><path d="M10 20v-5h4v5" />`,
  bulb: svg`<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" />`,
  list: svg`<path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" />`,
  moon: svg`<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />`,
  power: svg`<path d="M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0" />`,
  snow: svg`<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 3.5l3 2 3-2M9 20.5l3-2 3 2" />`,
  flame: svg`<path d="M12 21.5a7 7 0 0 0 7-7c0-4.5-3.5-6.5-4.5-11-2 2-3 4-3 6.5-1-1-2-2.2-2.2-4C6.5 8 5 11 5 14.5a7 7 0 0 0 7 7z" />`,
  range: svg`<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0zM12 9v8" />`,
  auto: svg`<path d="M5 20l7-16 7 16M8 14h8" />`,
  drop: svg`<path d="M12 3s6 7 6 11.5a6 6 0 0 1-12 0C6 10 12 3 12 3z" />`,
  fan: svg`<circle cx="12" cy="12" r="1.5" /><path d="M12 10.5c0-4 1-7 4-7 2 0 2.5 3 0 4.5M13.5 12c4 0 7 1 7 4 0 2-3 2.5-4.5 0M12 13.5c0 4-1 7-4 7-2 0-2.5-3 0-4.5M10.5 12c-4 0-7-1-7-4 0-2 3-2.5 4.5 0" />`,
};

export type IconName = keyof typeof ICONS;

export const icon = (name: IconName, size = 26) => html`<svg
  viewBox="0 0 24 24" width=${size} height=${size} aria-hidden="true" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
