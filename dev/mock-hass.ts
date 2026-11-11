import type { HassEntity, HassEntityRegistryEntry, HomeAssistant } from '../src/types';

// A tiny stand-in for Home Assistant so the frame can be developed in a
// browser. Service calls change state locally; scenes and scripts just log.

const entity = (entity_id: string, state: string, attributes: Record<string, any> = {}): HassEntity => ({
  entity_id,
  state,
  attributes,
});

const DIMMABLE = { supported_color_modes: ['brightness'] };

/** Everything a Music Assistant speaker can do: pause, seek, volume, mute, tracks, power, play media, shuffle, browse, repeat, grouping. */
const MASS_FEATURES = 1 | 2 | 4 | 8 | 16 | 32 | 128 | 256 | 512 | 16384 | 32768 | 131072 | 262144 | 524288;
const mass = (attributes: Record<string, any>) => ({
  mass_player_type: 'player',
  device_class: 'speaker',
  supported_features: MASS_FEATURES,
  shuffle: false,
  repeat: 'off',
  is_volume_muted: false,
  group_members: [],
  ...attributes,
});

/** Artwork for the mock library: a gradient per item. */
const cover = (hue: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue} 65% 58%)'/><stop offset='1' stop-color='hsl(${(hue + 60) % 360} 60% 28%)'/></linearGradient></defs><rect width='100' height='100' fill='url(#g)'/><circle cx='50' cy='50' r='16' fill='none' stroke='white' stroke-opacity='.55' stroke-width='3'/></svg>`,
  )}`;

const initial: HassEntity[] = [
  entity('weather.home', 'partlycloudy', {
    friendly_name: 'Home',
    supported_features: 3,
    temperature: 18.4,
    temperature_unit: '°C',
    humidity: 62,
    wind_speed: 14,
    wind_speed_unit: 'km/h',
  }),
  entity('climate.living_room', 'heat', {
    friendly_name: 'Thermostat',
    temperature: 21.5,
    current_temperature: 20.5,
    min_temp: 7,
    max_temp: 35,
    target_temp_step: 0.5,
    hvac_action: 'heating',
    hvac_modes: ['off', 'heat', 'cool', 'auto'],
    fan_mode: 'auto',
    fan_modes: ['auto', 'on'],
    preset_mode: 'home',
    preset_modes: ['home', 'away', 'sleep', 'away_indefinitely'],
  }),
  entity('light.living_room', 'on', { friendly_name: 'Living Room Ceiling', brightness: 180, ...DIMMABLE }),
  entity('light.floor_lamp', 'off', { friendly_name: 'Floor lamp', ...DIMMABLE }),
  entity('light.reading', 'on', { friendly_name: 'Reading light', brightness: 64, ...DIMMABLE }),
  entity('light.bedside', 'off', {
    friendly_name: 'Bedroom Bedside Lamp',
    supported_color_modes: ['color_temp', 'hs'],
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6500,
  }),
  entity('light.porch', 'on', { friendly_name: 'Porch Light', supported_color_modes: ['onoff'] }),
  entity('fan.ceiling', 'off', { friendly_name: 'Ceiling fan', percentage: 0, percentage_step: 25 }),
  entity('fan.bedroom', 'on', {
    friendly_name: 'Bedroom Fan',
    percentage: 50,
    percentage_step: 25,
    preset_modes: ['auto', 'sleep'],
    preset_mode: null,
    oscillating: false,
  }),
  entity('switch.coffee', 'off', { friendly_name: 'Coffee machine' }),
  entity('cover.blinds', 'open', { friendly_name: 'Blinds', current_position: 100 }),
  entity('cover.shades', 'open', {
    friendly_name: 'Bedroom Shades',
    current_position: 40,
    supported_features: 15,
  }),
  entity('cover.garage', 'closed', { friendly_name: 'Garage', device_class: 'garage' }),
  entity('lock.front_door', 'locked', { friendly_name: 'Front Door' }),
  entity('sensor.living_temperature', '21.5', {
    friendly_name: 'Living Room Temperature',
    unit_of_measurement: '°C',
    device_class: 'temperature',
    state_class: 'measurement',
  }),
  entity('sensor.bedroom_temperature', '19.8', {
    friendly_name: 'Bedroom Temperature',
    unit_of_measurement: '°C',
    device_class: 'temperature',
    state_class: 'measurement',
  }),
  entity('sensor.living_humidity', '44', {
    friendly_name: 'Living Room Humidity',
    unit_of_measurement: '%',
    device_class: 'humidity',
    state_class: 'measurement',
  }),
  {
    ...entity('event.front_door_motion', new Date(Date.now() - 29 * 60_000).toISOString(), {
      friendly_name: 'Front Door Motion',
      event_type: 'motion',
      device_class: 'motion',
    }),
    last_changed: new Date(Date.now() - 29 * 60_000).toISOString(),
  },
  entity('light.kitchen', 'off', { friendly_name: 'Kitchen', ...DIMMABLE }),
  entity('light.island', 'on', { friendly_name: 'Island pendants', brightness: 255, ...DIMMABLE }),
  entity('scene.arrive_home', 'scening', { friendly_name: 'Arrive Home' }),
  entity('scene.morning', 'scening', { friendly_name: 'Morning' }),
  entity('scene.movie', 'scening', { friendly_name: 'Movie night' }),
  entity('scene.dinner', 'scening', { friendly_name: 'Dinner' }),
  entity('scene.goodnight', 'scening', { friendly_name: 'Good night' }),
  entity('script.leave_home', 'off', { friendly_name: 'Leave home' }),
  entity(
    'media_player.living_room',
    'playing',
    mass({
      friendly_name: 'Living Room Speaker',
      media_title: 'Slow Harbour',
      media_artist: 'The Lanterns',
      media_album_name: 'Low Tide',
      media_content_id: 'library://track/1',
      media_duration: 245,
      media_position: 61,
      media_position_updated_at: new Date().toISOString(),
      entity_picture: './cover.svg',
      volume_level: 0.35,
    }),
  ),
  entity('button.living_room_speaker_favorite_current_song', 'unknown', {
    friendly_name: 'Living Room Speaker Favorite current song',
  }),
  entity('calendar.family', 'off', { friendly_name: 'Family' }),
  entity('calendar.work', 'off', { friendly_name: 'Work' }),
  entity('camera.front_door', 'idle', { friendly_name: 'Front Door Camera', entity_picture: './camera.svg' }),
  entity('todo.shopping', '3', { friendly_name: 'Shopping', supported_features: 15 }),
  entity('sun.sun', 'above_horizon', {
    friendly_name: 'Sun',
    next_rising: new Date(Date.now() + 14 * 3600_000).toISOString(),
    next_setting: new Date(Date.now() + 3 * 3600_000).toISOString(),
  }),
  entity('alarm_control_panel.home', 'disarmed', {
    friendly_name: 'Home Alarm',
    code_format: 'number',
    code_arm_required: false,
    supported_features: 1 | 2 | 4 | 32,
  }),
  entity('timer.kitchen', 'idle', { friendly_name: 'Kitchen timer', duration: '0:05:00' }),
  entity('vacuum.robbie', 'docked', {
    friendly_name: 'Robbie',
    battery_level: 84,
    fan_speed: 'standard',
    fan_speed_list: ['quiet', 'standard', 'turbo', 'max'],
    supported_features: 4 | 8 | 16 | 32 | 512 | 1024 | 8192,
  }),
  { ...entity('person.alex', 'home', { friendly_name: 'Alex Rivera', source: 'device_tracker.alex_phone', gps_accuracy: 12 }), last_changed: new Date(Date.now() - 135 * 60_000).toISOString() },
  { ...entity('person.sam', 'Work', { friendly_name: 'Sam Rivera' }), last_changed: new Date(Date.now() - 320 * 60_000).toISOString() },
  { ...entity('person.jo', 'not_home', { friendly_name: 'Jo' }), last_changed: new Date(Date.now() - 40 * 60_000).toISOString() },
  entity('device_tracker.alex_phone', 'home', { friendly_name: 'Alex’s phone', battery_level: 62 }),
  entity('input_number.humidity_target', '45', {
    friendly_name: 'Target humidity',
    min: 30,
    max: 70,
    step: 1,
    unit_of_measurement: '%',
  }),
  entity('input_select.house_mode', 'Home', {
    friendly_name: 'House mode',
    options: ['Home', 'Away', 'Guest', 'Night', 'Vacation'],
  }),
  entity('sensor.solar_power', '2140', { friendly_name: 'Solar power', unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' }),
  entity('sensor.grid_power', '-380', { friendly_name: 'Grid power', unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' }),
  entity('sensor.battery_power', '-600', { friendly_name: 'Battery power', unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' }),
  entity('sensor.home_power', '1160', { friendly_name: 'Home power', unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' }),
  entity('script.all_lights_off', 'off', { friendly_name: 'All lights off', last_triggered: new Date(Date.now() - 130 * 60_000).toISOString() }),
  { ...entity('binary_sensor.front_door_person', 'off', { friendly_name: 'Front Door Camera Person', device_class: 'occupancy' }), last_changed: new Date(Date.now() - 12 * 60_000).toISOString() },
  entity('media_player.kitchen_speaker', 'idle', mass({ friendly_name: 'Kitchen Speaker', volume_level: 0.2 })),
  entity('media_player.bedroom_speaker', 'off', mass({ friendly_name: 'Bedroom Speaker', volume_level: 0.25 })),
  entity(
    'media_player.patio',
    'paused',
    mass({
      friendly_name: 'Patio',
      media_title: 'Paper Moons',
      media_artist: 'Ida Fell',
      media_album_name: 'Northbound',
      media_content_id: 'library://track/2',
      media_duration: 198,
      media_position: 40,
      media_position_updated_at: new Date().toISOString(),
      entity_picture: cover(200),
      volume_level: 0.5,
    }),
  ),
];

const TRACKS = [
  { media_title: 'Slow Harbour', media_artist: 'The Lanterns', media_album_name: 'Low Tide', media_duration: 245 },
  { media_title: 'Paper Moons', media_artist: 'Ida Fell', media_album_name: 'Northbound', media_duration: 198 },
  { media_title: 'Copper Sky', media_artist: 'The Lanterns', media_album_name: 'Low Tide', media_duration: 231 },
];

/** The integration behind each entity, where it matters. */
const PLATFORM: Record<string, string> = {
  'media_player.living_room': 'music_assistant',
  'media_player.kitchen_speaker': 'music_assistant',
  'media_player.bedroom_speaker': 'music_assistant',
  'media_player.patio': 'music_assistant',
  'button.living_room_speaker_favorite_current_song': 'music_assistant',
};

/** Entities that share a device, and what their integration calls them. */
const DEVICE_OF: Record<string, string> = {
  'media_player.living_room': 'dev-living-room-speaker',
  'button.living_room_speaker_favorite_current_song': 'dev-living-room-speaker',
  'camera.front_door': 'dev-front-door-camera',
  'binary_sensor.front_door_person': 'dev-front-door-camera',
  'event.front_door_motion': 'dev-front-door-camera',
  'person.alex': 'dev-alex',
};
const TRANSLATION_KEY: Record<string, string> = {
  'button.living_room_speaker_favorite_current_song': 'favorite_now_playing',
};

// ---- A small Music Assistant library -------------------------------------------

interface MockItem {
  media_type: string;
  uri: string;
  name: string;
  version: string;
  image: string | null;
  favorite: boolean;
  artists?: Array<{ media_type: string; uri: string; name: string; version: string; image: null }>;
}

const ARTISTS = ['The Lanterns', 'Ida Fell', 'Morning Static', 'Harbor Lights', 'June Avenue', 'Oslo Bloom', 'Velvet Coast', 'North Wind'];

const shelf = (type: string, names: string[], favorites: number[], byArtist = false): MockItem[] =>
  names.map((name, i) => ({
    media_type: type,
    uri: `library://${type}/${i + 1}`,
    name,
    version: '',
    // Every fifth has no artwork, as some don't.
    image: i % 5 === 4 ? null : cover((i * 47 + type.length * 31) % 360),
    favorite: favorites.includes(i),
    ...(byArtist
      ? {
          artists: [
            {
              media_type: 'artist',
              uri: `library://artist/${(i % ARTISTS.length) + 1}`,
              name: ARTISTS[i % ARTISTS.length],
              version: '',
              image: null,
            },
          ],
        }
      : {}),
  }));

