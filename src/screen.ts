import { kiosk } from './kiosk';

// The screen-dim slider. In Kiosk Satellite it moves the tablet's backlight;
// anywhere else LuxFrame lays a dark veil over itself, kept per tablet.

const KEY = 'luxframe:brightness';
/** Never dim the veil so far the frame can't be found again. */
export const MIN_BRIGHTNESS = 10;

export const hasBacklight = (): boolean => typeof kiosk?.setBrightness === 'function';

/** Brightness 10–100. */
export async function readBrightness(): Promise<number> {
  if (hasBacklight()) {
    const level = await kiosk!.getBrightness?.();
    if (typeof level === 'number') return Math.round(Math.max(0, Math.min(1, level)) * 100);
    return 100;
  }
  try {
    const stored = Number(localStorage.getItem(KEY));
    return stored >= MIN_BRIGHTNESS && stored <= 100 ? stored : 100;
  } catch {
    return 100;
  }
}

export function writeBrightness(value: number): void {
  const level = Math.max(MIN_BRIGHTNESS, Math.min(100, Math.round(value)));
  if (hasBacklight()) {
    kiosk!.setBrightness!(level / 100);
    return;
  }
  try {
    localStorage.setItem(KEY, String(level));
  } catch {
    // Blocked storage: the veil still applies until the page reloads.
  }
}

/** Opacity of the veil for a brightness, when there's no backlight to move. */
export const veilOpacity = (brightness: number): number =>
  hasBacklight() ? 0 : Math.min(0.9, (100 - brightness) / 100);
