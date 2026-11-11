import { LitElement, css, html, nothing, svg } from 'lit';
import { define } from './define';
import { formatNumber, type Point } from './history';
import { formatClock } from './time';
import type { HomeAssistant } from './types';

/**
 * A line over a soft fill: a sensor's recent past. Bare, it sits behind a
 * tile's value. `detailed` adds the low and high at the side, the start and
 * end times underneath, and a finger on it reads the value at that moment.
 */
export class LuxFrameChart extends LitElement {
  static properties = {
    hass: { attribute: false },
    points: { attribute: false },
    unit: {},
    detailed: { type: Boolean, reflect: true },
    _at: { state: true },
  };

  declare hass?: HomeAssistant;
  declare points?: Point[];
  declare unit?: string;
  declare detailed: boolean;
  /** The point under the finger. */
  declare _at?: number;

  constructor() {
    super();
    this.detailed = false;
  }

  private _range(points: Point[]) {
    const values = points.map((p) => p.v);
    let min = Math.min(...values);
    let max = Math.max(...values);
    // A flat line sits in the middle, not along the bottom.
    if (max - min < 1e-9) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * 0.12;
    return { min, max, lo: min - pad, hi: max + pad, t0: points[0].t, t1: points[points.length - 1].t };
  }

  private _scrub(e: PointerEvent): void {
    const points = this.points ?? [];
    if (!this.detailed || points.length < 2 || (e.type === 'pointermove' && !e.buttons && e.pointerType !== 'mouse')) return;
    const box = this.getBoundingClientRect();
    const { t0, t1 } = this._range(points);
    const t = t0 + ((e.clientX - box.left) / box.width) * (t1 - t0);
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.t - t) < Math.abs(points[best].t - t)) best = i;
    });
    this._at = best;
  }

  protected render() {
    const points = this.points ?? [];
    if (points.length < 2) {
      return this.detailed ? html`<div class="empty muted">No history yet</div>` : nothing;
    }
    const { min, max, lo, hi, t0, t1 } = this._range(points);
    const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * 100;
    const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(2)} ${y(p.v).toFixed(2)}`).join(' ');
    const area = `${line} L100 100 L0 100 Z`;
    const at = this._at !== undefined ? points[this._at] : undefined;
    const fmt = (v: number) => `${formatNumber(this.hass, v)}${this.unit ? ` ${this.unit}` : ''}`;

    return html`
      <div class="plot"
        @pointerdown=${this._scrub}
        @pointermove=${this._scrub}
        @pointerleave=${() => (this._at = undefined)}
        @pointerup=${(e: PointerEvent) => e.pointerType !== 'mouse' && (this._at = undefined)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          ${svg`<path class="area" d=${area} /><path class="line" d=${line} />`}
          ${at ? svg`<line class="cursor" x1=${x(at.t)} x2=${x(at.t)} y1="0" y2="100" />` : nothing}
        </svg>
        ${at
          ? html`<div class="dot" style="left: ${x(at.t)}%; top: ${y(at.v)}%"></div>
              <div class="reading" style="left: clamp(60px, ${x(at.t)}%, calc(100% - 60px))">
                <strong>${fmt(at.v)}</strong>
                <span class="muted">${new Date(at.t).toLocaleDateString(this.hass?.locale?.language, { weekday: 'short' })}
                  ${formatClock(this.hass, new Date(at.t))}</span>
              </div>`
          : nothing}
        ${this.detailed
          ? html`<span class="edge high muted">${fmt(max)}</span><span class="edge low muted">${fmt(min)}</span>`
          : nothing}
      </div>
      ${this.detailed
        ? html`<div class="times muted">
            <span>${this._when(t0)}</span><span>Now</span>
          </div>`
        : nothing}
    `;
  }

  private _when(t: number): string {
    const d = new Date(t);
    const hours = (Date.now() - t) / 3600_000;
    if (hours > 26) return d.toLocaleDateString(this.hass?.locale?.language, { weekday: 'short', day: 'numeric' });
    return formatClock(this.hass, d);
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      color: var(--chart-color, var(--lf-accent));
    }

    .plot {
      position: relative;
      flex: 1;
      min-height: 0;
      touch-action: pan-y;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .line {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
      vector-effect: non-scaling-stroke;
    }

    .area {
      fill: currentColor;
      opacity: 0.16;
    }

    :host([detailed]) .line {
      stroke-width: 3;
    }

    .cursor {
      stroke: var(--lf-text);
      stroke-width: 1;
      opacity: 0.5;
      vector-effect: non-scaling-stroke;
    }

    .dot {
      position: absolute;
      width: 14px;
      height: 14px;
      margin: -7px 0 0 -7px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 0 3px var(--lf-surface-strong, rgb(0 0 0 / 40%));
      pointer-events: none;
    }

    .reading {
      position: absolute;
      top: -8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      transform: translate(-50%, -100%);
      padding: 6px 12px;
      border-radius: 12px;
      color: var(--lf-text);
      background: var(--lf-control);
      font-size: 15px;
      white-space: nowrap;
      pointer-events: none;
    }

    .reading strong {
      font-size: 17px;
      font-variant-numeric: tabular-nums;
    }

    .edge {
      position: absolute;
      right: 0;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      pointer-events: none;
    }

    .high {
      top: 0;
    }

    .low {
      bottom: 0;
    }

    .times {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      font-size: 13px;
    }

    .muted {
      color: var(--lf-muted);
    }

    .empty {
      display: grid;
      place-items: center;
      flex: 1;
      font-size: 17px;
    }
  `;
}

define('luxframe-chart', LuxFrameChart);
