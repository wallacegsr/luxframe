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
  | { where: 'tablet'; reason: 'not-admin' | 'yaml' | 'not-found' | 'error'; message?: string }
  /** Neither the dashboard nor this browser would keep it. */
  | { where: 'nowhere' };

const CARD_TYPE = 'custom:luxframe-card';

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

/** A card in the dashboard, and where it sits so it can be replaced. */
interface Slot {
  holder: Record<string | number, unknown>;
  key: string | number;
  card: Record<string, unknown>;
  view: number;
}

/** Every card in the dashboard: in views, sections, and inside stacks and the like. */
function cardSlots(dashboard: LovelaceConfig): Slot[] {
  const slots: Slot[] = [];
  const visitCards = (holder: Record<string | number, unknown>, key: string | number, view: number): void => {
    const value = holder[key];
    if (Array.isArray(value)) {
      value.forEach((_, i) => visitCards(value as unknown as Record<string | number, unknown>, i, view));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const card = value as Record<string, unknown>;
    slots.push({ holder, key, card, view });
    visitCards(card, 'cards', view);
    visitCards(card, 'card', view);
  };
  const visitSections = (sections: unknown, view: number): void => {
    if (!Array.isArray(sections)) return;
    for (const section of sections) {
      if (!section || typeof section !== 'object') continue;
      visitCards(section, 'cards', view);
      visitSections(section.sections, view);
    }
  };
  (dashboard.views ?? []).forEach((view, i) => {
    if (!view || typeof view !== 'object') return;
    visitCards(view, 'cards', i);
    visitSections(view.sections, i);
  });
  return slots;
}

/** The view in the address bar, by its path or its number; the first one otherwise. */
function viewOnScreen(dashboard: LovelaceConfig, pathname = location.pathname): number {
  const segment = decodeURIComponent(pathname.split('/').filter(Boolean)[1] ?? '');
  const views = dashboard.views ?? [];
  const byPath = views.findIndex((view) => view?.path === segment);
  if (byPath >= 0) return byPath;
  return /^\d+$/.test(segment) && Number(segment) < views.length ? Number(segment) : 0;
}

/** Up to five places where two configs differ, such as `pages[3].tiles[2].card.days_to_show`. */
function differences(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (out.length >= 5 || stableJson(a) === stableJson(b)) return out;
  const objects = a && b && typeof a === 'object' && typeof b === 'object';
  if (objects && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const key of keys) {
      const at = Array.isArray(a) ? `${path}[${key}]` : path ? `${path}.${key}` : key;
      differences((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], at, out);
    }
    return out;
  }
  out.push(path || 'the whole card');
  return out;
}

/**
 * Where LuxFrame sits in the dashboard: the card equal to the config it was
 * given. That config can be out of date, when the dashboard changed after
 * LuxFrame got it and Home Assistant hasn't handed the new one over; then
 * it's the only LuxFrame card in the dashboard, or in the view on screen.
 */
function findSelf(dashboard: LovelaceConfig, base: LuxFrameConfig): Slot | undefined {
  const slots = cardSlots(dashboard);
  const json = stableJson(base);
  const same = slots.find((slot) => slot.card.type === CARD_TYPE && stableJson(slot.card) === json);
  if (same) return same;

  const ours = slots.filter((slot) => slot.card.type === CARD_TYPE);
  const view = viewOnScreen(dashboard);
  const here = ours.filter((slot) => slot.view === view);
  const found = ours.length === 1 ? ours[0] : here.length === 1 ? here[0] : undefined;
  if (found) {
    console.info(
      'LuxFrame: its card in the dashboard differs from the config it started with, so it saves over it. Differences:',
      differences(base, found.card),
    );
  } else {
    console.warn(
      `LuxFrame: couldn't tell which card is LuxFrame. The dashboard has ${ours.length} LuxFrame card(s), ${here.length} in view ${view}.`,
    );
  }
  return found;
}

/** Saves `next` over `base`: to the dashboard when allowed, otherwise here. */
export async function save(
  hass: HomeAssistant | undefined,
  base: LuxFrameConfig,
  next: LuxFrameConfig,
): Promise<SaveResult> {
  const keepHere = (
    reason: Extract<SaveResult, { where: 'tablet' }>['reason'],
    message?: string,
  ): SaveResult => (saveLocal(base, next) ? { where: 'tablet', reason, message } : { where: 'nowhere' });

  if (!hass?.callWS || !hass.user?.is_admin) return keepHere('not-admin');

  const url_path = dashboardPath();
  let dashboard: LovelaceConfig;
  try {
    dashboard = await hass.callWS<LovelaceConfig>({ type: 'lovelace/config', url_path, force: true });
  } catch (err) {
    return keepHere('error', (err as Error)?.message);
  }
  const self = findSelf(dashboard, base);
  if (!self) return keepHere('not-found');
  self.holder[self.key] = next;
  try {
    await hass.callWS({ type: 'lovelace/config/save', url_path, config: dashboard });
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    // A YAML-mode dashboard can be read but not saved: HA answers "Not supported".
    return keepHere(/yaml|not supported/i.test(message) ? 'yaml' : 'error', message);
  }
  clearLocal(base);
  return { where: 'dashboard' };
}

export function describe(result: SaveResult): string {
  if (result.where === 'dashboard') return 'Saved to the dashboard';
  if (result.where === 'nowhere') return "Couldn't save. The dashboard can't take it, and this browser won't store it.";
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
