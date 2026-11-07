import { LitElement, html, nothing, type PropertyValues } from 'lit';
import { define } from '../define';
import { areaName, domainOf, resolve } from '../entity';
import { stateIcon } from '../icon';
import type { GridTileConfig, HomeAssistant } from '../types';
import { dashboardCards, type FoundCard } from './dashboard-cards';
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
];

/** Shown first; the rest of Home Assistant follows under "Everything else". */
const LIMIT = 200;

/** Dashboard cards shown before "Show all", unless searching. */
const FEW_CARDS = 5;

/**
 * Choosing what a tile shows: a card from one of the user's dashboards, a
 * clock, or any entity, searchable by name, id or area. Thermostats and
 * weather entities become their own tile kinds. Fires `pick` with the tile.
 */
export class LuxFramePicker extends LitElement {
  static properties = {
    hass: { attribute: false },
    entitiesOnly: { type: Boolean, attribute: 'entities-only' },
    _query: { state: true },
    _found: { state: true },
    _allCards: { state: true },
  };

  declare hass?: HomeAssistant;
  /** Leave out the clocks, for choosing an entity rather than a tile. */
  declare entitiesOnly: boolean;
  declare _query: string;
  /** Cards on the user's dashboards; undefined while they're being read. */
  declare _found?: FoundCard[];
  declare _allCards: boolean;

  private _looking = false;

  constructor() {
    super();
    this._query = '';
    this.entitiesOnly = false;
    this._allCards = false;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('hass') && this.hass && !this.entitiesOnly && !this._looking) {
      this._looking = true;
      dashboardCards(this.hass)
        .catch(() => [])
        .then((found) => (this._found = found));
    }
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

  private _matchingCards(q: string): FoundCard[] {
    if (this.entitiesOnly) return [];
    return (this._found ?? []).filter(
      (f) =>
        !q ||
        [f.name, f.shows ?? '', f.where, String(f.card.type)].some((text) => text.toLowerCase().includes(q)),
    );
  }

  private _renderCards(q: string) {
    if (this.entitiesOnly) return nothing;
    const paste = !q || 'paste yaml home assistant card'.includes(q);
    const matching = this._matchingCards(q);
    const shown = q || this._allCards ? matching : matching.slice(0, FEW_CARDS);
    if (!paste && !matching.length && this._found) return nothing;

    return html`<h3>From your dashboards</h3>
      <ul class="list">
        ${paste
          ? html`<li>
              <button class="item" @click=${() => this._pick({ type: 'card', card: {} })}>
                <span class="icon"><span class="glyph">+</span></span>
                <span class="text"><span class="name">Paste a card’s YAML</span>
                  <div class="sub">Any Home Assistant card</div></span>
              </button>
            </li>`
          : nothing}
        ${shown.map(
          (f) => html`<li>
            <button class="item" @click=${() => this._pick({ type: 'card', size: f.size, card: f.card })}>
              <span class="icon">
                ${f.entity && this.hass?.states[f.entity]
                  ? stateIcon(this.hass, this.hass.states[f.entity], undefined, f.name)
                  : html`<span class="glyph">${f.name.charAt(0)}</span>`}
              </span>
              <span class="text"><span class="name">${f.name}</span>
                <div class="sub">${[f.shows, f.where].filter(Boolean).join(' · ')}</div></span>
            </button>
          </li>`,
        )}
      </ul>
      ${!this._found
        ? html`<p class="muted">Looking through your dashboards…</p>`
        : shown.length < matching.length
          ? html`<button class="chip" @click=${() => (this._allCards = true)}>
              Show all ${matching.length} cards
            </button>`
          : nothing}`;
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
      ${this._renderCards(q)}
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
      ${!rest.length && !useful.length && !widgets.length && !rooms.length && !this._matchingCards(q).length
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
