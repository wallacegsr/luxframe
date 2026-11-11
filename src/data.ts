import { html, type ReactiveController, type ReactiveControllerHost } from 'lit';
import type { HassEntity, HomeAssistant } from './types';

// Reading what isn't in `hass.states`: calendar events, forecasts, to-do
// items and photos. Everything here fails soft: a missing API or an error
// leaves the caller with nothing, which it shows as a plain message.

/**
 * Runs `load` when the host connects and every `ms` after, until it
 * disconnects. `refresh()` runs it now, e.g. when the entity changes.
 */
export class Poller implements ReactiveController {
  private _timer?: number;

  constructor(
    host: ReactiveControllerHost,
    private readonly _load: () => void | Promise<void>,
    private readonly _ms: number,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    this.refresh();
  }

  hostDisconnected(): void {
    window.clearTimeout(this._timer);
  }

  refresh(): void {
    window.clearTimeout(this._timer);
    Promise.resolve(this._load())
      .catch(() => undefined)
      .finally(() => {
        this._timer = window.setTimeout(() => this.refresh(), this._ms);
      });
  }
}

const idsIn = (hass: HomeAssistant | undefined, domain: string): string[] =>
  Object.keys(hass?.states ?? {})
    .filter((id) => id.startsWith(`${domain}.`))
    .filter((id) => !hass?.entities?.[id]?.hidden)
    .sort();

/** The configured entities, or every one of the domain. */
export const entitiesOr = (hass: HomeAssistant | undefined, domain: string, configured?: string[]) =>
  configured?.length ? configured : idsIn(hass, domain);

// ---- Calendar ---------------------------------------------------------------

export interface CalendarEvent {
  calendar: string;
  summary: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
}

interface RawEvent {
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
}

/** An all-day date ("2026-11-07") is local midnight, not UTC midnight. */
const parseDate = (value: { dateTime?: string; date?: string }): Date =>
  value.dateTime ? new Date(value.dateTime) : new Date(`${value.date}T00:00:00`);

