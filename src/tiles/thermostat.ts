import { LitElement, css, html, nothing, svg } from 'lit';
import { ACTION_LABELS, HVAC_ICONS, HVAC_LABELS, TempSetter, climateColor, formatTemp } from '../climate';
import { define } from '../define';
import { openDetail, resolve, stateLabel } from '../entity';
import { icon } from '../icons';
import { Pending } from '../pending';
import { glass, tileBase } from '../theme';
import type { HomeAssistant, ThermostatTileConfig, TileSize } from '../types';

export const chevron = (up: boolean, size = 26) => svg`
  <svg viewBox="0 0 24 24" width=${size} height=${size} aria-hidden="true">
    <path d=${up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} fill="none" stroke="currentColor"
      stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
`;

/**
 * A climate entity, always glass: its target large with ▼/▲, what it's doing
 * in the mode's color (orange heating, blue cooling), and on medium and large
 * tiles a row of its modes.
 */
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

  private _mode = new Pending<string>(this);

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

  private _setMode(mode: string, e: Event): void {
    e.stopPropagation();
    this._mode.release(mode);
    this.hass?.callService('climate', 'set_hvac_mode', { entity_id: this.config!.entity, hvac_mode: mode });
  }

  private _detail(): void {
    if (this.config) openDetail(this, this.config.entity);
  }

  private _renderModes(modes: string[], current: string) {
    return html`<div class="modes" role="group" aria-label="Mode">
      ${modes.map(
        (mode) => html`<button
          class="mode ${mode === current ? 'on' : ''}"
          aria-label=${HVAC_LABELS[mode] ?? mode}
          aria-pressed=${mode === current}
          @click=${(e: Event) => this._setMode(mode, e)}
        >
          ${HVAC_ICONS[mode] ? icon(HVAC_ICONS[mode], 22) : (HVAC_LABELS[mode] ?? mode).charAt(0)}
        </button>`,
      )}
    </div>`;
  }

  protected render() {
    if (!this.config) return nothing;
    const stateObj = this._stateObj;
    if (!stateObj) {
      return html`<div class="tile glass empty muted">No thermostat</div>`;
    }

    const { name, area } = resolve(this.hass, { entity: this.config.entity, name: this.config.name });
    const a = stateObj.attributes;
    const unavailable = stateObj.state === 'unavailable';
    const mode = this._mode.get(stateObj.state) ?? stateObj.state;
    // A mode just tapped shows its own color, not what the old mode was doing.
    const color = unavailable
      ? undefined
      : climateColor(mode === stateObj.state ? stateObj : { ...stateObj, state: mode, attributes: {} });
    const target = this._setter.value(a.temperature);
    const current: number | undefined = a.current_temperature;
    const range =
      target === undefined && typeof a.target_temp_low === 'number' && typeof a.target_temp_high === 'number'
        ? `${formatTemp(a.target_temp_low)}–${formatTemp(a.target_temp_high)}`
        : undefined;
    const big =
      target !== undefined ? formatTemp(target) : (range ?? (current !== undefined ? formatTemp(current) : '–'));
    const sub = [area, current !== undefined ? `${formatTemp(current)}°` : undefined].filter(Boolean).join(' · ');

    const modeName = HVAC_LABELS[mode] ?? mode;
    const action =
      a.hvac_action && a.hvac_action !== 'off' && mode === stateObj.state
        ? (ACTION_LABELS[a.hvac_action] ?? a.hvac_action)
        : undefined;
    const roomy = this.size === 'm' || this.size === 'l';
    const status = unavailable
      ? stateLabel(this.hass, stateObj)
      : mode === 'off'
        ? 'Off'
        : roomy && action
          ? `${modeName} · ${action}`
          : (action ?? modeName);
    const modes: string[] = a.hvac_modes ?? [];

    return html`
      <div class="tile glass ${color ? 'tinted' : ''}" style=${color ? `--mode: ${color}` : ''}>
        <div class="status">${status}</div>
        <div
          class="value ${range ? 'range' : ''}"
          role="button"
          tabindex="0"
          aria-label="${name}, set to ${big}. Open details"
          @click=${this._detail}
        >
          ${big}
        </div>
        ${roomy && modes.length > 1 && !unavailable ? this._renderModes(modes, mode) : nothing}
        <div class="footer">
          ${target !== undefined
            ? html`<button class="step" aria-label="Lower" @click=${(e: Event) => this._step(-1, e)}>
                ${chevron(false)}
              </button>`
            : html`<span class="spacer"></span>`}
          <div class="label" @click=${this._detail}>
            <div class="name">${name}</div>
            <div class="muted">${sub || stateLabel(this.hass, stateObj)}</div>
          </div>
          ${target !== undefined
            ? html`<button class="step" aria-label="Raise" @click=${(e: Event) => this._step(1, e)}>
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

      /* The mode's color as a soft glow from below, never a solid fill. */
      .tinted::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(
          120% 70% at 50% 115%,
          color-mix(in srgb, var(--mode) 32%, transparent),
          transparent 70%
        );
      }

      .tile > * {
        position: relative;
      }

      .status {
        min-height: 20px;
        text-align: center;
        font-size: 15px;
        font-weight: 600;
        color: var(--mode, var(--lf-muted));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .value.range {
        font-size: clamp(36px, 6vw, 84px);
      }

      .modes {
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-bottom: 10px;
      }

      .mode {
        width: 44px;
        height: 44px;
        font-size: 16px;
        font-weight: 600;
        background: color-mix(in srgb, currentColor 10%, transparent);
      }

      .mode.on {
        background: var(--lf-surface-active);
        color: var(--lf-text-active);
      }

      .tinted .mode.on {
        background: var(--mode);
        color: #fff;
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
      :host([size='w']) .value,
      :host([size='s']) .value.range,
      :host([size='w']) .value.range {
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

      .step,
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

      :host([size='s']) .step,
      :host([size='s']) .spacer {
        width: 32px;
      }
    `,
  ];
}

define('luxframe-thermostat-tile', LuxFrameThermostatTile);
