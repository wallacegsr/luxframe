import type { GridTileConfig, GridTileType, TileSize, TileSpan } from './types';

// How big a tile is on a grid page. A tile's `size` is one of the presets
// (s, w, m, l) or any columns × rows, written "3x2". Tiles themselves only
// know the four presets as shapes, so a custom size draws as the nearest one.

/** Columns × rows each preset covers, before clamping to the grid's width. */
export const SPANS: Record<TileSize, [number, number]> = {
  s: [1, 1],
  w: [2, 1],
  m: [2, 2],
  l: [4, 2],
};

/** The tallest a tile can be, in rows. */
export const MAX_ROWS = 8;

const DEFAULT_SIZE: Record<GridTileType, TileSize> = {
  entity: 's',
  thermostat: 'm',
  weather: 's',
  clock: 's',
  'analog-clock': 's',
  calendar: 'm',
  'now-playing': 'w',
  camera: 'm',
  photo: 'm',
  sun: 's',
  todo: 'm',
  room: 's',
  card: 'm',
};

/** The tile's size as written, or its kind's default. */
export function sizeOf(tile: GridTileConfig): TileSize | TileSpan {
  return tile.size ?? DEFAULT_SIZE[tile.type ?? 'entity'] ?? 's';
}

/** "m" → [2, 2], "3x2" → [3, 2]; undefined for anything else. */
export function parseSize(size: unknown): [number, number] | undefined {
  if (typeof size !== 'string') return undefined;
  if (size in SPANS) return SPANS[size as TileSize];
  const match = /^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i.exec(size);
  if (!match) return undefined;
  const w = Number(match[1]);
  const h = Number(match[2]);
  return w >= 1 && h >= 1 ? [w, h] : undefined;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Columns × rows the tile covers on a grid this many columns wide. */
export function spanOf(tile: GridTileConfig, columns: number): [number, number] {
  const [w, h] =
    parseSize(sizeOf(tile)) ?? SPANS[DEFAULT_SIZE[tile.type ?? 'entity'] ?? 's'];
  return [clamp(w, 1, Math.max(1, columns)), clamp(h, 1, MAX_ROWS)];
}

/** How to write a span: a preset's letter when it is one, else "3x2". */
export function sizeFor(w: number, h: number): TileSize | TileSpan {
  const preset = (Object.keys(SPANS) as TileSize[]).find((s) => SPANS[s][0] === w && SPANS[s][1] === h);
  return preset ?? `${w}x${h}`;
}

/**
 * The preset shape a tile draws itself as: its preset when it has one, else
 * the nearest. One row tall and wider than a column is wide; two or more rows
 * is medium, or large from four columns. A single column stays small, however
 * tall.
 */
export function shapeOf(tile: GridTileConfig, w: number, h: number): TileSize {
  const size = sizeOf(tile);
  if (size in SPANS) return size as TileSize;
  if (w <= 1) return 's';
  if (h <= 1) return 'w';
  return w >= 4 ? 'l' : 'm';
}
