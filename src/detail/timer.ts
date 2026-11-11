import { LitElement, css, html, nothing, svg } from 'lit';
import { define } from '../define';
import { icon } from '../icons';
import type { HassEntity, HomeAssistant } from '../types';
import { detailStyles } from './styles';

/** "0:05:00" → 300. */
export function parseDuration(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const parts = value.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

/** 300 → "5:00", 3725 → "1:02:05". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

/** 300 → "00:05:00", as Home Assistant takes a duration. */
const asDuration = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), Math.round(seconds % 60)]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');

/** Seconds left on a timer, and of how many. */
export function timerLeft(s: HassEntity): { left: number; total: number } {
  const total = parseDuration(s.attributes.duration);
  if (s.state === 'active' && s.attributes.finishes_at) {
    return { left: Math.max(0, (Date.parse(s.attributes.finishes_at) - Date.now()) / 1000), total };
  }
  if (s.state === 'active' || s.state === 'paused') return { left: parseDuration(s.attributes.remaining), total };
  return { left: total, total };
}

/** The countdown ring: the time left as an arc that empties clockwise. */
export function timerRing(fraction: number, active: boolean) {
  const r = 46;
  const around = 2 * Math.PI * r;
  return html`<svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
    ${svg`<circle class="track" cx="50" cy="50" r=${r} />
    <circle class="left ${active ? 'running' : ''}" cx="50" cy="50" r=${r}
      stroke-dasharray=${around} stroke-dashoffset=${around * (1 - Math.max(0, Math.min(1, fraction)))}
      transform="rotate(-90 50 50)" />`}
  </svg>`;
}

export const ringStyles = css`
  .ring {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .ring circle {
    fill: none;
    stroke-width: 6;
    stroke-linecap: round;
  }

  .ring .track {
    stroke: var(--lf-control);
  }

  .ring .left {
    stroke: var(--lf-faint);
    transition: stroke-dashoffset 1s linear;
  }

  .ring .left.running {
    stroke: var(--lf-accent);
  }
`;

const PRESETS = [1, 3, 5, 10, 15, 30, 60];

/**
 * A timer in full: a large ring counting down. Idle, choose how long and
 * start; running, pause, add a minute, finish now or cancel.
 */
export class LuxFrameTimerDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
    _minutes: { state: true },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;
  /** The length chosen to start with; the timer's own when unset. */
  declare _minutes?: number;

  private _tick?: number;

  connectedCallback(): void {
    super.connectedCallback();
    this._tick = window.setInterval(() => {
      if (this.stateObj?.state === 'active') this.requestUpdate();
    }, 1000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._tick);
  }

  private _call(service: string, data: Record<string, unknown> = {}): void {
    this.hass?.callService('timer', service, { entity_id: this.stateObj!.entity_id, ...data });
  }

  private _start(): void {
    this._call('start', this._minutes ? { duration: asDuration(this._minutes * 60) } : {});
    this._minutes = undefined;
  }

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const { left, total } = timerLeft(s);
    const active = s.state === 'active';
    const idle = s.state === 'idle';
    const shownTotal = idle && this._minutes ? this._minutes * 60 : total;
    const shownLeft = idle && this._minutes ? shownTotal : left;
    const unavailable = s.state === 'unavailable';
    const status = active ? 'Running' : s.state === 'paused' ? 'Paused' : unavailable ? 'Unavailable' : 'Ready';

    return html`
      <div class="status" aria-live="polite">${status}</div>
      <div class="layout">
        <div class="dial" role="timer" aria-label="${formatDuration(shownLeft)} left">
          ${timerRing(shownTotal ? shownLeft / shownTotal : 0, active)}
          <div class="inside">
            <span class="left">${formatDuration(shownLeft)}</span>
            <span class="muted">of ${formatDuration(shownTotal)}</span>
          </div>
        </div>
        <div class="side">
          ${idle
            ? html`<div class="row presets" role="group" aria-label="How long">
                  ${PRESETS.map((m) => {
                    const on = (this._minutes ?? total / 60) === m;
                    return html`<button class="chip ${on ? 'on' : ''}" aria-pressed=${on}
                      @click=${() => (this._minutes = m)}>${m < 60 ? `${m} min` : '1 hour'}</button>`;
                  })}
                </div>
                <button class="pill on" ?disabled=${unavailable || !shownTotal} @click=${this._start}>
                  ${icon('play', 22)} Start
                </button>`
            : html`<div class="row">
                  <button class="pill on" @click=${() => this._call(active ? 'pause' : 'start')}>
                    ${icon(active ? 'pause' : 'play', 22)} ${active ? 'Pause' : 'Resume'}
                  </button>
                </div>
                <div class="row">
                  ${active
                    ? html`<button class="chip" @click=${() => this._call('start', { duration: asDuration(left + 60) })}>
                        + 1 min
                      </button>`
                    : nothing}
                  <button class="chip" @click=${() => this._call('finish')}>Finish now</button>
                  <button class="chip" @click=${() => this._call('cancel')}>Cancel</button>
                </div>`}
        </div>
      </div>
    `;
  }

  static styles = [
    detailStyles,
    ringStyles,
    css`
      .dial {
        position: relative;
        width: min(44vh, 340px, 80vw);
        aspect-ratio: 1;
      }

      .inside {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }

      .left {
        font-size: clamp(48px, 9vh, 80px);
        font-weight: 200;
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.02em;
      }

      .inside .muted {
        font-size: 17px;
      }

      .presets {
        max-width: 360px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }
    `,
  ];
}

define('luxframe-timer-detail', LuxFrameTimerDetail);
