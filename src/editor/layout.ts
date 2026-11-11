import { cardName } from '../tiles/card';
import { areaName, domainOf, resolve } from '../entity';
import type { CardTileConfig, GridPageConfig, GridTileConfig, HassEntity, HomeAssistant, PageConfig } from '../types';

/** Domains a tablet tile makes sense for, in the order suggested pages list them. */
const USEFUL = ['climate', 'light', 'fan', 'cover', 'lock', 'switch', 'media_player', 'scene', 'script'];

export function normalizeTile(tile: GridTileConfig | string): GridTileConfig {
  return typeof tile === 'string' ? { type: 'entity', entity: tile } : tile;
}

/** What a tile is called in the editor. */
export function tileLabel(hass: HomeAssistant | undefined, raw: GridTileConfig | string): string {
  const tile = normalizeTile(raw);
  switch (tile.type ?? 'entity') {
    case 'clock':
      return 'Clock';
    case 'analog-clock':
      return 'Analog clock';
    case 'weather':
      return 'entity' in tile && tile.entity ? resolve(hass, tile.entity).name : 'Weather';
    case 'calendar':
      return tile.type === 'calendar' && tile.view === 'month' ? 'Month' : 'Up next';
    case 'now-playing':
      return 'Now playing';
    case 'photo':
      return 'Photos';
    case 'sun':
      return 'Sunrise and sunset';
    case 'room':
      return tile.type === 'room' ? (hass?.areas?.[tile.area]?.name ?? tile.area) : 'Room';
    case 'card':
      return cardName((tile as CardTileConfig).card);
    case 'people':
      return 'People';
    case 'energy':
      return 'Energy now';
    case 'button': {
      const { entity, name, action } = tile as { entity?: string; name?: string; action?: string };
      return name ?? (entity ? resolve(hass, entity).name : (action ?? 'Button'));
    }
    case 'camera':
    case 'todo':
      return resolve(hass, (tile as { entity: string }).entity).name;
    default: {
      const { entity, name } = tile as { entity: string; name?: string };
      return name ?? resolve(hass, entity).name;
    }
  }
}

/** What kind of page it is, as the editor names it: "Tiles", "Calendar"… */
export function kindLabel(page: PageConfig): string {
  return PAGE_KINDS.find((k) => k.type === page.type)?.label ?? page.type;
}

export function pageLabel(page: PageConfig, index: number): string {
  if ('title' in page && page.title) return page.title;
  return `${kindLabel(page)} · page ${index + 1}`;
}

/**
 * The heading a page shows when it has no title of its own, for the pages
 * that show one. Tiles show none until given a title; a room always has one.
 * Weather, clock, photos, night and xBloom pages are full-screen and have no heading.
 */
export const TITLE_DEFAULTS: Partial<Record<PageConfig['type'], string>> = {
  grid: '',
  calendar: 'Calendar',
  cameras: 'Cameras',
  scenes: 'Scenes',
  room: '',
};

/** Pages that can be added on the tablet, blank or with their defaults. */
export const PAGE_KINDS: Array<{ type: PageConfig['type']; label: string; blank?: PageConfig }> = [
  { type: 'grid', label: 'Tiles', blank: { type: 'grid', tiles: [] } },
  { type: 'weather', label: 'Weather', blank: { type: 'weather' } },
  { type: 'calendar', label: 'Calendar', blank: { type: 'calendar' } },
  { type: 'cameras', label: 'Cameras', blank: { type: 'cameras' } },
  { type: 'photos', label: 'Photos', blank: { type: 'photos' } },
  { type: 'night', label: 'Night', blank: { type: 'night' } },
  { type: 'xbloom', label: 'xBloom', blank: { type: 'xbloom' } },
  { type: 'clock', label: 'Clock', blank: { type: 'clock' } },
  { type: 'room', label: 'Room' },
  { type: 'scenes', label: 'Scenes' },
];

