import { LitElement, css, html, nothing, svg } from 'lit';
import { define } from '../../define';
import { formatNumber } from '../../history';
import type { HomeAssistant } from '../../types';
import { brewNow, onBrew, type Brew, type Sample } from './brewlog';
import { clock } from './shared';

/**
 * The brew as it pours: the scale's weight over time, filling toward the
 * recipe's water (the dashed line), with each pour marked where it began and
 * the flow, in grams a second, as a thinner line over it. After a brew it
 * keeps showing that one until the next begins. A finger on it reads the
 * weight and flow at that moment.
 */

/** The shortest span the graph shows, so the first seconds aren't stretched across it. */
const MIN_SPAN_S = 30;
/** Flow is the weight gained over this long, which smooths the scale's steps. */
const FLOW_WINDOW_MS = 3000;

interface Point {
  /** Seconds since the brew began. */
  s: number;
  w: number;
  /** Grams a second. */
  flow: number;
}

function points(brew: Brew): Point[] {
  const out: Point[] = [];
  const samples = brew.samples;
  let j = 0;
  samples.forEach((p: Sample) => {
    while (j < samples.length - 1 && p.t - samples[j].t > FLOW_WINDOW_MS) j++;
    const back = samples[j];
    const dt = (p.t - back.t) / 1000;
    out.push({ s: (p.t - brew.start) / 1000, w: p.w, flow: dt > 0.5 ? Math.max(0, (p.w - back.w) / dt) : 0 });
  });
  return out;
}

export class LuxFrameXBloomGraph extends LitElement {
  static properties = {
    hass: { attribute: false },
    _at: { state: true },
  };

  declare hass?: HomeAssistant;
  /** Seconds into the brew under the finger. */
  declare _at?: number;

  private _off?: () => void;
  private _tick?: number;

