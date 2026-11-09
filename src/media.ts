import type { HassEntity, HomeAssistant } from './types';

/** media_player supported_features bits. */
export const MEDIA = {
  PAUSE: 1,
  SEEK: 2,
  VOLUME_SET: 4,
  VOLUME_MUTE: 8,
  PREVIOUS: 16,
  NEXT: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
  PLAY_MEDIA: 512,
  PLAY: 16384,
  SHUFFLE_SET: 32768,
  REPEAT_SET: 262144,
  GROUPING: 524288,
} as const;

export const supports = (s: HassEntity | undefined, bit: number): boolean =>
  !!s && ((s.attributes.supported_features ?? 0) & bit) !== 0;

/** One of Music Assistant's players; not one of its dashboard displays. */
export function isMusicAssistant(hass: HomeAssistant | undefined, s: HassEntity): boolean {
  if ('mass_player_type' in s.attributes) return true;
  return hass?.entities?.[s.entity_id]?.platform === 'music_assistant' && s.attributes.device_class !== 'tv';
}

/** A Music Assistant dashboard display: a screen it shows itself on, not a speaker. */
function isDisplay(hass: HomeAssistant | undefined, s: HassEntity): boolean {
  return hass?.entities?.[s.entity_id]?.platform === 'music_assistant' && !isMusicAssistant(hass, s);
}

export function playerName(s: HassEntity): string {
  return (s.attributes.friendly_name as string | undefined) ?? s.entity_id;
}

/**
 * The speakers to offer, by name. Music Assistant's players when it has any:
 * they stand in for the speakers' own integrations, which would repeat them.
 */
export function speakers(hass: HomeAssistant | undefined): HassEntity[] {
  if (!hass) return [];
  const all = Object.values(hass.states).filter(
    (s) => s.entity_id.startsWith('media_player.') && !hass.entities?.[s.entity_id]?.hidden && !isDisplay(hass, s),
  );
  const mass = all.filter((s) => isMusicAssistant(hass, s));
  return (mass.length ? mass : all).sort((a, b) => playerName(a).localeCompare(playerName(b)));
}

/** The speakers playing together with `s`, itself included; just `s` when it plays alone. */
export function groupOf(s: HassEntity): string[] {
  const members = s.attributes.group_members;
  return Array.isArray(members) && members.length > 1 ? (members as string[]) : [s.entity_id];
}

/**
 * The speaker the quick panel follows: the configured one, or else the best
 * guess. Playing beats paused beats idle, and Music Assistant's players beat
 * the speakers' own integrations, which tend to duplicate them.
 */
export function pickPlayer(hass: HomeAssistant | undefined, configured?: string): HassEntity | undefined {
  if (!hass) return undefined;
  if (configured) return hass.states[configured];
  const rank = (s: HassEntity) =>
    ({ playing: 0, paused: 2, buffering: 0, on: 4, idle: 4 })[s.state] ?? 6;
  return Object.values(hass.states)
    .filter((s) => s.entity_id.startsWith('media_player.') && s.state !== 'unavailable')
    .filter((s) => !hass.entities?.[s.entity_id]?.hidden && !isDisplay(hass, s))
    .sort(
      (a, b) =>
        rank(a) - (isMusicAssistant(hass, a) ? 1 : 0) - (rank(b) - (isMusicAssistant(hass, b) ? 1 : 0)) ||
        a.entity_id.localeCompare(b.entity_id),
    )[0];
}

/** Where playback is, in seconds: the last report, counted on while it plays. */
export function mediaPosition(s: HassEntity, now = Date.now()): number | undefined {
  const a = s.attributes;
  if (typeof a.media_position !== 'number') return undefined;
  let position = a.media_position;
  const since = typeof a.media_position_updated_at === 'string' ? Date.parse(a.media_position_updated_at) : NaN;
  if (s.state === 'playing' && !Number.isNaN(since)) position += Math.max(0, now - since) / 1000;
  const duration = typeof a.media_duration === 'number' && a.media_duration > 0 ? a.media_duration : Infinity;
  return Math.max(0, Math.min(duration, position));
}

/** 75 → "1:15"; 3725 → "1:02:05". */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// ---- Music Assistant ----------------------------------------------------------

/** An item in Music Assistant's library, as its actions return them. */
export interface MassItem {
  media_type: string;
  uri: string;
  name: string;
  version?: string;
  image?: string | null;
  favorite?: boolean;
  artists?: MassItem[];
  album?: MassItem;
}

export type MassType = 'artist' | 'album' | 'track' | 'playlist' | 'radio' | 'audiobook' | 'podcast';

