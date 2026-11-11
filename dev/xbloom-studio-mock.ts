// ?xbloom: a pretend xBloom Studio (Alshekhi/xbloom-studio) for the xBloom
// page: its entities as the integration registers them, and enough of the
// machine to pick a recipe, brew it, rate it and use the grinder, brewer and
// scale screens.
import type { HassEntity, HomeAssistant } from '../src/types';

const DEVICE = 'mock-xbloom-studio';

// Patterns as the machine numbers them: 1 centered, 2 spiral, 3 circular.
const pour = (volume_ml: number, temperature_c: number, pause_s = 0, pattern = 2, flow_rate = 3.5) => ({
  volume_ml, temperature_c, pattern, pause_s, flow_rate,
});

// As xbloom.list_recipes returns them. Cup types: 1 xPod, 2 Omni dripper,
// 3 Other, 4 Tea. Bypass: 1 on, 2 off.
let nextId = 9;
const recipe = (name: string, r: Record<string, any>): Record<string, any> => ({ id: nextId++, name, source: 'xBloom app', ...r });
const RECIPES: Record<string, Record<string, any>> = Object.fromEntries(
  [
    recipe('Morning pour-over', { dose_g: 15, water_ratio: 16, grinder_size: 52, rpm: 100, cup_type: 2,
      pours: [pour(40, 88, 23), pour(80, 88, 13), pour(70, 88, 10), pour(50, 88, 5)],
      bypass_water_enabled: 1, bypass_volume_ml: 5, bypass_temp_c: 85 }),
    recipe('Light roast bloom', { dose_g: 16, water_ratio: 15.5, grinder_size: 58, rpm: 100, cup_type: 2,
      pours: [pour(50, 95, 45, 3, 3.2), pour(100, 95, 20), pour(98, 94, 0, 1)] }),
    recipe('Iced coffee', { dose_g: 20, water_ratio: 8, grinder_size: 44, rpm: 110, cup_type: 3,
      pours: [pour(50, 94, 40), pour(110, 94, 0, 3)] }),
    recipe('Kenya AA (Tetsu 4:6)', { dose_g: 20, water_ratio: 15, grinder_size: 64, rpm: 90, cup_type: 2,
      pours: [pour(60, 93), pour(60, 93), pour(60, 93), pour(60, 93), pour(60, 93)] }),
    recipe('Sencha', { dose_g: 3, water_ratio: 220, cup_type: 4, source: 'Made here',
      pours: [pour(120, 75, 60, 1, 3), pour(100, 80, 0, 1, 3)] }),
    recipe('xPod Classic', { dose_g: 15, water_ratio: 15, grinder_size: 50, rpm: 100, cup_type: 1,
      pours: [pour(45, 92, 30), pour(180, 92, 0)] }),
  ].map((r) => [r.name, r]),
);
const ARCHIVED: Record<string, Record<string, any>> = {
  'Old espresso-ish': recipe('Old espresso-ish', { dose_g: 18, water_ratio: 10, grinder_size: 30, rpm: 120, cup_type: 3,
    pours: [pour(180, 96, 0, 1)] }),
};

