import '../src/luxframe';
import type { LuxFrameCard } from '../src/luxframe-card';
import type { LuxFrameConfig } from '../src/types';
import { createMockHass } from './mock-hass';

const params = new URLSearchParams(location.search);

// ?theme=ha previews against a stand-in for Home Assistant's default theme;
// ?override shows a --luxframe-* variable winning, as an HA theme would set it.
if (params.get('theme') === 'ha') {
  Object.entries({
    '--primary-background-color': '#fafafa',
    '--card-background-color': '#ffffff',
    '--primary-text-color': '#212121',
    '--secondary-text-color': '#727272',
    '--disabled-text-color': '#bdbdbd',
    '--state-icon-active-color': '#fdd835',
    '--primary-color': '#03a9f4',
    '--ha-card-box-shadow': '0 2px 2px rgb(0 0 0 / 14%), 0 1px 5px rgb(0 0 0 / 12%)',
    '--ha-card-border-radius': '12px',
  }).forEach(([name, value]) => document.documentElement.style.setProperty(name, value));
}
if (params.has('override')) {
  document.documentElement.style.setProperty('--luxframe-accent', '#32d74b');
}

const config: LuxFrameConfig = {
  type: 'custom:luxframe-card',
  home_after: 0,
  theme: (params.get('theme') as LuxFrameConfig['theme']) ?? 'auto',
  // ?wall puts a sample wallpaper behind the pages; the glass tints to match it.
  background: params.has('wall') ? "center / cover no-repeat url('./wallpaper.svg')" : undefined,
  quick_panel: { pinned: ['light.porch', 'lock.front_door', 'scene.movie'] },
  pages: [
    {
      type: 'grid',
      title: 'At a glance',
      tiles: [
        { type: 'calendar' },
        { type: 'now-playing' },
        { type: 'sun' },
        { type: 'room', area: 'living_room' },
        { type: 'todo', entity: 'todo.shopping' },
        { type: 'camera', entity: 'camera.front_door' },
        { type: 'calendar', view: 'month' },
        { type: 'room', area: 'bedroom' },
        { type: 'photo', folder: 'photos', interval: 8 },
      ],
    },
    {
      type: 'grid',
      title: 'Cards',
      tiles: [
        { type: 'card', card: { type: 'thermostat', entity: 'climate.living_room' } },
        { type: 'card', size: 'w', card: { type: 'custom:late-card', text: 'Loaded late' } },
        { type: 'card', size: 'w', glass: false, card: { type: 'markdown', content: 'Its own background' } },
        { type: 'card', card: {} },
      ],
    },
    {
      type: 'grid',
      tiles: [
        { type: 'thermostat', entity: 'climate.living_room' },
        { type: 'analog-clock' },
        'light.bedside',
        { type: 'weather' },
        'lock.front_door',
        'scene.arrive_home',
        'fan.bedroom',
        'cover.shades',
        'light.porch',
      ],
    },
    {
      type: 'grid',
      title: 'Everywhere',
      tiles: [
        { type: 'clock', size: 'w' },
        { type: 'weather', size: 'w' },
        'light.living_room',
        'light.floor_lamp',
        'light.reading',
        'fan.ceiling',
        'cover.blinds',
        'cover.garage',
        'light.island',
        'switch.coffee',
      ],
    },
    { type: 'clock', weather: 'weather.home' },
    {
      type: 'room',
      title: 'Living room',
      sensors: ['sensor.living_temperature', 'sensor.living_humidity'],
      entities: [
        'light.living_room',
        'light.floor_lamp',
        'light.reading',
        'fan.ceiling',
        'cover.blinds',
        'lock.front_door',
      ],
    },
    {
      type: 'room',
      title: 'Kitchen',
      entities: ['light.kitchen', 'light.island', 'switch.coffee', 'cover.garage'],
    },
    { type: 'weather' },
    { type: 'calendar' },
    { type: 'cameras' },
    { type: 'photos', folder: 'photos', interval: 8 },
    { type: 'night', weather: 'weather.home' },
    {
      type: 'scenes',
      scenes: ['scene.morning', 'scene.dinner', 'scene.movie', 'scene.goodnight', 'script.leave_home'],
    },
  ],
};

