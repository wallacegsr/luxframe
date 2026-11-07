// Optional bridge to Kiosk Satellite (github.com/jxlarrea/kiosk-satellite).
// The app injects window.kioskSatellite at document start, so a presence check
// is enough. Every method returns a Promise that resolves null/false on failure
// rather than rejecting. Outside the app all of this is a no-op.

interface KioskTheme {
  app: { mode: string; dark: boolean };
  homeAssistant: { mode: string; dark: boolean; scheduled: boolean; followsApp: boolean };
}

interface KioskState {
  haKioskMode?: { enabled: boolean; hideHeader: boolean; hideSidebar: boolean };
  screensaver?: { active: boolean };
}

interface KioskSatellite {
  platform: 'kiosksatellite';
  version: string;
  getTheme(): Promise<KioskTheme | null>;
  getKioskState(): Promise<KioskState | null>;
}

declare global {
  interface Window {
    kioskSatellite?: KioskSatellite;
  }
}

export const kiosk: KioskSatellite | null =
  window.kioskSatellite?.platform === 'kiosksatellite' ? window.kioskSatellite : null;

/** Listens for a `kiosksatellite:<name>` event and returns the unsubscribe. */
export function onKiosk<T = unknown>(name: string, handler: (detail: T) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<T>).detail);
  window.addEventListener(`kiosksatellite:${name}`, listener);
  return () => window.removeEventListener(`kiosksatellite:${name}`, listener);
}

export type { KioskTheme, KioskState };
