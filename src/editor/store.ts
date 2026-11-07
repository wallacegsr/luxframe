import type { HomeAssistant, LuxFrameConfig } from '../types';

// Where an edit made on the tablet ends up.
//
// The dashboard's own config is the base. An admin's edit replaces this card
// in that config (`lovelace/config/save`), so every tablet on the dashboard
// shares it. Anyone else's edit, or one the dashboard can't take (a YAML-mode
// dashboard), is kept in this browser's storage, keyed by the base it was
// made from: when the dashboard's config changes, the local copy is dropped
// and the new base wins.

export type SaveResult =
  | { where: 'dashboard' }
  | { where: 'tablet'; reason: 'not-admin' | 'yaml' | 'not-found' | 'error'; message?: string };

interface LovelaceConfig {
  views?: Array<Record<string, any>>;
  [key: string]: unknown;
}

/** JSON with keys sorted, so two equal configs give the same string. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The dashboard in the address bar: `null` for the default one. */
export function dashboardPath(pathname = location.pathname): string | null {
  const first = pathname.split('/').filter(Boolean)[0];
  return !first || first === 'lovelace' ? null : first;
}

function storageKey(base: LuxFrameConfig): string {
  return `luxframe:${dashboardPath() ?? 'lovelace'}:${hash(stableJson(base))}`;
}

/** This tablet's own edit of `base`, if there is one. */
export function loadLocal(base: LuxFrameConfig): LuxFrameConfig | undefined {
  try {
    const raw = localStorage.getItem(storageKey(base));
    return raw ? (JSON.parse(raw) as LuxFrameConfig) : undefined;
  } catch {
    return undefined;
  }
}

export function saveLocal(base: LuxFrameConfig, config: LuxFrameConfig): boolean {
  try {
    localStorage.setItem(storageKey(base), JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function clearLocal(base: LuxFrameConfig): void {
  try {
    localStorage.removeItem(storageKey(base));
  } catch {
    // Storage blocked: there was nothing kept either.
  }
}

/**
 * Finds the card equal to `base` anywhere in the dashboard (views, sections,
 * stacks) and puts `next` in its place. Returns false when it isn't there.
 */
function replaceCard(node: unknown, base: string, next: LuxFrameConfig): boolean {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (node[i] && typeof node[i] === 'object' && stableJson(node[i]) === base) {
        node[i] = next;
        return true;
      }
      if (replaceCard(node[i], base, next)) return true;
    }
    return false;
  }
  if (node && typeof node === 'object') {
    for (const key of ['views', 'sections', 'cards', 'card']) {
      const child = (node as Record<string, unknown>)[key];
      if (key === 'card' && child && typeof child === 'object' && stableJson(child) === base) {
        (node as Record<string, unknown>)[key] = next;
        return true;
      }
      if (child && replaceCard(child, base, next)) return true;
    }
  }
  return false;
}

/** Saves `next` over `base`: to the dashboard when allowed, otherwise here. */
export async function save(
  hass: HomeAssistant | undefined,
  base: LuxFrameConfig,
  next: LuxFrameConfig,
): Promise<SaveResult> {
  const keepHere = (reason: Exclude<SaveResult, { where: 'dashboard' }>['reason'], message?: string) => {
    saveLocal(base, next);
    return { where: 'tablet', reason, message } as const;
  };

  if (!hass?.callWS || !hass.user?.is_admin) return keepHere('not-admin');

  const url_path = dashboardPath();
  let dashboard: LovelaceConfig;
  try {
    dashboard = await hass.callWS<LovelaceConfig>({ type: 'lovelace/config', url_path, force: true });
  } catch (err) {
    return keepHere('error', (err as Error)?.message);
  }
  // A YAML-mode dashboard can be read but not saved.
  if (!replaceCard(dashboard, stableJson(base), next)) return keepHere('not-found');
  try {
    await hass.callWS({ type: 'lovelace/config/save', url_path, config: dashboard });
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    // HA answers "Not supported" for dashboards managed in YAML.
    return keepHere(/yaml|not supported/i.test(message) ? 'yaml' : 'error', message);
  }
  clearLocal(base);
  return { where: 'dashboard' };
}

export function describe(result: SaveResult): string {
  if (result.where === 'dashboard') return 'Saved to the dashboard';
  switch (result.reason) {
    case 'not-admin':
      return 'Saved on this tablet only. Sign in as an admin to share it.';
    case 'yaml':
      return 'Saved on this tablet only. This dashboard is managed in YAML.';
    case 'not-found':
      return "Saved on this tablet only. LuxFrame couldn't find itself in the dashboard.";
    default:
      return 'Saved on this tablet only. Home Assistant refused the change.';
  }
}
