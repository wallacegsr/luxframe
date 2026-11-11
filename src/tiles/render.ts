import { html } from 'lit';
import { html as staticHtml, literal, type StaticValue } from 'lit/static-html.js';
import type { GridTileConfig, GridTileType, HomeAssistant, SwitchTileConfig, TileSize } from '../types';

/** Tile kinds that are a plain element taking hass, config and size. */
const TILE_TAGS: Partial<Record<GridTileType, StaticValue>> = {
  thermostat: literal`luxframe-thermostat-tile`,
  weather: literal`luxframe-weather-tile`,
  calendar: literal`luxframe-calendar-tile`,
  'now-playing': literal`luxframe-now-playing-tile`,
  camera: literal`luxframe-camera-tile`,
  photo: literal`luxframe-photo-tile`,
  sun: literal`luxframe-sun-tile`,
  todo: literal`luxframe-todo-tile`,
  room: literal`luxframe-room-tile`,
  card: literal`luxframe-card-tile`,
  button: literal`luxframe-button-tile`,
  sensor: literal`luxframe-sensor-tile`,
  alarm: literal`luxframe-alarm-tile`,
  timer: literal`luxframe-timer-tile`,
  people: literal`luxframe-people-tile`,
  vacuum: literal`luxframe-vacuum-tile`,
  number: literal`luxframe-number-tile`,
  select: literal`luxframe-select-tile`,
  energy: literal`luxframe-energy-tile`,
};

/** Any LuxFrame tile, drawn as `size`; on a grid page or in the quick panel. */
export function renderTile(hass: HomeAssistant | undefined, tile: GridTileConfig, size: TileSize) {
  const tag = TILE_TAGS[tile.type ?? 'entity'];
  if (tag) return staticHtml`<${tag} .hass=${hass} .config=${tile} size=${size}></${tag}>`;
  switch (tile.type ?? 'entity') {
    case 'clock':
      return html`<luxframe-clock-tile .hass=${hass} size=${size}></luxframe-clock-tile>`;
    case 'analog-clock':
      return html`<luxframe-analog-clock-tile .hass=${hass} size=${size}></luxframe-analog-clock-tile>`;
    case 'switch': {
      const { entity, name, icon } = tile as SwitchTileConfig;
      return html`<luxframe-tile toggles .hass=${hass} .entity=${{ entity, name, icon }} size=${size}></luxframe-tile>`;
    }
    default: {
      const { entity, name, icon } = tile as { entity: string; name?: string; icon?: string };
      return html`<luxframe-tile .hass=${hass} .entity=${{ entity, name, icon }} size=${size}></luxframe-tile>`;
    }
  }
}
