import { LitElement, css, html, svg } from 'lit';
import { define } from '../define';
import { glass, tileBase } from '../theme';
import { formatDate, formatTime, onMinute } from '../time';
import type { HomeAssistant, TileSize } from '../types';

/** Re-renders at the top of every minute while on screen. */
class MinuteTile extends LitElement {
  static properties = {
    hass: { attribute: false },
    size: { reflect: true },
  };

  declare hass?: HomeAssistant;
  declare size: TileSize;

  private _off?: () => void;

  constructor() {
    super();
    this.size = 's';
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._off = onMinute(() => this.requestUpdate());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._off?.();
  }
}

const TICKS = Array.from({ length: 12 }, (_, i) => i * 30);

/**
 * An analog clock drawn straight on the background, with no glass behind it.
 * The second hand is a CSS animation, so it costs no script per second.
 */
export class LuxFrameAnalogClockTile extends MinuteTile {
  protected render() {
    const now = new Date();
    const minutes = now.getMinutes() + now.getSeconds() / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    const secondsDelay = -(now.getSeconds() + now.getMilliseconds() / 1000);

    return html`
      <div class="tile" role="img" aria-label=${formatTime(this.hass, now)}>
        <svg viewBox="0 0 100 100">
          ${TICKS.map(
            (deg) => svg`<line x1="50" y1="6" x2="50" y2="15" transform="rotate(${deg} 50 50)"
              class="tick" />`,
          )}
          <line x1="50" y1="50" x2="50" y2="27" class="hour" transform="rotate(${hours * 30} 50 50)" />
          <line x1="50" y1="50" x2="50" y2="12" class="minute"
            transform="rotate(${minutes * 6} 50 50)" />
          <g class="second" style="animation-delay: ${secondsDelay}s">
            <line x1="50" y1="58" x2="50" y2="10" />
          </g>
          <circle cx="50" cy="50" r="2.4" class="pin" />
        </svg>
      </div>
    `;
  }

  static styles = [
    tileBase,
    css`
      .tile {
        display: grid;
        place-items: center;
        padding: 6px;
      }

      svg {
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        overflow: visible;
      }

      line {
        stroke: currentColor;
        stroke-linecap: round;
      }

      .tick {
        stroke-width: 2.6;
      }

      .hour {
        stroke-width: 4.5;
      }

      .minute {
        stroke-width: 3;
      }

      .second {
        transform-origin: 50px 50px;
        animation: sweep 60s linear infinite;
      }

      .second line {
        stroke: var(--lf-accent);
        stroke-width: 1.2;
      }

      .pin {
        fill: var(--lf-accent);
      }

      @keyframes sweep {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .second {
          display: none;
        }
      }
    `,
  ];
}

/** The time and date on glass. */
export class LuxFrameClockTile extends MinuteTile {
  protected render() {
    const now = new Date();
    const date =
      this.size === 's'
        ? formatDate(this.hass, now, { weekday: 'short', day: 'numeric' })
        : formatDate(this.hass, now);
    return html`
      <div class="tile glass">
        <div class="time">${formatTime(this.hass, now)}</div>
        <div class="muted">${date}</div>
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
      }

      .time {
        font-size: 38px;
        font-weight: 300;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
      }

      :host([size='m']) .time,
      :host([size='l']) .time {
        font-size: clamp(56px, 8vw, 110px);
        font-weight: 200;
      }

      .muted {
        font-size: 15px;
      }

      :host([size='m']) .muted,
      :host([size='l']) .muted {
        font-size: 20px;
      }
    `,
  ];
}

define('luxframe-analog-clock-tile', LuxFrameAnalogClockTile);
define('luxframe-clock-tile', LuxFrameClockTile);
