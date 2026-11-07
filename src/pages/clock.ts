import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { conditionLabel } from '../data';
import { glass, pageStyles } from '../theme';
import { formatDate, formatTime, onMinute } from '../time';
import type { ClockPageConfig, HomeAssistant } from '../types';
import { BUILD } from '../version';

/** A large, calm clock with the date, an optional greeting and the weather. */
export class LuxFrameClock extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    _now: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: ClockPageConfig;
  declare _now: Date;

  private _off?: () => void;

  constructor() {
    super();
    this._now = new Date();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._now = new Date();
    this._off = onMinute(() => (this._now = new Date()));
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._off?.();
  }

  private _greeting(): string {
    const hour = this._now.getHours();
    if (hour < 5) return 'Good night';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  private _renderWeather() {
    const id = this.config?.weather;
    const weather = id ? this.hass?.states[id] : undefined;
    if (!weather) return nothing;
    const temp = weather.attributes.temperature;
    const unit =
      weather.attributes.temperature_unit ?? this.hass?.config?.unit_system?.temperature ?? '°';
    return html`
      <div class="weather glass">
        ${temp !== undefined ? html`<span class="temp">${Math.round(temp)}${unit}</span>` : nothing}
        <span class="condition">${conditionLabel(this.hass, weather)}</span>
      </div>
    `;
  }

  protected render() {
    const time = formatTime(this.hass, this._now);
    const date = formatDate(this.hass, this._now);

    return html`
      <div class="center">
        ${this.config?.greeting === false
          ? nothing
          : html`<div class="greeting">${this._greeting()}</div>`}
        <div class="time">${time}</div>
        <div class="date">${date}</div>
        ${this._renderWeather()}
      </div>
      <div class="build">LuxFrame ${BUILD}</div>
    `;
  }

  static styles = [
    pageStyles,
    glass,
    css`
      :host {
        position: relative;
        display: grid;
        place-items: center;
      }

      .center {
        text-align: center;
      }

      .greeting {
        font-size: clamp(18px, 2.4vw, 24px);
        color: var(--lf-muted);
        margin-bottom: 4px;
      }

      .time {
        font-size: clamp(96px, 22vw, 240px);
        font-weight: 200;
        line-height: 1;
        letter-spacing: -0.04em;
        font-variant-numeric: tabular-nums;
      }

      .date {
        margin-top: 12px;
        font-size: clamp(20px, 3vw, 30px);
        font-weight: 500;
      }

      .weather {
        margin-top: 28px;
        display: inline-flex;
        align-items: baseline;
        gap: 12px;
        padding: 10px 22px;
        border-radius: 999px;
      }

      .temp {
        font-size: 26px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }

      .condition {
        font-size: 18px;
        color: var(--lf-muted);
      }

      .build {
        position: absolute;
        right: 16px;
        bottom: 14px;
        font-size: 11px;
        color: var(--lf-faint);
      }
    `,
  ];
}

define('luxframe-clock', LuxFrameClock);