/** The tile an entity gets when it's picked: a thermostat for climate, and so on. */
export function tileFor(entityId: string): GridTileConfig | string {
  switch (domainOf(entityId)) {
    case 'climate':
      return { type: 'thermostat', entity: entityId };
    case 'weather':
      return { type: 'weather', entity: entityId };
    case 'calendar':
      return { type: 'calendar', entities: [entityId] };
    case 'camera':
      return { type: 'camera', entity: entityId };
    case 'todo':
      return { type: 'todo', entity: entityId };
    case 'media_player':
      return { type: 'now-playing', entity: entityId };
    case 'sun':
      return { type: 'sun', entity: entityId };
    case 'sensor':
      return { type: 'sensor', entity: entityId };
    case 'alarm_control_panel':
      return { type: 'alarm', entity: entityId };
    case 'timer':
      return { type: 'timer', entity: entityId };
    case 'vacuum':
      return { type: 'vacuum', entity: entityId };
    case 'input_number':
    case 'number':
      return { type: 'number', entity: entityId };
    case 'input_select':
    case 'select':
      return { type: 'select', entity: entityId };
    case 'person':
      return { type: 'people', entities: [entityId] };
    case 'button':
    case 'input_button':
      return { type: 'button', entity: entityId };
    default:
      return entityId;
  }
}

/** Entities worth offering: not hidden, not config/diagnostic, in a useful domain first. */
export function pickable(hass: HomeAssistant | undefined): HassEntity[] {
  if (!hass) return [];
  return Object.values(hass.states).filter((s) => {
    const entry = hass.entities?.[s.entity_id];
    return !entry?.hidden && !entry?.entity_category;
  });
}

const ALSO_TILES = [
  'weather', 'calendar', 'camera', 'todo', 'sun', 'sensor', 'alarm_control_panel', 'timer', 'vacuum',
  'input_number', 'number', 'input_select', 'select', 'person', 'button', 'input_button',
];

export function isUseful(entityId: string): boolean {
  return USEFUL.includes(domainOf(entityId)) || ALSO_TILES.includes(domainOf(entityId));
}

/**
 * One grid page per area, built from what's in it: the thermostat first and
 * large, then lights, fans, shades, locks, switches, media and scenes. Areas
 * with nothing useful are skipped, and so are areas already on a page of the
 * same title.
 */
export function suggestPages(hass: HomeAssistant | undefined, existing: PageConfig[]): GridPageConfig[] {
  if (!hass?.areas) return [];
  const taken = new Set(
    existing.map((p) => ('title' in p && p.title ? p.title.toLowerCase() : '')).filter(Boolean),
  );
  const byArea = new Map<string, HassEntity[]>();
  for (const s of pickable(hass)) {
    if (!USEFUL.includes(domainOf(s.entity_id))) continue;
    const area = areaName(hass, s.entity_id);
    if (!area) continue;
    byArea.set(area, [...(byArea.get(area) ?? []), s]);
  }

  const pages: GridPageConfig[] = [];
  for (const area of Object.values(hass.areas)) {
    const entities = byArea.get(area.name);
    if (!entities?.length || taken.has(area.name.toLowerCase())) continue;
    entities.sort(
      (a, b) =>
        USEFUL.indexOf(domainOf(a.entity_id)) - USEFUL.indexOf(domainOf(b.entity_id)) ||
        a.entity_id.localeCompare(b.entity_id),
    );
    // Three rows of four, less the four cells a thermostat takes.
    let room = 12;
    const tiles: Array<GridTileConfig | string> = [];
    for (const s of entities) {
      const tile = tileFor(s.entity_id);
      const kind = typeof tile === 'object' ? tile.type : 'entity';
      const cells = kind === 'thermostat' ? 4 : kind === 'now-playing' ? 2 : 1;
      if (cells > room) continue;
      tiles.push(tile);
      room -= cells;
    }
    pages.push({ type: 'grid', title: area.name, tiles });
  }
  return pages;
}