// A stand-in for Home Assistant's card factory. Real cards read the same
// --ha-card-* variables, so the glass treatment shows here too.
class DevCard extends HTMLElement {
  config: Record<string, any> = {};
  layout?: string;
  private _hass?: any;
  set hass(hass: any) {
    this._hass = hass;
    this._render();
  }
  connectedCallback() {
    this._render();
  }
  private _render() {
    if (!this.isConnected) return;
    const s = this.config.entity ? this._hass?.states[this.config.entity] : undefined;
    const body = s
      ? `<b style="font-size:48px;font-weight:300">${s.attributes.temperature}°</b><div style="color:var(--secondary-text-color)">${s.attributes.friendly_name} · ${s.state}</div>`
      : `<div>${this.config.content ?? this.config.text ?? ''}</div>`;
    this.innerHTML = `<div class="ha-card" style="box-sizing:border-box;height:100%;padding:16px;
      background:var(--ha-card-background, #fff);color:var(--primary-text-color, #111);
      border-radius:var(--ha-card-border-radius, 12px);box-shadow:var(--ha-card-box-shadow, 0 2px 6px #0003)">
      <div style="color:var(--secondary-text-color, #666);font-size:13px">${this.config.type}</div>${body}</div>`;
  }
}
customElements.define('dev-card', DevCard);
window.loadCardHelpers = async () => ({
  createCardElement(config: Record<string, unknown>) {
    const type = String(config.type);
    const element = document.createElement('dev-card') as DevCard;
    if (type.startsWith('custom:') && !customElements.get(type.slice(7))) {
      element.config = { type: 'Loading…' };
      // Like Home Assistant: ask to be rebuilt once the card's code arrives.
      customElements.whenDefined(type.slice(7)).then(() =>
        element.dispatchEvent(new Event('ll-rebuild', { bubbles: true, composed: true })),
      );
    } else {
      element.config = config;
    }
    return element as any;
  },
});
setTimeout(() => customElements.define('late-card', class extends HTMLElement {}), 1500);

const card = document.createElement('luxframe-card') as LuxFrameCard;
card.setConfig(config);
const hass = createMockHass((next) => (card.hass = next));

// A stand-in for the dashboard LuxFrame lives in, so Done can save to it.
// ?guest signs in as a non-admin; ?yaml makes the dashboard refuse saves.
let dashboard: { views: Array<{ type: string; cards: LuxFrameConfig[] }> } = {
  views: [{ type: 'panel', cards: [config] }],
};
hass.user = { name: 'Dev', is_admin: !params.has('guest') };
hass.callWS = (async (message: Record<string, any>) => {
  console.log('callWS', message.type, message.url_path);
  await new Promise((r) => setTimeout(r, 300));
  if (message.type === 'lovelace/config') return structuredClone(dashboard);
  if (message.type === 'lovelace/config/save') {
    if (params.has('yaml')) throw new Error('Not supported');
    dashboard = message.config;
    // Home Assistant reloads the dashboard and hands each card its new config.
    setTimeout(() => card.setConfig(dashboard.views[0].cards[0]), 200);
    return null;
  }
  if (message.type === 'conversation/process') return converse(message.text, message.conversation_id);
  if (message.type === 'todo/item/list') return { items: todo.filter((item) => item.status === 'needs_action') };
  if (message.type === 'media_source/browse_media') {
    if (!String(message.media_content_id).endsWith('/photos')) return { children: [] };
    return {
      children: [1, 2, 3].map((n) => ({
        media_content_id: `media-source://media_source/local/photos/${n}.svg`,
        media_class: 'image',
        media_content_type: 'image/svg+xml',
      })),
    };
  }
  if (message.type === 'media_source/resolve_media') {
    return { url: `./photos/${String(message.media_content_id).split('/').pop()}` };
  }
  throw new Error(`Unknown command ${message.type}`);
}) as typeof hass.callWS;
// To-do items, calendar events and forecasts, made up around today.
const todo = [
  { uid: '1', summary: 'Oat milk', status: 'needs_action' },
  { uid: '2', summary: 'Lemons', status: 'needs_action' },
  { uid: '3', summary: 'Coffee beans', status: 'needs_action' },
];
const originalCall = hass.callService.bind(hass);
hass.callService = async (domain, service, data) => {
  if (domain === 'todo' && service === 'update_item') {
    const item = todo.find((t) => t.uid === data?.item);
    if (item) item.status = String(data?.status);
  }
  return originalCall(domain, service, data);
};

