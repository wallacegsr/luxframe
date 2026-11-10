import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { conditionLabel } from '../data';
import { openDetail } from '../entity';
import { glass, tileBase } from '../theme';
import type { HomeAssistant, TileSize, WeatherTileConfig } from '../types';

/** Current conditions: temperature large, the condition, and more on bigger tiles. */
export class LuxFrameWeatherTile extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    size: { reflect: true },
  };

  declare hass?: HomeAssistant;
  declare config?: WeatherTileConfig;
  declare size: TileSize;

  constructor() {
    super();
    this.size = 's';
  }

  /** The configured entity, else the first weather entity Home Assistant has. */
  private get _entityId(): string | undefined {
    if (this.config?.entity) return this.config.entity;
    return Object.keys(this.hass?.states ?? {}).find((id) => id.startsWith('weather.'));
  }

  protected render() {
    const id = this._entityId;
    const stateObj = id ? this.hass?.states[id] : undefined;
    if (!stateObj) return html`<div class="tile glass empty muted">No weather</div>`;

    const a = stateObj.attributes;
    const roomy = this.size !== 's';
    const icon = customElements.get('ha-state-icon')
      ? html`<ha-state-icon class="icon" .hass=${this.hass} .stateObj=${stateObj}></ha-state-icon>`
      : nothing;
    const details = [
      typeof a.humidity === 'number' ? `Humidity ${Math.round(a.humidity)}%` : undefined,
      typeof a.wind_speed === 'number'
        ? `Wind ${Math.round(a.wind_speed)} ${a.wind_speed_unit ?? ''}`.trim()
        : undefined,
    ].filter(Boolean);

    return html`
      <div
        class="tile glass"
        role="button"
        tabindex="0"
        @click=${() => openDetail(this, stateObj.entity_id)}
      >
        <div class="top">
          ${icon}
          <span class="temp">${typeof a.temperature === 'number' ? Math.round(a.temperature) : '–'}°</span>
        </div>
        <div class="condition">${conditionLabel(this.hass, stateObj)}</div>
        ${roomy && details.length ? html`<div class="muted">${details.join(' · ')}</div>` : nothing}
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
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 12px;
        text-align: center;
        cursor: pointer;
        outline: none;
      }

      .empty {
        cursor: default;
      }

      .top {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .icon {
        --mdc-icon-size: 30px;
        color: var(--lf-text);
      }

      .temp {
        font-size: 40px;
        font-weight: 300;
        font-variant-numeric: tabular-nums;
      }

      :host([size='m']) .temp,
      :host([size='l']) .temp {
        font-size: clamp(56px, 7vw, 96px);
        font-weight: 200;
      }

      :host([size='m']) .icon,
      :host([size='l']) .icon {
        --mdc-icon-size: 48px;
      }

      .condition {
        font-size: 17px;
        font-weight: 600;
      }

      .muted {
        font-size: 15px;
      }
    `,
  ];
}

define('luxframe-weather-tile', LuxFrameWeatherTile);
