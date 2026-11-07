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
card.hass = createMockHass((hass) => (card.hass = hass));
document.body.append(card);

document.addEventListener('hass-more-info', (e) => {
  console.log('more-info', (e as CustomEvent).detail.entityId);
});
