import { LitElement, css, html, nothing, svg } from 'lit';
import { TempSetter, formatTemp } from '../climate';
import { define } from '../define';
import { openDetail, resolve, stateLabel } from '../entity';
import { glass, tileBase } from '../theme';
import type { HomeAssistant, ThermostatTileConfig, TileSize } from '../types';

export const chevron = (up: boolean, size = 26) => svg`
  <svg viewBox="0 0 24 24" width=${size} height=${size} aria-hidden="true">
    <path d=${up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} fill="none" stroke="currentColor"
      stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
`;

/** A climate entity: its target large, ▼/▲ to change it, current temperature below. */
export class LuxFrameThermostatTile extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    size: { reflect: true },
  };

  declare hass?: HomeAssistant;
  declare config?: ThermostatTileConfig;
  declare size: TileSize;

  private _setter = new TempSetter(this, (temperature) =>
    this.hass?.callService('climate', 'set_temperature', {
      entity_id: this.config!.entity,
      temperature,
    }),
  );

  constructor() {
    super();
    this.size = 'm';
  }

  private get _stateObj() {
    return this.config ? this.hass?.states[this.config.entity] : undefined;
  }

  private _step(direction: 1 | -1, e: Event): void {
    e.stopPropagation();
    const stateObj = this._stateObj;
    if (stateObj) this._setter.step(this.hass, stateObj, stateObj.attributes.temperature, direction);
  }

  private _detail(): void {
    if (this.config) openDetail(this, this.config.entity);
  }

  protected render() {
    if (!this.config) return nothing;
    const stateObj = this._stateObj;
    if (!stateObj) {
      return html`<div class="tile glass empty muted">No thermostat</div>`;
    }

    const { name, area } = resolve(this.hass, { entity: this.config.entity, name: this.config.name });
    const a = stateObj.attributes;
    const target = this._setter.value(a.temperature);
    const current: number | undefined = a.current_temperature;
    const active = stateObj.state !== 'off' && stateObj.state !== 'unavailable';
    const big = target ?? current;
    const sub = [area, current !== undefined ? `${formatTemp(current)}°` : undefined]
      .filter(Boolean)
      .join(' · ');

    return html`
      <div class="tile glass ${active ? 'active' : ''}">
        <div
          class="value"
          role="button"
          tabindex="0"
          aria-label="${name}, set to ${big ?? 'unknown'}. Open details"
          @click=${this._detail}
        >
          ${big !== undefined ? formatTemp(big) : '–'}
        </div>
        <div class="footer">
          ${target !== undefined
            ? html`<button aria-label="Lower" @click=${(e: Event) => this._step(-1, e)}>
                ${chevron(false)}
              </button>`
            : html`<span class="spacer"></span>`}
          <div class="label" @click=${this._detail}>
            <div class="name">${name}</div>
            <div class="muted">${target === undefined ? stateLabel(this.hass, stateObj) : sub}</div>
          </div>
          ${target !== undefined
            ? html`<button aria-label="Raise" @click=${(e: Event) => this._step(1, e)}>
                ${chevron(true)}
              </button>`
            : html`<span class="spacer"></span>`}
        </div>
      </div>
    `;
  }

  static styles = [
    tileBase,
    glass,
    css`
      .tile {
        display: flex;
        flex-direction: column;
        padding: 12px 14px 14px;
        user-select: none;
      }

      .empty {
        display: grid;
        place-items: center;
      }

      .value {
        flex: 1;
        display: grid;
        place-items: center;
        font-size: clamp(40px, 9vw, 120px);
        font-weight: 400;
        letter-spacing: -0.03em;
        font-variant-numeric: tabular-nums;
        cursor: pointer;
        outline: none;
      }

      :host([size='s']) .value,
      :host([size='w']) .value {
        font-size: 40px;
      }

      .footer {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .label {
        flex: 1;
        min-width: 0;
        text-align: center;
        cursor: pointer;
      }

      .name {
        font-size: 16px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .label .muted {
        font-size: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      button,
      .spacer {
        flex: none;
        width: 44px;
        height: 44px;
      }

      button {
        display: grid;
        place-items: center;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: none;
        color: inherit;
        cursor: pointer;
      }

      button:active {
        background: color-mix(in srgb, currentColor 12%, transparent);
      }

      :host([size='s']) button,
      :host([size='s']) .spacer {
        width: 32px;
      }
    `,
  ];
}

define('luxframe-thermostat-tile', LuxFrameThermostatTile);
