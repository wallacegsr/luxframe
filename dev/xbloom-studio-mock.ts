// ?xbloom: a pretend xBloom Studio (Alshekhi/xbloom-studio) for the xBloom
// page: its entities as the integration registers them, and enough of the
// machine to pick a recipe, brew it, rate it and use the grinder, brewer and
// scale screens.
import type { HassEntity, HomeAssistant } from '../src/types';

const DEVICE = 'mock-xbloom-studio';

const pour = (volume_ml: number, temperature_c: number, pause_s = 0, name?: string) => ({
  name, volume_ml, temperature_c, pattern: 'spiral', pause_s, flow_rate: 3.2,
});

const RECIPES: Record<string, Record<string, unknown>> = {
  'Morning pour-over': { dose_g: 15, ratio: 16, grinder_size: 52, rpm: 100, cup_type: 'omni_dripper',
    pours: [pour(45, 93, 35, 'Bloom'), pour(105, 93, 15), pour(90, 92)] },
  'Light roast bloom': { dose_g: 16, ratio: 15.5, grinder_size: 58, rpm: 100, cup_type: 'omni_dripper',
    pours: [pour(50, 95, 45, 'Bloom'), pour(100, 95, 20), pour(98, 94)] },
  'Iced coffee': { dose_g: 20, ratio: 8, grinder_size: 44, rpm: 110, cup_type: 'omni_dripper',
    pours: [pour(50, 94, 40, 'Bloom'), pour(110, 94)] },
  'Kenya AA (Tetsu 4:6)': { dose_g: 20, ratio: 15, grinder_size: 64, rpm: 90, cup_type: 'omni_dripper',
    pours: [pour(60, 93), pour(60, 93), pour(60, 93), pour(60, 93), pour(60, 93)] },
};

const BAGS: Record<string, number> = { 'Ethiopia Guji · Onyx': 142, 'House blend · Sey': 38 };

type Spec = [string, Record<string, unknown>];

const ENTITIES: Record<string, Spec> = {
  'sensor.brew_status': ['idle', {}],
  'sensor.machine_status': ['ok', {}],
  'sensor.scale_weight': ['0.0', { unit_of_measurement: 'g' }],
  'sensor.current_module': ['home', {}],
  'sensor.current_recipe': ['unknown', {}],
  'sensor.current_pour': ['0', {}],
  'sensor.brew_time': ['unknown', { unit_of_measurement: 's' }],
  'sensor.last_recipe_card': ['unknown', {}],
  'sensor.coffee_lab_remaining': ['142', { unit_of_measurement: 'g' }],
  'sensor.coffee_lab_rating_question': ['unknown', {}],
  'binary_sensor.brew_paused': ['off', {}],
  'binary_sensor.in_range': ['on', {}],
  'binary_sensor.recipe_ready': ['off', { preparing: false, reason: 'no_recipe' }],
  'select.recipe': ['unknown', { options: Object.keys(RECIPES) }],
  'select.brew_taste': ['balanced', { options: ['balanced', 'less_sour', 'less_bitter'] }],
  'select.brew_pattern': ['spiral', { options: ['centered', 'circular', 'spiral'] }],
  'select.coffee_lab_active_bag': ['Ethiopia Guji · Onyx', { options: Object.keys(BAGS), remaining_g: 142 }],
  'select.coffee_lab_rate_brew': ['unknown', { options: ['again', 'fine', 'not_again'] }],
  'select.coffee_lab_cup_issue': ['unavailable', { options: ['none', 'sour', 'bitter', 'weak', 'strong'] }],
  'number.brew_dose': ['15', { min: 5, max: 30, step: 0.5, unit_of_measurement: 'g' }],
  'number.brew_ratio': ['16', { min: 10, max: 20, step: 0.5 }],
  'number.brew_grind_size': ['52', { min: 1, max: 80, step: 1 }],
  'number.grind_size': ['50', { min: 1, max: 80, step: 1 }],
  'number.grind_speed': ['100', { min: 60, max: 120, step: 10, unit_of_measurement: 'rpm' }],
  'number.brew_volume': ['200', { min: 10, max: 240, step: 5, unit_of_measurement: 'ml' }],
  'number.brew_temperature': ['93', { min: 40, max: 98, step: 1, unit_of_measurement: '°C' }],
  'number.brew_flow_rate': ['3.2', { min: 3, max: 3.5, step: 0.1, unit_of_measurement: 'ml/s' }],
  'switch.connect': ['on', {}],
  'switch.use_grinder': ['on', {}],
  'switch.machine_control': ['on', {}],
  'button.start_brew': ['unknown', {}],
  'button.pause_brew': ['unknown', {}],
  'button.resume_brew': ['unknown', {}],
  'button.cancel_brew': ['unknown', {}],
  'button.cancel_preparation': ['unknown', {}],
  'button.tare_scale': ['unknown', {}],
  'button.back_to_home': ['unknown', {}],
  'button.go_to_grinder': ['unknown', {}],
  'button.go_to_brewer': ['unknown', {}],
  'button.go_to_scale': ['unknown', {}],
  'button.grind': ['unknown', {}],
  'button.brew_standalone': ['unknown', {}],
};

