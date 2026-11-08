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
  /** The integration that made it, e.g. `music_assistant`. */
  platform?: string;
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
  /** Sends a websocket command; used to read and save the dashboard. */
  callWS?<T>(message: Record<string, unknown>): Promise<T>;
  user?: { name?: string; is_admin: boolean };
  language?: string;
  /** REST calls against Home Assistant's API, e.g. calendar events. */
  callApi?<T>(method: 'GET' | 'POST', path: string, data?: Record<string, unknown>): Promise<T>;
  /** The websocket, for subscriptions such as weather forecasts. */
  connection?: {
    subscribeMessage<T>(callback: (message: T) => void, message: Record<string, unknown>): Promise<() => void>;
  };
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

/** Any columns × rows, such as "3x2". */
export type TileSpan = `${number}x${number}`;

interface GridTileBase {
  /** A preset, or any columns × rows such as "3x2". */
  size?: TileSize | TileSpan;
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

export interface CalendarTileConfig extends GridTileBase {
  type: 'calendar';
  /** Calendars to show; all of them when left out. */
  entities?: string[];
  /** Coming events (default), or this month with marked days. */
  view?: 'upcoming' | 'month';
}

export interface NowPlayingTileConfig extends GridTileBase {
  type: 'now-playing';
  /** Defaults to whichever speaker is playing, Music Assistant's first. */
  entity?: string;
}

export interface CameraTileConfig extends GridTileBase {
  type: 'camera';
  entity: string;
}

export interface PhotoTileConfig extends GridTileBase {
  type: 'photo';
  /** A media source folder; default `media-source://media_source/local`. */
  folder?: string;
  /** Seconds per photo. Default 30. */
  interval?: number;
}

export interface SunTileConfig extends GridTileBase {
  type: 'sun';
  /** Default `sun.sun`. */
  entity?: string;
}

export interface TodoTileConfig extends GridTileBase {
  type: 'todo';
  entity: string;
}

/** Any Home Assistant card, built by Home Assistant. */
export interface CardTileConfig extends GridTileBase {
  type: 'card';
  /** The card's config, as in a dashboard's YAML. */
  card: Record<string, unknown>;
  /** Default true: glass behind the card instead of its own background. */
  glass?: boolean;
  /**
   * How the card meets the tile. `stretch` (default): the card fills the tile
   * if it can grow, and scrolls if it's taller. `cover`: the whole card scales
   * evenly until it fills the tile, centered, with the overflow trimmed.
   * `contain`: the whole card shows, centered, shrunk if it's too tall.
   */
  fit?: 'stretch' | 'cover' | 'contain';
}

export interface RoomTileConfig extends GridTileBase {
  type: 'room';
  /** An area id or name. */
  area: string;
}

export type GridTileConfig =
  | EntityTileConfig
  | ThermostatTileConfig
  | WeatherTileConfig
  | ClockTileConfig
  | CalendarTileConfig
  | NowPlayingTileConfig
  | CameraTileConfig
  | PhotoTileConfig
  | SunTileConfig
  | TodoTileConfig
  | RoomTileConfig
  | CardTileConfig;

export type GridTileType = NonNullable<GridTileConfig['type']>;

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

export interface WeatherPageConfig {
  type: 'weather';
  /** Defaults to the first weather entity. */
  entity?: string;
}

export interface CalendarPageConfig {
  type: 'calendar';
  title?: string;
  /** Calendars to show; all of them when left out. */
  entities?: string[];
  /** How many days ahead. Default 7. */
  days?: number;
}

export interface CamerasPageConfig {
  type: 'cameras';
  title?: string;
  /** Cameras to show; all of them when left out. */
  entities?: string[];
}

export interface PhotosPageConfig {
  type: 'photos';
  folder?: string;
  interval?: number;
  /** Show the time over the photos. Default true. */
  clock?: boolean;
}

export interface NightPageConfig {
  type: 'night';
  /** A weather entity for the temperature under the clock. */
  weather?: string;
}

export type PageConfig = (
  | ClockPageConfig
  | RoomPageConfig
  | ScenesPageConfig
  | GridPageConfig
  | WeatherPageConfig
  | CalendarPageConfig
  | CamerasPageConfig
  | PhotosPageConfig
  | NightPageConfig
) & {
  /** Kept in the config but left out of the frame. */
  hidden?: boolean;
};

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
  /** The panel pulled down from the top edge, or `false` for none. */
  quick_panel?: QuickPanelConfig | false;
  /** Asking Home Assistant by typing; an `agent_id` picks the conversation agent. */
  assist?: boolean | { agent_id?: string };
  /** `glass` blurs; `flat` uses solid tiles; `auto` (default) goes flat on slow devices. */
  style?: 'auto' | 'glass' | 'flat';
}

export interface QuickPanelConfig {
  /** Defaults to whichever speaker is playing, Music Assistant's first. */
  media_player?: string;
  /** Up to four entities shown as small tiles: a light, a lock, a scene. */
  pinned?: string[];
}

/** Every page element receives these two properties from the frame. */
export interface PageElement extends HTMLElement {
  hass?: HomeAssistant;
  config?: PageConfig;
}