const at = (days: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const day = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const EVENTS: Record<string, Array<Record<string, unknown>>> = {
  'calendar.family': [
    { summary: 'Swimming lessons', start: { dateTime: at(0, 17, 30) }, end: { dateTime: at(0, 18, 30) }, location: 'Leisure centre' },
    { summary: "Grandma's birthday", start: { date: day(2) }, end: { date: day(3) } },
    { summary: 'Bins out', start: { dateTime: at(3, 19) }, end: { dateTime: at(3, 19, 15) } },
    { summary: 'Dinner with the Okafors', start: { dateTime: at(5, 19, 30) }, end: { dateTime: at(5, 22) } },
  ],
  'calendar.work': [
    { summary: 'Design review', start: { dateTime: at(1, 10) }, end: { dateTime: at(1, 11) } },
    { summary: 'Team offsite', start: { date: day(8) }, end: { date: day(10) } },
  ],
};
hass.callApi = (async (_method: string, path: string) => {
  const match = /^calendars\/([^?]+)\?start=([^&]+)&end=(.+)$/.exec(path);
  if (!match) throw new Error(`Unknown API ${path}`);
  const [start, end] = [new Date(decodeURIComponent(match[2])), new Date(decodeURIComponent(match[3]))];
  const date = (v: any) => new Date(v.dateTime ?? `${v.date}T00:00:00`);
  return (EVENTS[match[1]] ?? []).filter((e: any) => date(e.end) > start && date(e.start) < end);
}) as typeof hass.callApi;

const CONDITIONS = ['sunny', 'partlycloudy', 'cloudy', 'rainy', 'partlycloudy', 'sunny', 'pouring'];
hass.connection = {
  async subscribeMessage<T>(callback: (message: T) => void, message: Record<string, unknown>) {
    const hourly = message.forecast_type === 'hourly';
    const forecast = Array.from({ length: hourly ? 24 : 7 }, (_, i) => {
      const t = new Date();
      if (hourly) t.setHours(t.getHours() + i, 0, 0, 0);
      else t.setDate(t.getDate() + i);
      return {
        datetime: t.toISOString(),
        condition: CONDITIONS[(i + (hourly ? 1 : 0)) % CONDITIONS.length],
        temperature: hourly ? 18 - Math.abs(i - 4) * 0.6 : 16 + ((i * 3) % 7),
        templow: hourly ? undefined : 8 + ((i * 2) % 5),
        precipitation_probability: [0, 10, 40, 80, 20, 0, 90][i % 7],
      };
    });
    setTimeout(() => callback({ forecast } as T), 100);
    return () => undefined;
  },
};

card.hass = hass;
document.body.append(card);

// Just enough of Assist to try the sheet: "turn on/off <name>" works on
// lights and switches; anything else gets HA's "didn't understand" answer.
async function converse(text: string, conversationId?: string) {
  const match = /turn (on|off) (?:the )?(.+)/i.exec(text);
  const target = match
    ? Object.values(hass.states).find(
        (s) =>
          /^(light|switch)\./.test(s.entity_id) &&
          String(s.attributes.friendly_name ?? '').toLowerCase().includes(match[2].replace(/ lights?$/i, '').toLowerCase()),
      )
    : undefined;
  const reply = (speech: string, type = 'action_done') => ({
    conversation_id: conversationId ?? 'dev-conversation',
    response: { response_type: type, speech: { plain: { speech } } },
  });
  if (!match || !target) return reply("Sorry, I couldn't understand that", 'error');
  await hass.callService('homeassistant', match[1] === 'on' ? 'turn_on' : 'turn_off', { entity_id: target.entity_id });
  return reply(`Turned ${match[1]} the ${target.attributes.friendly_name}`);
}

document.addEventListener('hass-more-info', (e) => {
  console.log('more-info', (e as CustomEvent).detail.entityId);
});
