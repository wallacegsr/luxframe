import type { HomeAssistant } from './types';

// One shared timer for every clock on screen, fired just after each minute
// turns over, instead of an interval per clock polling every second.
const listeners = new Set<() => void>();
let timer: number | undefined;

function schedule(): void {
  const now = new Date();
  const wait = 60_000 - now.getSeconds() * 1000 - now.getMilliseconds() + 50;
  timer = window.setTimeout(() => {
    listeners.forEach((fn) => fn());
    schedule();
  }, wait);
}

/** Calls `fn` at the start of every minute; returns the unsubscribe. */
export function onMinute(fn: () => void): () => void {
  listeners.add(fn);
  if (timer === undefined) schedule();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };
}

function hour12(hass?: HomeAssistant): boolean | undefined {
  const format = hass?.locale?.time_format;
  if (format === '12') return true;
  if (format === '24') return false;
  return undefined;
}

/** "10:42", without AM/PM: a wall clock reads fine without it. */
export function formatTime(hass: HomeAssistant | undefined, date: Date): string {
  return new Intl.DateTimeFormat(hass?.locale?.language, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: hour12(hass),
  })
    .formatToParts(date)
    .filter((part) => part.type !== 'dayPeriod')
    .map((part) => part.value)
    .join('')
    .trim();
}

export function formatDate(
  hass: HomeAssistant | undefined,
  date: Date,
  options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' },
): string {
  return new Intl.DateTimeFormat(hass?.locale?.language, options).format(date);
}

/** "9:30 AM" or "09:30": event times keep AM/PM, unlike the wall clock. */
export function formatClock(hass: HomeAssistant | undefined, date: Date): string {
  return new Intl.DateTimeFormat(hass?.locale?.language, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: hour12(hass),
  }).format(date);
}