/** Events from every calendar between `start` and `end`, soonest first. */
export async function fetchEvents(
  hass: HomeAssistant | undefined,
  calendars: string[],
  start: Date,
  end: Date,
): Promise<CalendarEvent[]> {
  if (!hass?.callApi || !calendars.length) return [];
  const range = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
  const lists = await Promise.all(
    calendars.map((calendar) =>
      hass
        .callApi!<RawEvent[]>('GET', `calendars/${calendar}?${range}`)
        .then((events) =>
          events.map((e) => ({
            calendar,
            summary: e.summary ?? '(No title)',
            start: parseDate(e.start),
            end: parseDate(e.end),
            allDay: !e.start.dateTime,
            location: e.location,
          })),
        )
        .catch(() => [] as CalendarEvent[]),
    ),
  );
  return lists.flat().sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** One color per calendar, in the order given. */
const CALENDAR_COLORS = ['#ff9f0a', '#64d2ff', '#30d158', '#bf5af2', '#ff453a', '#ffd60a'];
export const calendarColor = (calendars: string[], id: string): string =>
  CALENDAR_COLORS[Math.max(0, calendars.indexOf(id)) % CALENDAR_COLORS.length];

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, days: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
export const sameDay = (a: Date, b: Date): boolean => startOfDay(a).getTime() === startOfDay(b).getTime();

/** "Today", "Tomorrow", or "Monday 9 November". */
export function dayLabel(hass: HomeAssistant | undefined, day: Date, now = new Date()): string {
  if (sameDay(day, now)) return 'Today';
  if (sameDay(day, addDays(now, 1))) return 'Tomorrow';
  return day.toLocaleDateString(hass?.locale?.language, { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---- Weather forecast ---------------------------------------------------------

export interface Forecast {
  datetime: string;
  condition?: string;
  temperature?: number;
  templow?: number;
  precipitation_probability?: number;
}

/** weather supported_features: which forecasts the entity offers. */
export const FORECAST = { daily: 1, hourly: 2, twice_daily: 4 } as const;

/** Subscribes to a forecast; resolves to the unsubscribe, or undefined when unavailable. */
export async function subscribeForecast(
  hass: HomeAssistant | undefined,
  entityId: string,
  type: keyof typeof FORECAST,
  callback: (forecast: Forecast[]) => void,
): Promise<(() => void) | undefined> {
  const s = hass?.states[entityId];
  if (!hass?.connection || !s || !((s.attributes.supported_features ?? 0) & FORECAST[type])) return undefined;
  try {
    return await hass.connection.subscribeMessage<{ forecast?: Forecast[] | null }>(
      (message) => callback(message.forecast ?? []),
      { type: 'weather/subscribe_forecast', entity_id: entityId, forecast_type: type },
    );
  } catch {
    return undefined;
  }
}

export const CONDITIONS: Record<string, { label: string; icon: string }> = {
  'clear-night': { label: 'Clear', icon: 'mdi:weather-night' },
  cloudy: { label: 'Cloudy', icon: 'mdi:weather-cloudy' },
  exceptional: { label: 'Exceptional', icon: 'mdi:alert-circle-outline' },
  fog: { label: 'Fog', icon: 'mdi:weather-fog' },
  hail: { label: 'Hail', icon: 'mdi:weather-hail' },
  lightning: { label: 'Lightning', icon: 'mdi:weather-lightning' },
  'lightning-rainy': { label: 'Thunderstorms', icon: 'mdi:weather-lightning-rainy' },
  partlycloudy: { label: 'Partly cloudy', icon: 'mdi:weather-partly-cloudy' },
  pouring: { label: 'Pouring', icon: 'mdi:weather-pouring' },
  rainy: { label: 'Rain', icon: 'mdi:weather-rainy' },
  snowy: { label: 'Snow', icon: 'mdi:weather-snowy' },
  'snowy-rainy': { label: 'Sleet', icon: 'mdi:weather-snowy-rainy' },
  sunny: { label: 'Sunny', icon: 'mdi:weather-sunny' },
  windy: { label: 'Windy', icon: 'mdi:weather-windy' },
  'windy-variant': { label: 'Windy', icon: 'mdi:weather-windy-variant' },
};

export const conditionLabel = (hass: HomeAssistant | undefined, s: HassEntity): string =>
  hass?.formatEntityState?.(s) ?? CONDITIONS[s.state]?.label ?? s.state;

/** A condition icon from HA's icon set, or nothing outside HA. */
export const conditionIcon = (condition: string | undefined, size = 28) =>
  customElements.get('ha-icon') && condition && CONDITIONS[condition]
    ? html`<ha-icon .icon=${CONDITIONS[condition].icon} style="--mdc-icon-size: ${size}px"></ha-icon>`
    : html``;

export const firstWeather = (hass: HomeAssistant | undefined, configured?: string): HassEntity | undefined => {
  const id = configured ?? idsIn(hass, 'weather')[0];
  return id ? hass?.states[id] : undefined;
};

// ---- To-do --------------------------------------------------------------------

export interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
}

export async function fetchTodo(hass: HomeAssistant | undefined, entityId: string): Promise<TodoItem[]> {
  if (!hass?.callWS || !hass.states[entityId]) return [];
  const result = await hass.callWS<{ items: TodoItem[] }>({ type: 'todo/item/list', entity_id: entityId });
  return result.items ?? [];
}

// ---- Photos --------------------------------------------------------------------

export const DEFAULT_PHOTOS = 'media-source://media_source/local';

interface BrowseItem {
  title: string;
  media_content_id: string;
  media_class?: string;
  media_content_type?: string;
  can_expand?: boolean;
  children?: BrowseItem[];
}

/** Ids of the images directly in a media folder. */
export async function listPhotos(hass: HomeAssistant | undefined, folder = DEFAULT_PHOTOS): Promise<string[]> {
  if (!hass?.callWS) return [];
  const id = folder.startsWith('media-source://') ? folder : `${DEFAULT_PHOTOS}/${folder.replace(/^\/+/, '')}`;
  const result = await hass.callWS<BrowseItem>({ type: 'media_source/browse_media', media_content_id: id });
  return (result.children ?? [])
    .filter((c) => c.media_class === 'image' || c.media_content_type?.startsWith('image/'))
    .map((c) => c.media_content_id);
}

/**
 * Home Assistant's Immich integration lists each Immich server it's set up
 * with (an API key per server, kept in Home Assistant) as a media source:
 * its albums, people, tags and favorites become folders, and their photos
 * reach the browser through Home Assistant, signed.
 */
export const IMMICH_ROOT = 'media-source://immich';

export interface PhotoAlbum {
  /** The album's media source folder. */
  id: string;
  title: string;
}

let albums: { at: number; list: Promise<PhotoAlbum[]> } | undefined;
const ALBUMS_MS = 5 * 60_000;

/** Every Immich album, plus each server's favorites; empty without the integration. */
export function immichAlbums(hass: HomeAssistant | undefined): Promise<PhotoAlbum[]> {
  const callWS = hass?.callWS?.bind(hass);
  if (!callWS) return Promise.resolve([]);
  if (albums && Date.now() - albums.at < ALBUMS_MS) return albums.list;
  const browse = (id: string) =>
    callWS<BrowseItem>({ type: 'media_source/browse_media', media_content_id: id });
  const list = browse(IMMICH_ROOT)
    .then(async (root) => {
      const servers = root.children ?? [];
      const found = await Promise.all(
        servers.map(async (server) => {
          const named = (title: string) => (servers.length > 1 ? `${title} (${server.title})` : title);
          const inside = await browse(`${server.media_content_id}|albums`).catch(() => undefined);
          return [
            { id: `${server.media_content_id}|favorites|favorites`, title: named('Favorites') },
            ...(inside?.children ?? []).map((a) => ({ id: a.media_content_id, title: named(a.title) })),
          ];
        }),
      );
      return found.flat();
    })
    .catch(() => []);
  albums = { at: Date.now(), list };
  return list;
}

/**
 * The folder photos come from: an Immich album named by `album` (its name,
 * any case, or its id), else `folder`. Throws when there's no such album.
 */
export async function photoFolder(
  hass: HomeAssistant | undefined,
  source: { folder?: string; album?: string },
): Promise<string | undefined> {
  const album = source.album?.trim();
  if (!album) return source.folder;
  const wanted = album.toLowerCase();
  const found = (await immichAlbums(hass)).find(
    (a) => a.title.toLowerCase() === wanted || a.id === album || a.id.endsWith(`|${album}`),
  );
  if (!found) throw new Error(`No Immich album called \u201c${album}\u201d`);
  return found.id;
}

/** A signed URL for one photo, good for a few minutes. */
export async function photoUrl(hass: HomeAssistant | undefined, mediaId: string): Promise<string | undefined> {
  if (!hass?.callWS) return undefined;
  const result = await hass.callWS<{ url: string }>({
    type: 'media_source/resolve_media',
    media_content_id: mediaId,
    expires: 3600,
  });
  return result.url;
}

// ---- Cameras ---------------------------------------------------------------------

/** The camera's current still, with a cache-buster so it refreshes. */
export function cameraStill(s: HassEntity | undefined, tick: number): string | undefined {
  const picture: string | undefined = s?.attributes.entity_picture;
  if (!picture) return undefined;
  return `${picture}${picture.includes('?') ? '&' : '?'}t=${tick}`;
}

// ---- Areas -------------------------------------------------------------------------

/** An area by id or by name (any case). */
export function findArea(hass: HomeAssistant | undefined, area: string) {
  const areas = Object.values(hass?.areas ?? {});
  return areas.find((a) => a.area_id === area) ?? areas.find((a) => a.name.toLowerCase() === area.toLowerCase());
}

/** Visible entities in an area, directly or through their device. */
export function entitiesInArea(hass: HomeAssistant | undefined, areaId: string): HassEntity[] {
  if (!hass?.entities) return [];
  return Object.values(hass.entities)
    .filter((e) => !e.hidden && !e.entity_category)
    .filter((e) => (e.area_id ?? (e.device_id ? hass.devices?.[e.device_id]?.area_id : undefined)) === areaId)
    .map((e) => hass.states[e.entity_id])
    .filter((s): s is HassEntity => !!s);
}
