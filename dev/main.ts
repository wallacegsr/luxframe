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
    {
      type: 'scenes',
      scenes: ['scene.morning', 'scene.dinner', 'scene.movie', 'scene.goodnight', 'script.leave_home'],
    },
  ],
};

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
  throw new Error(`Unknown command ${message.type}`);
}) as typeof hass.callWS;
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