  connectedCallback(): void {
    super.connectedCallback();
    this._off = onBrew(() => this.requestUpdate());
    // The time runs on between the scale's reports.
    this._tick = window.setInterval(() => brewNow()?.end === undefined && brewNow() && this.requestUpdate(), 1000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._off?.();
    window.clearInterval(this._tick);
  }

  private _scrub(e: PointerEvent, span: number): void {
    if (e.type === 'pointermove' && !e.buttons && e.pointerType !== 'mouse') return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this._at = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * span;
  }

  protected render() {
    const brew = brewNow();
    const live = brew && brew.end === undefined;
    const n = (v: number, like = '0.1') => formatNumber(this.hass, v, like);
    if (!brew || brew.samples.length < 1) {
      return html`<div class="box">
        <div class="head"><h2>Brew graph</h2></div>
        <div class="empty muted">The next brew’s weight and flow show here as it pours.</div>
      </div>`;
    }
    const pts = points(brew);
    const elapsed = ((brew.end ?? Date.now()) - brew.start) / 1000;
    const span = Math.max(MIN_SPAN_S, elapsed);
    const top = Math.max(10, brew.target ?? 0, ...pts.map((p) => p.w)) * 1.08;
    const flowTop = Math.max(4, ...pts.map((p) => p.flow)) * 1.25;
    const x = (s: number) => (s / span) * 100;
    const y = (w: number) => 100 - (w / top) * 100;
    const yf = (f: number) => 100 - (f / flowTop) * 100;
    // The weight holds between reports, so it's drawn in steps up to now.
    const end = live ? elapsed : (pts[pts.length - 1]?.s ?? 0);
    const path = (key: 'w' | 'flow', to: (v: number) => number) => {
      if (!pts.length) return '';
      let d = `M0 ${to(0).toFixed(2)} L${x(pts[0].s).toFixed(2)} ${to(0).toFixed(2)}`;
      for (const p of pts) d += ` L${x(p.s).toFixed(2)} ${to(p[key]).toFixed(2)}`;
      const lastV = key === 'w' ? pts[pts.length - 1].w : live ? 0 : pts[pts.length - 1].flow;
      d += ` L${x(end).toFixed(2)} ${to(lastV).toFixed(2)}`;
      return d;
    };
    const weightLine = path('w', y);
    const area = `${weightLine} L${x(end).toFixed(2)} 100 L0 100 Z`;
    const now = pts[pts.length - 1];
    const at = this._at !== undefined ? pts.reduce((best, p) => (Math.abs(p.s - this._at!) < Math.abs(best.s - this._at!) ? p : best), pts[0]) : undefined;
    const shown = at ?? now;
    return html`<div class="box">
      <div class="head">
        <h2>${live ? 'This brew' : 'Last brew'}</h2>
        ${brew.recipe && !['unknown', 'unavailable'].includes(brew.recipe) ? html`<span class="muted recipe">${brew.recipe}</span>` : nothing}
      </div>
      <div class="readings" aria-live="off">
        <div class="reading weight"><span class="label">Weight</span><strong>${n(shown?.w ?? 0)}<small>g</small></strong></div>
        <div class="reading flow"><span class="label">Flow</span><strong>${n(live && !at ? (now?.flow ?? 0) : (shown?.flow ?? 0))}<small>g/s</small></strong></div>
        <div class="reading"><span class="label">Time</span><strong>${clock(at ? at.s : elapsed)}</strong></div>
      </div>
      <div class="plot" data-no-swipe
        @pointerdown=${(e: PointerEvent) => this._scrub(e, span)}
        @pointermove=${(e: PointerEvent) => this._scrub(e, span)}
        @pointerleave=${() => (this._at = undefined)}
        @pointerup=${(e: PointerEvent) => e.pointerType !== 'mouse' && (this._at = undefined)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          ${brew.pours.map((p) => svg`<line class="pour" x1=${x((p.t - brew.start) / 1000)} x2=${x((p.t - brew.start) / 1000)} y1="0" y2="100" />`)}
          ${brew.target ? svg`<line class="target" x1="0" x2="100" y1=${y(brew.target)} y2=${y(brew.target)} />` : nothing}
          ${svg`<path class="area" d=${area} /><path class="line" d=${weightLine} /><path class="flow-line" d=${path('flow', yf)} />`}
          ${at ? svg`<line class="cursor" x1=${x(at.s)} x2=${x(at.s)} y1="0" y2="100" />` : nothing}
        </svg>
        ${brew.pours.map(
          (p) => html`<span class="pour-label" style="left: ${x((p.t - brew.start) / 1000)}%">${p.n}</span>`,
        )}
        ${brew.target
          ? html`<span class="target-label muted" style="top: ${y(brew.target)}%">${n(brew.target, '0')} g</span>`
          : nothing}
        ${at ? html`<div class="dot" style="left: ${x(at.s)}%; top: ${y(at.w)}%"></div>` : nothing}
      </div>
      <div class="times muted"><span>0:00</span><span>${clock(span)}</span></div>
    </div>`;
  }

  static styles = css`
    :host {
      --weight: var(--luxframe-xbloom-gold, #e8cd8f);
      --flow: var(--luxframe-xbloom-flow, #8fcfae);
      display: block;
      height: 100%;
      min-height: 0;
      color: var(--lf-text);
      font-family: var(--lf-font);
    }

    /* The queries below go by this box's height, not the host's. */
    .box {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      container-type: size;
    }

    .head {
      display: flex;
      align-items: baseline;
      gap: 12px;
      min-width: 0;
    }

    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      white-space: nowrap;
    }

    .recipe {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .muted {
      color: var(--lf-muted);
    }

    .readings {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 28px;
      margin: 12px 0 14px;
    }

    .reading {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .reading .label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--lf-muted);
    }

    /* A swatch of the line's color beside its name. */
    .reading.weight .label::before,
    .reading.flow .label::before {
      content: '';
      width: 10px;
      height: 3px;
      border-radius: 2px;
      background: var(--weight);
    }

    .reading.flow .label::before {
      background: var(--flow);
    }

    .reading strong {
      font-family: var(--luxframe-serif, 'Iowan Old Style', 'New York', ui-serif, 'Palatino Linotype', Palatino, Georgia, serif);
      font-size: 28px;
      font-weight: 400;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }

    .reading small {
      margin-left: 3px;
      font-family: var(--lf-font);
      font-size: 13px;
      opacity: 0.7;
    }

    .plot {
      position: relative;
      flex: 1;
      min-height: 40px;
      touch-action: pan-y;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .line,
    .flow-line {
      fill: none;
      stroke-linejoin: round;
      stroke-linecap: round;
      vector-effect: non-scaling-stroke;
    }

    .line {
      stroke: var(--weight);
      stroke-width: 3;
    }

    .area {
      fill: var(--weight);
      opacity: 0.16;
    }

    .flow-line {
      stroke: var(--flow);
      stroke-width: 2;
      opacity: 0.85;
    }

    .target,
    .pour,
    .cursor {
      vector-effect: non-scaling-stroke;
    }

    .target {
      stroke: var(--lf-muted);
      stroke-width: 1.5;
      stroke-dasharray: 5 5;
      opacity: 0.7;
    }

    .pour {
      stroke: var(--lf-faint);
      stroke-width: 1;
      stroke-dasharray: 2 4;
    }

    .cursor {
      stroke: var(--lf-text);
      stroke-width: 1;
      opacity: 0.5;
    }

    .pour-label {
      position: absolute;
      top: 0;
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      margin-left: 4px;
      border-radius: 50%;
      background: rgb(0 0 0 / 26%);
      color: var(--weight);
      font-size: 11px;
      font-weight: 700;
      pointer-events: none;
    }

    .target-label {
      position: absolute;
      right: 0;
      transform: translateY(-120%);
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      pointer-events: none;
    }

    .dot {
      position: absolute;
      width: 14px;
      height: 14px;
      margin: -7px 0 0 -7px;
      border-radius: 50%;
      background: var(--weight);
      box-shadow: 0 0 0 3px var(--lf-surface-strong, rgb(0 0 0 / 40%));
      pointer-events: none;
    }

    .times {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }

    .empty {
      display: grid;
      place-items: center;
      flex: 1;
      padding: 16px;
      text-align: center;
      font-size: 16px;
      line-height: 1.45;
    }

    /* Last, so they win over the rules above. A short card: the readings in a smaller row, so the plot keeps room. */
    @container (max-height: 300px) {
      .head h2 {
        font-size: 17px;
      }

      .readings {
        margin: 6px 0 8px;
        gap: 4px 20px;
      }

      .reading strong {
        font-size: 20px;
      }

      .reading .label {
        font-size: 11px;
      }

      .times {
        margin-top: 4px;
      }
    }

    /* Very short: the weight and the plot alone. */
    @container (max-height: 200px) {
      .head,
      .reading:not(.weight) {
        display: none;
      }

      .readings {
        margin-top: 0;
      }
    }
  `;
}

define('luxframe-xbloom-graph', LuxFrameXBloomGraph);