const LIBRARY: Record<string, MockItem[]> = {
  playlist: shelf(
    'playlist',
    [
      'Morning Coffee',
      'Dinner Party',
      'Deep Focus',
      'Road Trip',
      'Rainy Day',
      'Kids Mix',
      'Sunday Jazz',
      'Workout',
      ...Array.from({ length: 62 }, (_, i) => `Daily Mix ${i + 1}`),
    ],
    [0, 2, 6],
  ),
  album: shelf(
    'album',
    ['Low Tide', 'Northbound', 'Static Mornings', 'Lights Out', 'Avenue', 'Bloom', 'Coastline', 'Windward', 'Paper Houses', 'Slow Days'],
    [0, 1],
    true,
  ),
  artist: shelf('artist', ARTISTS, [0, 1, 4]),
  radio: shelf('radio', ['City FM', 'Jazz Hour', 'Lo-fi Radio', 'Classic Rock', 'Radio Six'], [1, 2]),
  track: shelf(
    'track',
    ['Slow Harbour', 'Paper Moons', 'Copper Sky', 'Static', 'Avenue Lights', 'Bloom Again', 'Coastline', 'Windward', 'Glass House', 'Late Train', 'Satellite', 'Undertow'],
    [0, 3],
    true,
  ),
};

const libraryItem = (uri: string) => Object.values(LIBRARY).flat().find((item) => item.uri === uri);
const byName = (a: MockItem, b: MockItem) => a.name.localeCompare(b.name, undefined, { numeric: true });

