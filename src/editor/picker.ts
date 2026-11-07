import { LitElement, html, nothing } from 'lit';
import { define } from '../define';
import { areaName, domainOf, resolve } from '../entity';
import { stateIcon } from '../icon';
import type { GridTileConfig, HomeAssistant } from '../types';
import { isUseful, pickable, tileFor } from './layout';
import { editorStyles } from './sheet';

const WIDGETS: Array<{ label: string; sub: string; tile: GridTileConfig }> = [
  { label: 'Clock', sub: 'The time and date', tile: { type: 'clock' } },
  { label: 'Analog clock', sub: 'A clock face on the background', tile: { type: 'analog-clock' } },
  { label: 'Up next', sub: 'Coming events from every calendar', tile: { type: 'calendar' } },
  { label: 'Month', sub: 'This month, with busy days marked', tile: { type: 'calendar', view: 'month' } },
  { label: 'Now playing', sub: 'Whichever speaker is playing', tile: { type: 'now-playing' } },
  { label: 'Photos', sub: 'A slideshow from the media folder', tile: { type: 'photo' } },
  { label: 'Sunrise and sunset', sub: 'When the sun next rises or sets', tile: { type: 'sun' } },
  { label: 'Home Assistant card', sub: 'Any card, pasted as YAML', tile: { type: 'card', card: {} } },
];

/** Shown first; the rest of Home Assistant follows under "Everything else". */
const LIMIT = 200;

/**
 * Choosing what a tile shows: a clock, or any entity, searchable by name, id
 * or area. Thermostats and weather entities become their own tile kinds.
 * Fires `pick` with the tile.
 */
export class LuxFramePicker extends LitElement {
  static properties = {
    hass: { attribute: false },
    entitiesOnly: { type: Boolean, attribute: 'entities-only' },
    _query: { state: true },
  };

  declare hass?: HomeAssistant;
  /** Leave out the clocks, for choosing an entity rather than a tile. */
  declare entitiesOnly: boolean;
  declare _query: string;

  constructor() {
    super();
    this._query = '';
    this.entitiesOnly = false;
  }

  protected firstUpdated(): void {
    // On a wall tablet the keyboard would cover half the list; wait for a tap.
    if (!matchMedia('(pointer: coarse)').matches) {
      (this.renderRoot.querySelector('input') as HTMLInputElement | null)?.focus();
    }
  }

  private _pick(tile: GridTileConfig | string): void {
    this.dispatchEvent(new CustomEvent('pick', { detail: { tile } }));
  }

  private _entities() {
    const q = this._query.trim().toLowerCase();
    return pickable(this.hass)
      .map((s) => {
        const { name } = resolve(this.hass, s.entity_id);
        return { s, name, area: areaName(this.hass, s.entity_id) ?? '' };
      })
      .filter(({ s, name, area }) =>
        !q || [name, area, s.entity_id].some((text) => text.toLowerCase().includes(q)),
      )
      .sort(
        (a, b) =>
          Number(isUseful(b.s.entity_id)) - Number(isUseful(a.s.entity_id)) ||
          a.area.localeCompare(b.area) ||
          a.name.localeCompare(b.name),
      );
  }

  protected render() {
    const q = this._query.trim().toLowerCase();
    const widgets = this.entitiesOnly ? [] : WIDGETS.filter((w) => !q || w.label.toLowerCase().includes(q));
    const rooms = this.entitiesOnly
      ? []
      : Object.values(this.hass?.areas ?? {})
          .filter((a) => !q || a.name.toLowerCase().includes(q))
          .sort((a, b) => a.name.localeCompare(b.name));
    const entities = this._entities();
    const useful = entities.filter(({ s }) => isUseful(s.entity_id));
    const rest = entities.filter(({ s }) => !isUseful(s.entity_id));

    const row = ({ s, name, area }: (typeof entities)[number]) => html`
      <li>
        <button class="item" @click=${() => this._pick(tileFor(s.entity_id))}>
          <span class="icon">${stateIcon(this.hass, s, undefined, name)}</span>
          <span class="text">
            <span class="name">${name}</span>
            <div class="sub">${[area, domainOf(s.entity_id)].filter(Boolean).join(' · ')}</div>
          </span>
        </button>
      </li>
    `;

    return html`
      <input
        type="search"
        placeholder="Search devices, rooms…"
        aria-label="Search"
        .value=${this._query}
        @input=${(e: Event) => (this._query = (e.target as HTMLInputElement).value)}
      />
      ${widgets.length
        ? html`<h3>Widgets</h3>
            <ul class="list">
              ${widgets.map(
                (w) => html`<li>
                  <button class="item" @click=${() => this._pick(w.tile)}>
                    <span class="icon"><span class="glyph">${w.label.charAt(0)}</span></span>
                    <span class="text"><span class="name">${w.label}</span>
                      <div class="sub">${w.sub}</div></span>
                  </button>
                </li>`,
              )}
            </ul>`
        : nothing}
      ${rooms.length
        ? html`<h3>Rooms</h3>
            <ul class="list">
              ${rooms.map(
                (a) => html`<li>
                  <button class="item" @click=${() => this._pick({ type: 'room', area: a.area_id })}>
                    <span class="icon"><span class="glyph">${a.name.charAt(0)}</span></span>
                    <span class="text"><span class="name">${a.name}</span>
                      <div class="sub">Temperature and lights at a glance</div></span>
                  </button>
                </li>`,
              )}
            </ul>`
        : nothing}
      ${useful.length
        ? html`<h3>Devices</h3><ul class="list">${useful.slice(0, LIMIT).map(row)}</ul>`
        : nothing}
      ${rest.length && q
        ? html`<h3>Everything else</h3><ul class="list">${rest.slice(0, LIMIT).map(row)}</ul>`
        : nothing}
      ${!rest.length && !useful.length && !widgets.length && !rooms.length
        ? html`<p class="muted">Nothing matches “${this._query}”.</p>`
        : nothing}
      ${rest.length && !q
        ? html`<p class="muted">Search to find sensors and everything else.</p>`
        : nothing}
    `;
  }

  static styles = editorStyles;
}

define('luxframe-picker', LuxFramePicker);
