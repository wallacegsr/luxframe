import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import {
  conditionIcon,
  conditionLabel,
  CONDITIONS,
  firstWeather,
  subscribeForecast,
  type Forecast,
} from '../data';
import { define } from '../define';
import { glass, pageStyles } from '../theme';
import type { HomeAssistant, WeatherPageConfig } from '../types';

const HOURS = 12;
const DAYS = 7;

/**
 * The weather in full: now (large), the next twelve hours, and the week with
 * each day's range drawn against the whole week's.
 */
export class LuxFrameWeatherPage extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    embedded: { type: Boolean, reflect: true },
    _daily: { state: true },
    _hourly: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: WeatherPageConfig;
  /** Shown in a detail sheet rather than as a page. */
  declare embedded?: boolean;
  declare _daily?: Forecast[];
  declare _hourly?: Forecast[];

  private _subscribedTo?: string;
  private _unsubs: Array<Promise<(() => void) | undefined>> = [];

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe();
    this._subscribedTo = undefined;
  }

  private _unsubscribe(): void {
    this._unsubs.forEach((p) => p.then((off) => off?.()));
    this._unsubs = [];
  }

  protected willUpdate(changed: PropertyValues): void {
    if (!changed.has('hass') && !changed.has('config')) return;
    const id = firstWeather(this.hass, this.config?.entity)?.entity_id;
    if (!this.isConnected || !id || id === this._subscribedTo) return;
    this._unsubscribe();
    this._subscribedTo = id;
    this._unsubs = [
      subscribeForecast(this.hass, id, 'daily', (f) => (this._daily = f)),
      subscribeForecast(this.hass, id, 'hourly', (f) => (this._hourly = f)),
    ];
  }

  private _unit(): string {
    const s = firstWeather(this.hass, this.config?.entity);
    return s?.attributes.temperature_unit ?? this.hass?.config?.unit_system?.temperature ?? '°';
  }

  private _renderDays() {
    const days = (this._daily ?? []).slice(0, DAYS);
    if (!days.length) return nothing;
    const lows = days.map((d) => d.templow ?? d.temperature ?? 0);
    const highs = days.map((d) => d.temperature ?? 0);
    const min = Math.min(...lows);
    const span = Math.max(1, Math.max(...highs) - min);
    const lang = this.hass?.locale?.language;
    return html`
      <ol class="days glass">
        ${days.map((d, i) => {
          const low = d.templow ?? d.temperature;
          const high = d.temperature;
          const name = i === 0 ? 'Today' : new Date(d.datetime).toLocaleDateString(lang, { weekday: 'short' });
          return html`<li>
            <span class="day">${name}</span>
            <span class="cond" title=${CONDITIONS[d.condition ?? '']?.label ?? ''}>${conditionIcon(d.condition, 24)}</span>
            <span class="rain muted">${d.precipitation_probability ? `${Math.round(d.precipitation_probability)}%` : ''}</span>
            <span class="muted num">${low !== undefined ? Math.round(low) : '–'}°</span>
            <span class="range"><span style="left: ${(((low ?? min) - min) / span) * 100}%; right: ${100 - (((high ?? min) - min) / span) * 100}%"></span></span>
            <span class="num">${high !== undefined ? Math.round(high) : '–'}°</span>
          </li>`;
        })}
      </ol>
    `;
  }

  private _renderHours() {
    const hours = (this._hourly ?? []).slice(0, HOURS);
    if (!hours.length) return nothing;
    return html`
      <ol class="hours glass">
        ${hours.map(
          (h, i) => html`<li>
            <span class="muted">${i === 0
              ? 'Now'
              : new Date(h.datetime).toLocaleTimeString(this.hass?.locale?.language, { hour: 'numeric' })}</span>
            ${conditionIcon(h.condition, 24)}
            <span class="num">${h.temperature !== undefined ? Math.round(h.temperature) : '–'}°</span>
          </li>`,
        )}
      </ol>
    `;
  }

  protected render() {
    const s = firstWeather(this.hass, this.config?.entity);
    if (!s) return html`<div class="missing muted">No weather</div>`;
    const a = s.attributes;
    const today = this._daily?.[0];
    const details = [
      today?.temperature !== undefined ? `H ${Math.round(today.temperature)}°` : undefined,
      today?.templow !== undefined ? `L ${Math.round(today.templow)}°` : undefined,
      typeof a.humidity === 'number' ? `Humidity ${Math.round(a.humidity)}%` : undefined,
      typeof a.wind_speed === 'number' ? `Wind ${Math.round(a.wind_speed)} ${a.wind_speed_unit ?? ''}`.trim() : undefined,
    ].filter(Boolean);

    return html`
      <div class="layout">
        <section class="now">
          <div class="condition-icon">${conditionIcon(s.state, 72)}</div>
          <div class="temp">${typeof a.temperature === 'number' ? Math.round(a.temperature) : '–'}<span class="unit">${this._unit()}</span></div>
          <div class="condition">${conditionLabel(this.hass, s)}</div>
          <div class="muted details">${details.join(' · ')}</div>
        </section>
        <section class="ahead">${this._renderHours()} ${this._renderDays()}</section>
      </div>
    `;
  }

  static styles = [
    pageStyles,
    glass,
    css`
      :host {
        padding-bottom: max(var(--lf-pad), 48px);
      }

      /* Inside a detail sheet, which has its own padding and title. */
      :host([embedded]) {
        height: 100%;
        padding: 0 0 24px;
      }

      .missing {
        display: grid;
        place-items: center;
        height: 100%;
        font-size: 22px;
      }

      .layout {
        display: flex;
        flex-direction: column;
        gap: 28px;
        min-height: 100%;
      }

      @media (orientation: landscape) {
        .layout {
          flex-direction: row;
          align-items: center;
          gap: clamp(24px, 5vw, 64px);
        }

        .now {
          flex: 1;
        }

        .ahead {
          flex: 1.3;
          min-width: 0;
        }
      }

      .now {
        text-align: center;
      }

      .condition-icon {
        min-height: 8px;
      }

      .temp {
        font-size: clamp(96px, 16vw, 180px);
        font-weight: 200;
        line-height: 1;
        letter-spacing: -0.04em;
        font-variant-numeric: tabular-nums;
      }

      .unit {
        font-size: 0.4em;
        vertical-align: top;
        margin-left: 4px;
      }

      .condition {
        margin-top: 8px;
        font-size: clamp(22px, 3vw, 30px);
        font-weight: 600;
      }

      .details {
        margin-top: 8px;
        font-size: 17px;
      }

      .ahead {
        display: flex;
        flex-direction: column;
        gap: var(--lf-gap);
      }

      ol {
        margin: 0;
        padding: 14px 18px;
        list-style: none;
        border-radius: var(--lf-radius);
      }

      .hours {
        display: flex;
        gap: 22px;
        overflow-x: auto;
        scrollbar-width: none;
      }

      .hours li {
        flex: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        font-size: 15px;
      }

      .days li {
        display: grid;
        grid-template-columns: 4.5em 32px 3em 2.5em 1fr 2.5em;
        align-items: center;
        gap: 10px;
        min-height: 44px;
        font-size: 17px;
      }

      .days li + li {
        border-top: 1px solid var(--lf-control-row);
      }

      .day {
        font-weight: 600;
      }

      .rain {
        font-size: 14px;
        color: #64d2ff;
      }

      .num {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .range {
        position: relative;
        height: 6px;
        border-radius: 3px;
        background: var(--lf-control);
      }

      .range span {
        position: absolute;
        top: 0;
        bottom: 0;
        border-radius: 3px;
        background: linear-gradient(90deg, #64d2ff, #ffd60a, #ff9f0a);
      }
    `,
  ];
}

define('luxframe-weather-page', LuxFrameWeatherPage);