/**
 * Music Assistant's side of the websocket: its config entry, and the actions
 * that answer (library, search, queue). Undefined for anything else.
 */
export function mockMusicWS(message: Record<string, any>, hass: HomeAssistant): unknown {
  if (message.type === 'config/entity_registry/get') {
    const mine = PLATFORM[message.entity_id] === 'music_assistant';
    return { entity_id: message.entity_id, config_entry_id: mine ? 'mass-dev' : null };
  }
  if (message.type === 'config_entries/get' && message.domain === 'music_assistant') {
    return [{ entry_id: 'mass-dev', domain: 'music_assistant', title: 'Music Assistant', state: 'loaded' }];
  }
  if (message.type !== 'call_service' || message.domain !== 'music_assistant' || !message.return_response) return undefined;
  const data = message.service_data ?? {};
  if (message.service === 'get_library') {
    let items = [...(LIBRARY[data.media_type] ?? [])].sort(byName);
    if (data.favorite) items = items.filter((item) => item.favorite);
    const offset = data.offset ?? 0;
    const limit = data.limit ?? 25;
    return {
      context: {},
      response: { items: items.slice(offset, offset + limit), limit, offset, order_by: data.order_by ?? 'name', media_type: data.media_type },
    };
  }
  if (message.service === 'search') {
    const query = String(data.name).toLowerCase();
    const found = (type: string) =>
      (LIBRARY[type] ?? [])
        .filter((item) => item.name.toLowerCase().includes(query) || item.artists?.some((a) => a.name.toLowerCase().includes(query)))
        .slice(0, data.limit ?? 5);
    return {
      context: {},
      response: {
        artists: found('artist'),
        albums: found('album'),
        tracks: found('track'),
        playlists: found('playlist'),
        radio: found('radio'),
        audiobooks: [],
        podcasts: [],
      },
    };
  }
  if (message.service === 'get_queue') {
    const id = message.target?.entity_id as string;
    const title = hass.states[id]?.attributes.media_title;
    const at = TRACKS.findIndex((t) => t.media_title === title);
    const next = at < 0 ? undefined : TRACKS[(at + 1) % TRACKS.length];
    return {
      context: {},
      response: {
        [id]: {
          queue_id: id,
          active: true,
          name: 'Queue',
          items: 12,
          shuffle_enabled: false,
          repeat_mode: 'off',
          current_index: Math.max(0, at),
          elapsed_time: 0,
          current_item: null,
          next_item: next
            ? { queue_item_id: 'next', name: `${next.media_artist} - ${next.media_title}`, duration: next.media_duration, media_item: null }
            : null,
        },
      },
    };
  }
  return undefined;
}

