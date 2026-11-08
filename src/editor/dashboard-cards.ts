import { resolve } from '../entity';
import { cardName } from '../tiles/card';
import type { HomeAssistant, TileSize } from '../types';
import { stableJson } from './store';

/** A card found on one of the user's dashboards, ready to become a card tile. */
export interface FoundCard {
  /** The card's config, without the dashboard's layout keys. */
  card: Record<string, unknown>;
  name: string;
  /** What it shows, if that can be told: an entity's name or the card's title. */
  shows?: string;
  /** "Dashboard › View". */
  where: string;
  entity?: string;
  size: TileSize;
}

interface DashboardInfo {
  url_path: string | null;
  title?: string;
  require_admin?: boolean;
}

type Card = Record<string, any>;

// Layout that belongs to the dashboard the card came from, not to the card.
// Visibility conditions stay: the tile honors them as the dashboard did.
const DASHBOARD_KEYS = ['grid_options', 'layout_options', 'view_layout'];

// Cards that make no sense on their own in a tile.
const SKIP = new Set(['heading', 'custom:luxframe-card']);

// Cards that are one line or one button in Home Assistant.
const SMALL = new Set(['tile', 'button', 'entity', 'sensor', 'light', 'gauge']);

/**
 * A starting size from the card's place in Home Assistant's sections grid
 * (12 columns, rows of about 56 px), else from its kind. Cards four or more
 * rows tall start medium; the full width makes them large.
 */
export function suggestSize(card: Card): TileSize {
  const grid = card.grid_options ?? {};
  const old = card.layout_options ?? {};
  const rows = typeof grid.rows === 'number' ? grid.rows : typeof old.grid_rows === 'number' ? old.grid_rows : undefined;
  const wide =
    grid.columns === 'full' ||
    (typeof grid.columns === 'number' && grid.columns >= 9) ||
    old.grid_columns === 'full' ||
    (typeof old.grid_columns === 'number' && old.grid_columns >= 4);
  if (rows !== undefined) {
    if (rows >= 4) return wide ? 'l' : 'm';
    if (rows >= 2) return wide ? 'w' : 'm';
    return wide ? 'w' : 's';
  }
  return SMALL.has(card.type) ? 's' : 'm';
}

function clean(card: Card): Card {
  const copy = { ...card };
  for (const key of DASHBOARD_KEYS) delete copy[key];
  return copy;
}

/** What a card shows: its entity's name, or its title or name, or its cards' names for a stack. */
function shows(hass: HomeAssistant | undefined, card: Card): { shows?: string; entity?: string } {
  const entity = typeof card.entity === 'string' ? card.entity : undefined;
  if (entity && hass?.states[entity]) return { shows: resolve(hass, entity).name, entity };
  for (const key of ['title', 'name']) if (typeof card[key] === 'string' && card[key]) return { shows: card[key], entity };
  if (Array.isArray(card.cards)) {
    const names = card.cards.map((c: Card) => shows(hass, c).shows ?? cardName(c)).slice(0, 3);
    return { shows: names.join(', '), entity };
  }
  return { entity };
}

/** Every card on a view: masonry and panel views list them, sections views group them. */
function viewCards(view: Card): Card[] {
  const cards: Card[] = [];
  if (Array.isArray(view.cards)) cards.push(...view.cards);
  if (Array.isArray(view.sections)) {
    for (const section of view.sections) if (Array.isArray(section?.cards)) cards.push(...section.cards);
  }
  return cards.filter((c) => c && typeof c === 'object' && typeof c.type === 'string' && !SKIP.has(c.type));
}

async function listDashboards(hass: HomeAssistant): Promise<DashboardInfo[]> {
  const main: DashboardInfo = { url_path: null };
  try {
    const listed = await hass.callWS!<DashboardInfo[]>({ type: 'lovelace/dashboards/list' });
    return [main, ...listed.filter((d) => d.url_path && (!d.require_admin || hass.user?.is_admin))];
  } catch {
    return [main];
  }
}

/**
 * The cards on every dashboard this user can open, in dashboard and view
 * order, each card once. A dashboard that can't be read (one Home Assistant
 * generates itself, or one only admins may open) is skipped.
 */
export async function dashboardCards(hass: HomeAssistant | undefined): Promise<FoundCard[]> {
  if (!hass?.callWS) return [];
  const dashboards = await listDashboards(hass);
  const configs = await Promise.all(
    dashboards.map((d) =>
      hass.callWS!<{ title?: string; views?: Card[] }>({ type: 'lovelace/config', url_path: d.url_path }).catch(
        () => undefined,
      ),
    ),
  );

  const seen = new Set<string>();
  const found: FoundCard[] = [];
  dashboards.forEach((dashboard, d) => {
    const config = configs[d];
    if (!Array.isArray(config?.views)) return;
    const dashboardTitle = dashboard.title ?? config.title ?? 'Overview';
    config.views.forEach((view, v) => {
      const viewTitle = view.title ?? view.path ?? `View ${v + 1}`;
      for (const raw of viewCards(view)) {
        const card = clean(raw);
        const key = stableJson(card);
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({
          card,
          name: cardName(card),
          ...shows(hass, card),
          where: `${dashboardTitle} › ${viewTitle}`,
          size: suggestSize(raw),
        });
      }
    });
  });
  return found;
}
