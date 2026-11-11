import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import '../chart';
import { define } from '../define';
import { changedAgo, stateLabel } from '../entity';
import { fetchChanges, fetchSeries, formatNumber, isNumeric, type Change, type Point } from '../history';
import { formatClock } from '../time';
import type { HassEntity, HomeAssistant } from '../types';
import { detailStyles } from './styles';

const RANGES = [
  { hours: 6, label: '6 hours' },
  { hours: 24, label: '24 hours' },
  { hours: 24 * 7, label: '7 days' },
];

/** Colors a graph takes by what it measures; the accent for the rest. */
export function measureColor(stateObj: HassEntity | undefined): string {
  switch (stateObj?.attributes.device_class) {
    case 'humidity':
    case 'moisture':
    case 'precipitation':
      return 'var(--lf-color-cover)';
    case 'power':
    case 'energy':
    case 'current':
    case 'voltage':
    case 'illuminance':
      return 'var(--lf-color-light)';
    case 'carbon_dioxide':
    case 'pm25':
    case 'pm10':
    case 'aqi':
    case 'volatile_organic_compounds':
      return 'var(--lf-color-switch)';
    case 'battery':
      return 'var(--lf-color-switch)';
    default:
      return 'var(--lf-accent)';
  }
}

/**
 * A sensor in full. A number: its value, a graph of the last 6 hours, day or
 * week with a finger reading any moment, and the range's low, average and
 * high. Anything else (open or closed, a text state): when it changed.
 */
export class LuxFrameSensorDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
    _hours: { state: true },
    _points: { state: true },
    _changes: { state: true },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;
  declare _hours: number;
  declare _points?: Point[];
  declare _changes?: Change[];

  private _loaded = '';

  constructor() {
    super();
    this._hours = 24;
  }

  protected willUpdate(changed: PropertyValues): void {
    const s = this.stateObj;
    if (!s || !this.hass) return;
    // Reload on a new range or entity, and every few minutes as values arrive.
    const key = `${s.entity_id}|${this._hours}|${Math.floor(Date.now() / 300_000)}`;
    if (key === this._loaded && !changed.has('_hours')) return;
    this._loaded = key;
    if (isNumeric(s)) {
      void fetchSeries(this.hass, s, this._hours).then((points) => (this._points = points));
    } else {
      void fetchChanges(this.hass, s.entity_id, this._hours).then((changes) => (this._changes = changes));
    }
  }

  private _renderStats(points: Point[], unit: string, like: string) {
    if (points.length < 2) return nothing;
    const values = points.map((p) => p.v);
    const fmt = (v: number) => `${formatNumber(this.hass, v, like)}${unit ? ` ${unit}` : ''}`;
    const stats = [
      { label: 'Low', value: Math.min(...values) },
      { label: 'Average', value: values.reduce((a, b) => a + b, 0) / values.length },
      { label: 'High', value: Math.max(...values) },
    ];
    return html`<div class="stats">
      ${stats.map((s) => html`<div class="stat glass"><span class="muted">${s.label}</span><strong>${fmt(s.value)}</strong></div>`)}
    </div>`;
  }

  private _renderChanges(s: HassEntity) {
    const changes = [...(this._changes ?? [])].reverse().slice(0, 50);
    if (!this._changes) return html`<div class="panel glass muted empty">Loading…</div>`;
    if (!changes.length) return html`<div class="panel glass muted empty">No changes in this time</div>`;
    const lang = this.hass?.locale?.language;
    return html`<ol class="panel glass changes" data-no-swipe>
      ${changes.map((c, i) => {
        const until = i === 0 ? Date.now() : changes[i - 1].t;
        const minutes = Math.round((until - c.t) / 60_000);
        const lasted = minutes < 60 ? `${minutes} min` : `${Math.round((minutes / 60) * 10) / 10} h`;
        const when = new Date(c.t);
        return html`<li>
          <span class="state">${stateLabel(this.hass, { ...s, state: c.state })}</span>
          <span class="muted">${when.toLocaleDateString(lang, { weekday: 'short' })} ${formatClock(this.hass, when)}</span>
          <span class="muted lasted">${i === 0 ? 'now' : lasted}</span>
        </li>`;
      })}
    </ol>`;
  }

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const ago = changedAgo(this.hass, s.last_changed);
    const numeric = isNumeric(s);
    const unit = s.attributes.unit_of_measurement ?? '';

    return html`
      <div class="status" aria-live="polite">
        ${stateLabel(this.hass, s)}
        ${ago ? html`<span class="muted">· changed ${ago}</span>` : nothing}
      </div>
      <div class="row" role="group" aria-label="Show the last">
        ${RANGES.map(
          (r) => html`<button class="chip ${this._hours === r.hours ? 'on' : ''}" aria-pressed=${this._hours === r.hours}
            @click=${() => (this._hours = r.hours)}>${r.label}</button>`,
        )}
      </div>
      ${numeric
        ? html`<div class="panel glass graph">
              <luxframe-chart detailed .hass=${this.hass} .points=${this._points} unit=${unit}
                style="--chart-color: ${measureColor(s)}"></luxframe-chart>
            </div>
            ${this._renderStats(this._points ?? [], unit, s.state)}`
        : this._renderChanges(s)}
    `;
  }

  static styles = [
    detailStyles,
    css`
      :host {
        justify-content: flex-start;
      }

      .panel {
        box-sizing: border-box;
        width: min(920px, 100%);
        border-radius: var(--lf-radius);
      }

      .graph {
        display: flex;
        height: min(44vh, 380px);
        padding: 56px 24px 18px;
      }

      luxframe-chart {
        flex: 1;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--lf-gap, 12px);
        width: min(920px, 100%);
      }

      .stat {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 14px 18px;
        border-radius: var(--lf-radius-s);
        font-size: 15px;
      }

      .stat strong {
        font-size: 24px;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
      }

      .empty {
        padding: 32px;
        text-align: center;
        font-size: 17px;
      }

      .changes {
        max-height: 52vh;
        margin: 0;
        padding: 6px 20px;
        overflow-y: auto;
        list-style: none;
      }

      .changes li {
        display: grid;
        grid-template-columns: 1fr auto 5em;
        align-items: center;
        gap: 16px;
        min-height: 52px;
        font-size: 17px;
        font-variant-numeric: tabular-nums;
      }

      .changes li + li {
        border-top: 1px solid var(--lf-control-row);
      }

      .state {
        font-weight: 600;
      }

      .lasted {
        text-align: right;
      }
    `,
  ];
}

define('luxframe-sensor-detail', LuxFrameSensorDetail);