/** The community hub: recipes others shared. */
const hub = (id: number, name: string, author: string, likes: number, r: Record<string, any>): Record<string, any> => ({
  id, name, author, likes, share_url: `https://share.xbloom.com/recipe/${id}`, ...r,
});
const HUB = [
  hub(501, 'Ethiopia Yirgacheffe, bright', 'xBloom', 1840, { official: true, dose_g: 15, water_ratio: 16, grinder_size: 54,
    cup_type: 2, origin: ['Ethiopia'], process: ['Washed'], roast: 'Light', flavor: ['Jasmine', 'Lemon', 'Bergamot'],
    description: 'A gentle bloom, then three even pours to keep the florals clean.',
    pours: [pour(45, 93, 35), pour(100, 93, 10), pour(95, 92, 0)] }),
  hub(502, 'Colombia honey, sweet cup', 'mara.brews', 932, { dose_g: 16, water_ratio: 15, grinder_size: 56, cup_type: 2,
    origin: ['Colombia'], process: ['Honey'], roast: 'Medium', flavor: ['Caramel', 'Red apple'],
    pours: [pour(50, 92, 40), pour(190, 91, 0, 3)] }),
  hub(503, 'Gyokuro, cool and slow', 'teaworks', 411, { dose_g: 4, water_ratio: 160, cup_type: 4, flavor: ['Umami', 'Seaweed'],
    description: 'Low and slow for sweetness. Two steeps.', pours: [pour(80, 60, 90, 1, 3), pour(80, 65, 0, 1, 3)] }),
  hub(504, 'Kenya double, juicy', 'nils', 287, { dose_g: 18, water_ratio: 15.5, grinder_size: 60, cup_type: 2,
    origin: ['Kenya'], process: ['Washed'], roast: 'Light', flavor: ['Blackcurrant', 'Grapefruit'],
    pours: [pour(50, 95, 40), pour(120, 94, 10), pour(109, 93, 0)] }),
  hub(505, 'Brazil natural for iced', 'coldcup', 168, { dose_g: 22, water_ratio: 8, grinder_size: 42, cup_type: 3,
    origin: ['Brazil'], process: ['Natural'], roast: 'Medium-dark', flavor: ['Chocolate', 'Hazelnut'],
    pours: [pour(60, 94, 40), pour(116, 94, 0, 3)] }),
];

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
  'button.refresh_recipes': ['unknown', {}],
  'button.refresh_status': ['unknown', {}],
  'button.ble_connect': ['unknown', {}],
  'button.ble_disconnect': ['unknown', {}],
  'button.restore_archived_recipe': ['unknown', {}],
  'select.mode': ['ha_control', { options: ['ha_control', 'machine'] }],
  'select.water_source': ['tank', { options: ['tank', 'plumbed'] }],
  'select.temperature_unit': ['celsius', { options: ['celsius', 'fahrenheit'] }],
  'select.weight_unit': ['grams', { options: ['grams', 'ounces'] }],
  'select.archived_recipe': ['unknown', { options: Object.keys(ARCHIVED) }],
  'update.firmware': ['on', { installed_version: '2.1.4', latest_version: '2.2.0', in_progress: false }],
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

  // A helper of the kind the page's beans_loaded points at: on once beans are in.
  const BEANS = 'input_boolean.xbloom_beans_loaded';
  hass.states[BEANS] = {
    entity_id: BEANS,
    state: 'on',
    attributes: { friendly_name: 'Beans loaded', icon: 'mdi:coffee-outline' },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  } as HassEntity;

  (hass.devices ??= {})[DEVICE] = { id: DEVICE, name: 'xBloom Studio', model: 'Studio', manufacturer: 'xBloom' } as never;

  const get = (key: string) => hass.states[ids[key]];
  const set = (key: string, state: string, attributes: Record<string, unknown> = {}) => {
    const s = get(key);
    const changed = s.state !== state ? { last_changed: new Date().toISOString() } : {};
    hass.states[ids[key]] = { ...s, ...changed, state, attributes: { ...s.attributes, ...attributes } };
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

  /**
   * Grinds for a moment, then runs each pour at about 20 g a second (quicker
   * than a real one), with a second's wait between pours, half a second a tick.
   */
  const brew = () => {
    const name = get('select.recipe').state;
    const recipe = RECIPES[name];
    const pours = recipe.pours as Array<{ volume_ml: number }>;
    // Each tick: the pour it's in, and the weight it pours (0 while waiting).
    const plan: Array<[number, number]> = [];
    pours.forEach((p, i) => {
      for (let left = p.volume_ml; left > 0; left -= 10) plan.push([i + 1, Math.min(10, left)]);
      if (i < pours.length - 1) plan.push([i + 1, 0], [i + 1, 0]);
    });
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
      const at = t - 4;
      if (at >= plan.length) {
        finish(name);
        send();
        return;
      }
      const [pour, grams] = plan[at];
      // The scale wobbles a little as water lands.
      weight += grams ? grams + (Math.random() - 0.5) * 1.6 : 0;
      set('sensor.brew_status', 'brewing');
      set('sensor.current_pour', String(pour), { total_pours: pours.length });
      set('sensor.brew_time', String(Math.floor(at / 2)));
      set('sensor.scale_weight', Math.max(0, weight).toFixed(1));
      send();
    }, 500);
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

  /** Keeps the Recipe and Archived selects in step with the lists. */
  const listed = () => {
    const picked = get('select.recipe').state;
    set('select.recipe', RECIPES[picked] ? picked : 'unknown', { options: Object.keys(RECIPES) });
    set('select.archived_recipe', 'unknown', { options: Object.keys(ARCHIVED) });
  };

  /** xBloom Studio's services that answer: recipes and the community hub. */
  const answer = (service: string, data: Record<string, any>): unknown => {
    switch (service) {
      case 'list_recipes':
        return { recipes: Object.values(RECIPES).map((r) => structuredClone(r)) };
      case 'add_recipe':
      case 'update_recipe': {
        const r = JSON.parse(data.recipe_json);
        if (!r.name) return { ok: false, error: 'A recipe needs a name.' };
        if (service === 'update_recipe') {
          const old = Object.values(RECIPES).find((x) => x.id === r.id);
          if (old) delete RECIPES[old.name];
        } else if (RECIPES[r.name]) return { ok: false, error: `There’s already a recipe called “${r.name}”.` };
        RECIPES[r.name] = { id: r.id ?? nextId++, source: 'Made here', ...r };
        listed();
        return { ok: true, name: r.name };
      }
      case 'delete_recipe':
        delete RECIPES[data.name];
        listed();
        return { ok: true };
      case 'archive_recipe':
        ARCHIVED[data.name] = RECIPES[data.name];
        delete RECIPES[data.name];
        listed();
        return { ok: true };
      case 'search_community': {
        const q = String(data.keyword ?? '').toLowerCase();
        const found = HUB.filter((h) => !q || `${h.name} ${h.author} ${h.flavor ?? ''}`.toLowerCase().includes(q))
          .filter((h) => !data.kind || (data.kind === 'tea') === (h.cup_type === 4))
          .sort((a, b) => (data.sort === 'date' ? b.id - a.id : b.likes - a.likes));
        const size = Number(data.page_size ?? 20);
        const page = Number(data.page ?? 1);
        // A search lists summaries; get_community_recipe has the rest.
        const summary = ({ description, origin, process, roast, flavor, ...rest }: Record<string, any>) => rest;
        return { ok: true, total: found.length, recipes: found.slice((page - 1) * size, page * size).map(summary) };
      }
      case 'get_community_recipe':
        return { ok: true, recipe: HUB.find((h) => h.id === Number(data.recipe_id)) };
      case 'save_shared_recipe': {
        const h = HUB.find((x) => x.share_url === data.share_url);
        if (!h) return { ok: false, error: 'No recipe at that link.' };
        RECIPES[h.name] = recipe(h.name, { ...h, id: nextId++, source: `${h.author} on the community hub` });
        listed();
        return { ok: true, name: h.name };
      }
      default:
        return undefined;
    }
  };

  const ws = hass.callWS!.bind(hass);
  hass.callWS = (async (message: Record<string, any>) => {
    // The machine's past isn't made up; the graph keeps what it sees.
    if (message.type === 'history/history_during_period' && message.entity_ids?.every((id: string) => id.includes('xbloom'))) {
      return {};
    }
    if (message.type !== 'call_service' || message.domain !== 'xbloom') return ws(message);
    console.log('xBloom Studio', message.service, message.service_data);
    await new Promise((r) => setTimeout(r, 400));
    const response = answer(message.service, message.service_data ?? {});
    send();
    return { response };
  }) as typeof hass.callWS;

  const call = hass.callService.bind(hass);
  hass.callService = (async (domain: string, service: string, data?: Record<string, any>) => {
    if (domain === 'xbloom') {
      // write_slot and set_mode: nothing to show for them but the call.
      console.log('xBloom Studio', service, data);
      await new Promise((r) => setTimeout(r, 600));
      return undefined;
    }
    const id = data?.entity_id as string | undefined;
    if (id === BEANS && domain === 'input_boolean') {
      const on = service === 'toggle' ? hass.states[BEANS].state !== 'on' : service === 'turn_on';
      hass.states[BEANS] = { ...hass.states[BEANS], state: on ? 'on' : 'off', last_changed: new Date().toISOString() };
      send();
      return undefined;
    }
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
        set('number.brew_ratio', String(r.water_ratio <= 25 ? r.water_ratio : 16));
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
    } else if (domain === 'update') {
      set(key, 'on', { in_progress: true });
      setTimeout(() => {
        set(key, 'off', { in_progress: false, installed_version: get(key).attributes.latest_version });
        send();
      }, 3000);
    } else if (domain === 'button') {
      if (name === 'restore_archived_recipe') {
        const chosen = get('select.archived_recipe').state;
        if (ARCHIVED[chosen]) {
          RECIPES[chosen] = ARCHIVED[chosen];
          delete ARCHIVED[chosen];
          listed();
        }
      } else if (name === 'start_brew' && get('binary_sensor.recipe_ready').state === 'on') brew();
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
