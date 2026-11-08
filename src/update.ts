import type { HomeAssistant } from './types';

declare const __LF_STAMP__: string;

/**
 * Spotting a newer LuxFrame than the one running. A wall tablet keeps the
 * code it loaded until its page reloads, which kiosk apps rarely do, so an
 * update from HACS can sit unused for weeks. So the file is asked for again
 * now and then, past the browser's copy, and the version stamped in it read.
 *
 * HACS gives each version its own resource URL (`?hacstag=…`), and the
 * dashboard's resource is the one asked for. A resource added by hand has
 * the same URL every version, and a browser may keep serving its old copy
 * of it even across restarts; asking past that copy catches those too, and
 * puts the new file in the browser's cache, so a reload runs it.
 */

/** "luxframe-version:0.8.3", as it's found in the file `newerInstalled` fetches. */
const STAMP = __LF_STAMP__;
const RUNNING = STAMP.slice(STAMP.indexOf(':') + 1);

/** Where this code was loaded from. */
const LOADED = new URL(import.meta.url);

const RECHECK_MS = 10 * 60_000;

interface Resource {
  url: string;
  type?: string;
}

let last: { at: number; result: Promise<string | undefined> } | undefined;

/**
 * The version installed, when it's newer than the one running; '' when it's
 * newer but its version can't be read. Undefined when this is up to date or
 * it can't tell. Every LuxFrame on the page shares one check in ten minutes.
 */
export function newerInstalled(hass: HomeAssistant | undefined): Promise<string | undefined> {
  if (last && Date.now() - last.at < RECHECK_MS) return last.result;
  last = { at: Date.now(), result: check(hass) };
  return last.result;
}

async function check(hass: HomeAssistant | undefined): Promise<string | undefined> {
  if (!hass?.callWS) return undefined;
  let resources: Resource[];
  try {
    resources = await hass.callWS<Resource[]>({ type: 'lovelace/resources' });
  } catch {
    return undefined;
  }
  const mine = resources
    .map((r) => {
      try {
        return new URL(r.url, location.origin);
      } catch {
        return undefined;
      }
    })
    .find((url) => url?.pathname === LOADED.pathname);
  const moved = !!mine && mine.search !== LOADED.search;
  // Revalidated with the server: cheap when it hasn't changed (304), and the
  // browser's cache gets the new file when it has.
  const url = mine?.href ?? LOADED.href;
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) return moved ? '' : undefined;
    const version = /luxframe-version:([\w.+-]+)/.exec(await response.text())?.[1];
    if (!version) return moved ? '' : undefined;
    return newer(version, RUNNING) ? version : undefined;
  } catch {
    return moved ? '' : undefined;
  }
}

/** Whether version `a` comes after `b`: "0.8.10" after "0.8.9". */
export function newer(a: string, b: string): boolean {
  const parts = (v: string) => v.split(/[.+-]/).map((p) => Number.parseInt(p, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}