/** What a speaker is playing, to hand on to another. */
const NOW_PLAYING = [
  'media_title',
  'media_artist',
  'media_album_name',
  'media_content_id',
  'media_duration',
  'media_position',
  'media_position_updated_at',
  'entity_picture',
];
const playingOf = (s: HassEntity) => Object.fromEntries(NOW_PLAYING.map((key) => [key, s.attributes[key]]));
const NOTHING_PLAYING = Object.fromEntries(NOW_PLAYING.map((key) => [key, undefined]));

/** Where a speaker is in its song, counting on while it plays. */
function positionOf(s: HassEntity): number {
  const a = s.attributes;
  const since = Date.parse(a.media_position_updated_at ?? '');
  const extra = s.state === 'playing' && !Number.isNaN(since) ? (Date.now() - since) / 1000 : 0;
  return Math.min(a.media_duration ?? Infinity, (a.media_position ?? 0) + extra);
}

const areas = {
  living_room: { area_id: 'living_room', name: 'Living Room' },
  bedroom: { area_id: 'bedroom', name: 'Bedroom' },
  entry: { area_id: 'entry', name: 'Entry' },
  kitchen: { area_id: 'kitchen', name: 'Kitchen' },
};

const AREA_OF: Record<string, string> = {
  'climate.living_room': 'living_room',
  'light.living_room': 'living_room',
  'light.floor_lamp': 'living_room',
  'light.reading': 'living_room',
  'fan.ceiling': 'living_room',
  'cover.blinds': 'living_room',
  'light.bedside': 'bedroom',
  'fan.bedroom': 'bedroom',
  'cover.shades': 'bedroom',
  'light.porch': 'entry',
  'lock.front_door': 'entry',
  'cover.garage': 'entry',
  'light.kitchen': 'kitchen',
  'light.island': 'kitchen',
  'switch.coffee': 'kitchen',
  'media_player.living_room': 'living_room',
  'button.living_room_speaker_favorite_current_song': 'living_room',
  'media_player.kitchen_speaker': 'kitchen',
  'media_player.bedroom_speaker': 'bedroom',
  'sensor.living_temperature': 'living_room',
  'sensor.living_humidity': 'living_room',
  'vacuum.robbie': 'living_room',
  'timer.kitchen': 'kitchen',
  'sensor.bedroom_temperature': 'bedroom',
  'camera.front_door': 'entry',
};

