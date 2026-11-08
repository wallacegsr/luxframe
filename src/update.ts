import type { HomeAssistant } from './types';

declare const __LF_STAMP__: string;

/**
 * Spotting a newer LuxFrame than the one running. A wall tablet keeps the
 * code it loaded until its page reloads, which kiosk apps rarely do, so an
 * update from HACS can sit unused for weeks. HACS gives each version its own
 * resource URL (`?hacstag=…`); when the dashboard's resource no longer
 * matches the file this code came from, a newer one is installed.
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
  if (!mine || mine.search === LOADED.search) return undefined;

  // The URL changed; the file says which version it is, if it can be read.
  try {
    const text = await (await fetch(mine.href, { cache: 'no-store' })).text();
    const version = /luxframe-version:([\w.+-]+)/.exec(text)?.[1];
    if (version === RUNNING) return undefined;
    return version ?? '';
  } catch {
    return '';
  }
}
