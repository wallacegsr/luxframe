// The slice of Home Assistant's frontend `hass` object LuxFrame relies on.
// HA passes the full object; keeping this narrow makes the mock in dev/ easy.

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed?: string;
}

/** Registry entries HA's frontend keeps on `hass` (2023.6 and later). */
export interface HassEntityRegistryEntry {
  entity_id: string;
  area_id?: string | null;
  device_id?: string | null;
  hidden?: boolean;
  entity_category?: string | null;
}

export interface HassDevice {
  id: string;
  area_id?: string | null;
}

export interface HassArea {
  area_id: string;
  name: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities?: Record<string, HassEntityRegistryEntry>;
  devices?: Record<string, HassDevice>;
  areas?: Record<string, HassArea>;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ): Promise<unknown>;
  locale?: { language: string; time_format?: '12' | '24' | 'language' | 'system' };
  themes?: { darkMode?: boolean };
  config?: { unit_system?: { temperature?: string } };
  formatEntityState?(stateObj: HassEntity, state?: string): string;
}

export type EntityRef = string | { entity: string; name?: string; icon?: string };

export interface ClockPageConfig {
  type: 'clock';
  weather?: string;
  greeting?: boolean;
}

export interface RoomPageConfig {
  type: 'room';
  title: string;
  entities: EntityRef[];
  /** Read-only sensors shown as chips beside the title, e.g. temperature. */
  sensors?: string[];
}

export interface ScenesPageConfig {
  type: 'scenes';
  title?: string;
  scenes: EntityRef[];
}

/** s = 1×1, w = 2×1, m = 2×2, l = 4×2 grid cells (clamped to the grid's columns). */
export type TileSize = 's' | 'w' | 'm' | 'l';

interface GridTileBase {
  size?: TileSize;
}

export interface EntityTileConfig extends GridTileBase {
  type?: 'entity';
  entity: string;
  name?: string;
  icon?: string;
}

export interface ThermostatTileConfig extends GridTileBase {
  type: 'thermostat';
  entity: string;
  name?: string;
}

export interface WeatherTileConfig extends GridTileBase {
  type: 'weather';
  /** Defaults to the first weather entity in Home Assistant. */
  entity?: string;
}

export interface ClockTileConfig extends GridTileBase {
  type: 'clock' | 'analog-clock';
}

export type GridTileConfig =
  | EntityTileConfig
  | ThermostatTileConfig
  | WeatherTileConfig
  | ClockTileConfig;

export interface GridPageConfig {
  type: 'grid';
  title?: string;
  /** Rows that fit on one screen; more tiles than that scroll. Default 3. */
  rows?: number;
  /** Rows on one screen when the tablet is upright. Default `rows` + 2. */
  portrait_rows?: number;
  /** Default 4. */
  columns?: number;
  /** A tile, or a bare entity id for a small entity tile. */
  tiles: Array<GridTileConfig | string>;
}

export type PageConfig = ClockPageConfig | RoomPageConfig | ScenesPageConfig | GridPageConfig;

export interface LuxFrameConfig {
  type: string;
  pages: PageConfig[];
  /** LuxFrame's glass look (auto/light/dark), or `ha` to use the active HA theme. */
  theme?: 'auto' | 'light' | 'dark' | 'ha';
  /** CSS background behind the pages, e.g. `center / cover url('/local/wall.jpg')`. */
  background?: string;
  /** Color the glass is tinted with. Defaults to the background image's average color. */
  tint?: string;
  /** Seconds without a touch before swinging back to the first page; 0 turns it off. */
  home_after?: number;
  /** CSS height of the frame. Defaults to the viewport minus HA's header. */
  height?: string;
}

/** Every page element receives these two properties from the frame. */
export interface PageElement extends HTMLElement {
  hass?: HomeAssistant;
  config?: PageConfig;
}
