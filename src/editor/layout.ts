import { areaName, domainOf, resolve } from '../entity';
import type { GridPageConfig, GridTileConfig, HassEntity, HomeAssistant, PageConfig } from '../types';

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
    default: {
      const { entity, name } = tile as { entity: string; name?: string };
      return name ?? resolve(hass, entity).name;
    }
  }
}

export function pageLabel(page: PageConfig, index: number): string {
  if ('title' in page && page.title) return page.title;
  const kind = { clock: 'Clock', room: 'Room', scenes: 'Scenes', grid: 'Tiles' }[page.type];
  return `${kind} · page ${index + 1}`;
}

/** The tile an entity gets when it's picked: a thermostat for climate, and so on. */
export function tileFor(entityId: string): GridTileConfig | string {
  switch (domainOf(entityId)) {
    case 'climate':
      return { type: 'thermostat', entity: entityId };
    case 'weather':
      return { type: 'weather', entity: entityId };
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

export function isUseful(entityId: string): boolean {
  return USEFUL.includes(domainOf(entityId)) || domainOf(entityId) === 'weather';
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
      const cells = typeof tile === 'object' && tile.type === 'thermostat' ? 4 : 1;
      if (cells > room) continue;
      tiles.push(tile);
      room -= cells;
    }
    pages.push({ type: 'grid', title: area.name, tiles });
  }
  return pages;
}