/**
 * Adds the machine to `hass` and answers its services. `push` hands the card
 * a fresh hass, as Home Assistant does on every change.
 */
export function addXBloomStudio(hass: HomeAssistant, push: (next: HomeAssistant) => void): void {
  const ids: Record<string, string> = {};
  for (const [key, [state, attributes]] of Object.entries(ENTITIES)) {
    const [domain, name] = key.split('.');
    const id = `${domain}.xbloom_studio_${name}`;
    ids[key] = id;
    hass.states[id] = {
      entity_id: id,
      state,
      attributes: { friendly_name: `xBloom Studio ${name.replace(/_/g, ' ')}`, ...attributes },
      last_changed: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    } as HassEntity;
    hass.entities![id] = { entity_id: id, platform: 'xbloom', device_id: DEVICE, translation_key: name };
  }

  const get = (key: string) => hass.states[ids[key]];
  const set = (key: string, state: string, attributes: Record<string, unknown> = {}) => {
    const s = get(key);
    hass.states[ids[key]] = { ...s, state, attributes: { ...s.attributes, ...attributes } };
  };
  const send = () => push({ ...hass, states: { ...hass.states } });

  let timer: number | undefined;
  let paused = false;

  const prepare = () => {
    const recipe = get('select.recipe').state;
    if (!RECIPES[recipe]) {
      set('binary_sensor.recipe_ready', 'off', { preparing: false, reason: 'no_recipe' });
      return;
    }
    set('binary_sensor.recipe_ready', 'off', { preparing: true, reason: null });
    setTimeout(() => {
      set('binary_sensor.recipe_ready', 'on', { preparing: false, reason: null });
      send();
    }, 1200);
  };

  /** Grinds for a few seconds, then runs each pour, a second of brewing a tick. */
  const brew = () => {
    const name = get('select.recipe').state;
    const recipe = RECIPES[name];
    const pours = recipe.pours as Array<{ volume_ml: number }>;
    let t = 0;
    let weight = 0;
    paused = false;
    set('binary_sensor.recipe_ready', 'off', { preparing: false, reason: 'brewing' });
    set('sensor.current_recipe', name, { total_pours: pours.length });
    set('sensor.brew_status', 'grinding');
    set('sensor.current_module', 'auto');
    set('sensor.scale_weight', '0.0');
    timer = window.setInterval(() => {
      if (paused) return;
      t += 1;
      if (t <= 3) {
        send();
        return;
      }
      const at = t - 3;
      const pour = Math.min(pours.length, Math.floor(at / 4) + 1);
      weight = Math.min(pours.reduce((sum, p) => sum + p.volume_ml, 0), weight + 18);
      set('sensor.brew_status', 'brewing');
      set('sensor.current_pour', String(pour), { total_pours: pours.length });
      set('sensor.brew_time', String(at));
      set('sensor.scale_weight', weight.toFixed(1));
      if (at >= pours.length * 4) finish(name);
      send();
    }, 1000);
  };

  const stop = () => {
    window.clearInterval(timer);
    set('sensor.current_pour', '0');
    set('sensor.brew_time', 'unknown');
    set('binary_sensor.brew_paused', 'off');
    set('sensor.current_module', 'home');
  };

  const finish = (name: string) => {
    stop();
    set('sensor.brew_status', 'done');
    set('sensor.last_recipe_card', name);
    const bag = get('select.coffee_lab_active_bag').state;
    BAGS[bag] = Math.max(0, BAGS[bag] - Number(RECIPES[name].dose_g));
    set('select.coffee_lab_active_bag', bag, { remaining_g: BAGS[bag] });
    set('sensor.coffee_lab_remaining', String(BAGS[bag]));
    set('sensor.coffee_lab_rating_question', name, { bag, brew_id: 'mock-brew', changes: [] });
    set('select.coffee_lab_rate_brew', 'unknown');
    prepare();
  };

  const call = hass.callService.bind(hass);
  hass.callService = (async (domain: string, service: string, data?: Record<string, any>) => {
    const id = data?.entity_id as string | undefined;
    const key = Object.keys(ids).find((k) => ids[k] === id);
    if (!key) return call(domain, service, data);
    console.log('xBloom Studio', domain, service, data);
    await new Promise((r) => setTimeout(r, 250));
    const name = key.split('.')[1];

    if (domain === 'number') set(key, String(data!.value));
    else if (domain === 'switch') set(key, get(key).state === 'on' ? 'off' : 'on');
    else if (domain === 'select') {
      set(key, String(data!.option));
      if (key === 'select.recipe') {
        const r = RECIPES[data!.option];
        set('number.brew_dose', String(r.dose_g));
        set('number.brew_ratio', String(r.ratio));
        set('number.brew_grind_size', String(r.grinder_size));
        set('select.recipe', String(data!.option), { name: data!.option, ...r });
        prepare();
      } else if (key === 'select.coffee_lab_active_bag') {
        const left = BAGS[String(data!.option)];
        set(key, String(data!.option), { remaining_g: left });
        set('sensor.coffee_lab_remaining', String(left));
      } else if (key === 'select.coffee_lab_rate_brew') {
        // Fine or Not again asks what was off; Again or a named issue ends it.
        if (data!.option === 'again') set('sensor.coffee_lab_rating_question', 'unknown');
        else set('select.coffee_lab_cup_issue', 'none');
      } else if (key === 'select.coffee_lab_cup_issue') {
        set('sensor.coffee_lab_rating_question', 'unknown');
        set('select.coffee_lab_cup_issue', 'unavailable');
      }
    } else if (domain === 'button') {
      if (name === 'start_brew' && get('binary_sensor.recipe_ready').state === 'on') brew();
      else if (name === 'pause_brew') {
        paused = true;
        set('binary_sensor.brew_paused', 'on');
      } else if (name === 'resume_brew') {
        paused = false;
        set('binary_sensor.brew_paused', 'off');
      } else if (name === 'cancel_brew') {
        stop();
        set('sensor.brew_status', 'idle');
        prepare();
      } else if (name === 'cancel_preparation') {
        set('select.recipe', 'unknown');
        prepare();
      } else if (name === 'tare_scale') set('sensor.scale_weight', '0.0');
      else if (name.startsWith('go_to_')) {
        set('sensor.current_module', name.replace('go_to_', ''));
        set('sensor.brew_status', 'idle');
      } else if (name === 'back_to_home') set('sensor.current_module', 'home');
    }
    send();
    return undefined;
  }) as typeof hass.callService;
}