export interface MassSearch {
  artists?: MassItem[];
  albums?: MassItem[];
  tracks?: MassItem[];
  playlists?: MassItem[];
  radio?: MassItem[];
}

/** Calls an action that answers, such as Music Assistant's search. */
async function withResponse<T>(
  hass: HomeAssistant,
  domain: string,
  service: string,
  data: Record<string, unknown>,
  target?: Record<string, unknown>,
): Promise<T> {
  if (!hass.callWS) throw new Error('Home Assistant isn’t connected');
  const result = await hass.callWS<{ response: T }>({
    type: 'call_service',
    domain,
    service,
    service_data: data,
    ...(target ? { target } : {}),
    return_response: true,
  });
  return result.response;
}

const entries = new Map<string, Promise<string | undefined>>();

/** The Music Assistant server a player belongs to: its config entry, which its library calls need. */
function massEntry(hass: HomeAssistant, entityId: string): Promise<string | undefined> {
  let entry = entries.get(entityId);
  if (!entry) {
    entry = (async () => {
      try {
        const registered = await hass.callWS!<{ config_entry_id?: string | null }>({
          type: 'config/entity_registry/get',
          entity_id: entityId,
        });
        if (registered?.config_entry_id) return registered.config_entry_id;
      } catch {
        // Asked the other way below.
      }
      const servers = await hass.callWS!<Array<{ entry_id: string; state?: string }>>({
        type: 'config_entries/get',
        domain: 'music_assistant',
      });
      return (servers.find((s) => s.state === 'loaded') ?? servers[0])?.entry_id;
    })();
    entries.set(entityId, entry);
    // A failure is asked again next time.
    entry.catch(() => entries.delete(entityId));
  }
  return entry;
}

async function entryOf(hass: HomeAssistant, entityId: string): Promise<string> {
  const entry = await massEntry(hass, entityId);
  if (!entry) throw new Error('Music Assistant isn’t set up in Home Assistant');
  return entry;
}

export async function massLibrary(
  hass: HomeAssistant,
  entityId: string,
  type: MassType,
  options: { favorite?: boolean; limit?: number; offset?: number } = {},
): Promise<MassItem[]> {
  const response = await withResponse<{ items?: MassItem[] }>(hass, 'music_assistant', 'get_library', {
    config_entry_id: await entryOf(hass, entityId),
    media_type: type,
    ...(options.favorite ? { favorite: true } : {}),
    limit: options.limit ?? 50,
    offset: options.offset ?? 0,
    order_by: 'name',
  });
  return response?.items ?? [];
}

export async function massSearch(hass: HomeAssistant, entityId: string, query: string, limit = 8): Promise<MassSearch> {
  return (
    (await withResponse<MassSearch>(hass, 'music_assistant', 'search', {
      config_entry_id: await entryOf(hass, entityId),
      name: query,
      media_type: ['artist', 'album', 'track', 'playlist', 'radio'],
      limit,
    })) ?? {}
  );
}

/** Plays an item, queued the way Music Assistant is set to queue its kind. */
export function massPlay(hass: HomeAssistant, entityId: string, item: MassItem): Promise<unknown> {
  return hass.callService('music_assistant', 'play_media', {
    entity_id: entityId,
    media_id: item.uri,
    media_type: item.media_type,
  });
}

/** Moves what `from` is playing, its queue and all, to `to`. */
export function massTransfer(hass: HomeAssistant, to: string, from: string): Promise<unknown> {
  return hass.callService('music_assistant', 'transfer_queue', { entity_id: to, source_player: from, auto_play: true });
}

/** The name of what plays next in a player's queue. */
export async function massUpNext(hass: HomeAssistant, entityId: string): Promise<string | undefined> {
  const response = await withResponse<Record<string, { next_item?: { name?: string } | null } | undefined>>(
    hass,
    'music_assistant',
    'get_queue',
    {},
    { entity_id: entityId },
  );
  return response?.[entityId]?.next_item?.name || undefined;
}

/** Music Assistant's Favorite current song button for a player, if it has one. */
export function favoriteButton(hass: HomeAssistant | undefined, entityId: string): string | undefined {
  const device = hass?.entities?.[entityId]?.device_id;
  if (!device) return undefined;
  return Object.values(hass!.entities!).find(
    (e) =>
      e.entity_id.startsWith('button.') &&
      e.device_id === device &&
      e.platform === 'music_assistant' &&
      (e.translation_key === 'favorite_now_playing' || e.entity_id.includes('favorite')),
  )?.entity_id;
}
