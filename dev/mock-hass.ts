import type { HassEntity, HassEntityRegistryEntry, HomeAssistant } from '../src/types';

// A tiny stand-in for Home Assistant so the frame can be developed in a
// browser. Service calls change state locally; scenes and scripts just log.

const entity = (entity_id: string, state: string, attributes: Record<string, any> = {}): HassEntity => ({
  entity_id,
  state,
  attributes,
});

const DIMMABLE = { supported_color_modes: ['brightness'] };

const initial: HassEntity[] = [
  entity('weather.home', 'partlycloudy', {
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
  entity('sensor.living_temperature', '21.5', { unit_of_measurement: '°C' }),
  entity('sensor.living_humidity', '44', { unit_of_measurement: '%' }),
  entity('light.kitchen', 'off', { friendly_name: 'Kitchen', ...DIMMABLE }),
  entity('light.island', 'on', { friendly_name: 'Island pendants', brightness: 255, ...DIMMABLE }),
  entity('scene.arrive_home', 'scening', { friendly_name: 'Arrive Home' }),
  entity('scene.morning', 'scening', { friendly_name: 'Morning' }),
  entity('scene.movie', 'scening', { friendly_name: 'Movie night' }),
  entity('scene.dinner', 'scening', { friendly_name: 'Dinner' }),
  entity('scene.goodnight', 'scening', { friendly_name: 'Good night' }),
  entity('script.leave_home', 'off', { friendly_name: 'Leave home' }),
];

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
    initial.map((s) => [s.entity_id, { entity_id: s.entity_id, area_id: AREA_OF[s.entity_id] ?? null }]),
  );

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
    themes: { darkMode: new URLSearchParams(location.search).has('dark') },
    config: { unit_system: { temperature: '°C' } },
    async callService(domain, service, data) {
      console.log('callService', domain, service, data);
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
      } else if (kind === 'lock.lock' || kind === 'lock.unlock') {
        update(id, service === 'lock' ? 'locked' : 'unlocked', {});
      } else if (service === 'turn_on' || service === 'turn_off') {
        update(id, service === 'turn_on' ? 'on' : 'off', {});
      }
      return undefined;
    },
  };
  return hass;
}