function hueToRgb(hue: number): number[] {
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

const FLIP: Record<string, string> = {
  on: 'off',
  off: 'on',
  open: 'closed',
  closed: 'open',
  heat: 'off',
};

export function createMockHass(onChange: (hass: HomeAssistant) => void): HomeAssistant {
  const states: Record<string, HassEntity> = Object.fromEntries(initial.map((s) => [s.entity_id, s]));
  const entities: Record<string, HassEntityRegistryEntry> = Object.fromEntries(
    initial.map((s) => [
      s.entity_id,
      {
        entity_id: s.entity_id,
        area_id: AREA_OF[s.entity_id] ?? null,
        platform: PLATFORM[s.entity_id] ?? 'demo',
        device_id: DEVICE_OF[s.entity_id] ?? null,
        translation_key: TRANSLATION_KEY[s.entity_id],
      },
    ]),
  );

  /** A speaker's group, itself first; just itself when it plays alone. */
  const groupOf = (id: string): string[] => {
    const members = states[id]?.attributes.group_members;
    return Array.isArray(members) && members.length > 1 ? members : [id];
  };

  const update = (id: string, state: string, attributes: Record<string, any>) => {
    states[id] = { ...states[id], state, attributes: { ...states[id].attributes, ...attributes } };
    // HA hands cards a fresh hass object on every change.
    onChange({ ...hass, states: { ...states } });
  };

  const hass: HomeAssistant = {
    states,
    entities,
    areas,
    devices: {},
    locale: { language: navigator.language, time_format: 'language' },
    language: 'en',
    themes: { darkMode: new URLSearchParams(location.search).has('dark') },
    config: { unit_system: { temperature: '°C' } },
    async callService(domain, service, data) {
      console.log('callService', domain, service, data);
      // Home Assistant takes a list of entities too; act on each.
      if (Array.isArray(data?.entity_id)) {
        await Promise.all(data.entity_id.map((one: string) => hass.callService(domain, service, { ...data, entity_id: one })));
        return undefined;
      }
      const id = data?.entity_id as string | undefined;
      const current = id ? states[id] : undefined;
      if (!id || !current) return undefined;

      // Real devices report back a moment later; so does the mock.
      await new Promise((r) => setTimeout(r, 250));
      const kind = `${domain}.${service}`;
      if (kind === 'homeassistant.toggle') {
        const next = FLIP[current.state] ?? current.state;
        const extra: Record<string, any> = {};
        if (id.startsWith('light.') && current.attributes.supported_color_modes?.[0] !== 'onoff') {
          extra.brightness = next === 'on' ? 200 : undefined;
        }
        if (id.startsWith('fan.')) extra.percentage = next === 'on' ? 50 : 0;
        if (id.startsWith('cover.') && 'current_position' in current.attributes) {
          extra.current_position = next === 'open' ? 100 : 0;
        }
        update(id, next, extra);
      } else if (kind === 'light.turn_on') {
        const extra: Record<string, any> = {};
        if (typeof data!.brightness_pct === 'number') {
          extra.brightness = Math.round((data!.brightness_pct / 100) * 255);
        } else if (current.attributes.brightness === undefined) {
          extra.brightness = 255;
        }
        if (Array.isArray(data!.hs_color)) {
          const [h] = data!.hs_color as number[];
          Object.assign(extra, { color_mode: 'hs', hs_color: data!.hs_color, rgb_color: hueToRgb(h) });
        }
        if (typeof data!.color_temp_kelvin === 'number') {
          Object.assign(extra, {
            color_mode: 'color_temp',
            color_temp_kelvin: data!.color_temp_kelvin,
            rgb_color: [255, 214, 170],
          });
        }
        update(id, 'on', extra);
      } else if (kind === 'light.turn_off') {
        update(id, 'off', { brightness: undefined });
      } else if (kind === 'fan.set_percentage') {
        update(id, 'on', { percentage: data!.percentage });
      } else if (kind === 'fan.turn_on') {
        update(id, 'on', { percentage: current.attributes.percentage || 50 });
      } else if (kind === 'fan.turn_off') {
        update(id, 'off', { percentage: 0 });
      } else if (kind === 'fan.set_preset_mode') {
        update(id, 'on', { preset_mode: data!.preset_mode });
      } else if (kind === 'fan.oscillate') {
        update(id, current.state, { oscillating: data!.oscillating });
      } else if (kind === 'cover.set_cover_position') {
        const position = data!.position as number;
        update(id, position > 0 ? 'open' : 'closed', { current_position: position });
      } else if (kind === 'cover.open_cover' || kind === 'cover.close_cover') {
        const open = service === 'open_cover';
        const position = 'current_position' in current.attributes ? { current_position: open ? 100 : 0 } : {};
        update(id, open ? 'open' : 'closed', position);
      } else if (kind === 'cover.stop_cover') {
        update(id, current.state, {});
      } else if (kind === 'climate.set_temperature') {
        const { entity_id: _, ...targets } = data!;
        update(id, current.state, targets);
      } else if (kind === 'climate.set_hvac_mode') {
        const mode = data!.hvac_mode as string;
        update(id, mode, { hvac_action: mode === 'off' ? 'off' : mode === 'cool' ? 'cooling' : 'heating' });
      } else if (kind === 'climate.set_fan_mode' || kind === 'climate.set_preset_mode') {
        const { entity_id: _, ...choice } = data!;
        update(id, current.state, choice);
      } else if (kind === 'lock.lock' || kind === 'lock.unlock') {
        update(id, service === 'lock' ? 'locked' : 'unlocked', {});
      } else if (domain === 'alarm_control_panel') {
        const mode = service.replace('alarm_', '');
        if (data!.code !== undefined && data!.code !== '1234') {
          console.warn('Wrong code; the dev alarm’s code is 1234');
          return undefined;
        }
        if (mode === 'disarm') update(id, 'disarmed', {});
        else {
          update(id, 'arming', {});
          setTimeout(() => update(id, mode.replace('arm_', 'armed_'), {}), 1500);
        }
      } else if (domain === 'timer') {
        const parse = (v: string) => v.split(':').map(Number).reduce((t, n) => t * 60 + n, 0);
        const a = current.attributes;
        const left =
          current.state === 'active' ? (Date.parse(a.finishes_at) - Date.now()) / 1000 : parse(a.remaining ?? a.duration);
        const hms = (s: number) => [s / 3600, (s % 3600) / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':');
        if (service === 'start') {
          const seconds = data!.duration ? parse(String(data!.duration)) : current.state === 'paused' ? left : parse(a.duration);
          update(id, 'active', {
            duration: data!.duration ? hms(seconds) : a.duration,
            remaining: hms(seconds),
            finishes_at: new Date(Date.now() + seconds * 1000).toISOString(),
          });
        } else if (service === 'pause') {
          update(id, 'paused', { remaining: hms(Math.max(0, Math.round(left))), finishes_at: undefined });
        } else {
          update(id, 'idle', { remaining: undefined, finishes_at: undefined });
        }
      } else if (domain === 'vacuum') {
        const next: Record<string, string> = { start: 'cleaning', pause: 'paused', stop: 'idle', return_to_base: 'returning', clean_spot: 'cleaning' };
        if (service === 'set_fan_speed') update(id, current.state, { fan_speed: data!.fan_speed });
        else if (next[service]) {
          update(id, next[service], {});
          if (service === 'return_to_base') setTimeout(() => update(id, 'docked', {}), 3000);
        }
      } else if (kind === 'input_number.set_value') {
        update(id, String(data!.value), {});
      } else if (kind === 'input_select.select_option') {
        update(id, String(data!.option), {});
      } else if (kind === 'script.turn_on') {
        update(id, 'off', { last_triggered: new Date().toISOString() });
      } else if (kind === 'todo.add_item') {
        update(id, String(Number(current.state) + 1), {});
      } else if (kind === 'todo.remove_completed_items') {
        update(id, current.state, {});
      } else if (kind === 'todo.update_item') {
        // The list itself lives in dev/main.ts; the count is the entity's state.
        update(id, String(Math.max(0, Number(current.state) + (data!.status === 'completed' ? -1 : 1))), {});
      } else if (kind === 'media_player.media_play_pause') {
        // A group plays and pauses together.
        const now = new Date().toISOString();
        const next = current.state === 'playing' ? 'paused' : 'playing';
        for (const member of groupOf(id)) {
          update(member, next, { media_position: Math.round(positionOf(states[member])), media_position_updated_at: now });
        }
      } else if (kind === 'media_player.media_next_track' || kind === 'media_player.media_previous_track') {
        const at = TRACKS.findIndex((t) => t.media_title === current.attributes.media_title);
        const step = service === 'media_next_track' ? 1 : TRACKS.length - 1;
        const track = TRACKS[(Math.max(0, at) + step) % TRACKS.length];
        const now = new Date().toISOString();
        for (const member of groupOf(id)) {
          update(member, 'playing', { ...track, entity_picture: './cover.svg', media_position: 0, media_position_updated_at: now });
        }
      } else if (kind === 'media_player.media_seek') {
        const now = new Date().toISOString();
        for (const member of groupOf(id)) {
          update(member, states[member].state, { media_position: data!.seek_position, media_position_updated_at: now });
        }
      } else if (kind === 'media_player.shuffle_set') {
        update(id, current.state, { shuffle: data!.shuffle });
      } else if (kind === 'media_player.repeat_set') {
        update(id, current.state, { repeat: data!.repeat });
      } else if (kind === 'media_player.volume_mute') {
        update(id, current.state, { is_volume_muted: data!.is_volume_muted });
      } else if (kind === 'media_player.join') {
        const leader = states[id];
        const group = [...new Set([id, ...groupOf(id), ...(data!.group_members as string[])])];
        for (const member of group) {
          if (member === id) update(member, leader.state, { group_members: group });
          else update(member, leader.state === 'off' ? 'idle' : leader.state, { ...playingOf(leader), group_members: group });
        }
      } else if (kind === 'media_player.unjoin') {
        const rest = groupOf(id).filter((member) => member !== id);
        for (const member of rest) update(member, states[member].state, { group_members: rest.length > 1 ? rest : [] });
        update(id, 'idle', { ...NOTHING_PLAYING, group_members: [] });
      } else if (kind === 'music_assistant.transfer_queue') {
        const from = data!.source_player as string;
        if (states[from]) {
          update(id, 'playing', {
            ...playingOf(states[from]),
            media_position: Math.round(positionOf(states[from])),
            media_position_updated_at: new Date().toISOString(),
          });
          update(from, 'idle', NOTHING_PLAYING);
        }
      } else if (kind === 'music_assistant.play_media') {
        const item = libraryItem(String(data!.media_id));
        update(id, 'playing', {
          media_title: item?.name ?? String(data!.media_id),
          media_artist: item?.artists?.[0]?.name,
          media_album_name: undefined,
          media_content_id: data!.media_id,
          media_duration: 210,
          media_position: 0,
          media_position_updated_at: new Date().toISOString(),
          entity_picture: item?.image ?? './cover.svg',
        });
      } else if (kind === 'button.press') {
        // Music Assistant's Favorite current song: nothing to show for it here.
      } else if (kind === 'media_player.turn_on') {
        update(id, 'idle', {});
      } else if (kind === 'media_player.turn_off') {
        update(id, 'off', { ...NOTHING_PLAYING, group_members: [] });
      } else if (kind === 'media_player.volume_set') {
        update(id, current.state, { volume_level: data!.volume_level });
      } else if (service === 'turn_on' || service === 'turn_off') {
        update(id, service === 'turn_on' ? 'on' : 'off', {});
      }
      return undefined;
    },
  };
  return hass;
}
