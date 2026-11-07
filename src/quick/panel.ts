import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { icon } from '../icons';
import '../now-playing';
import { MIN_BRIGHTNESS } from '../screen';
import type { HomeAssistant, QuickPanelConfig } from '../types';

const CLOSE_DISTANCE = 80;
const CLOSE_MS = 200;
const MAX_PINNED = 4;
const CONTROLS = 'button, luxframe-slider, luxframe-tile, [data-no-swipe]';

/**
 * The panel pulled down from the top edge: what's playing and its volume, the
 * screen's brightness, a few pinned tiles, and a way into Assist.
 *
 * The frame drives the pull with `offset` (px still hidden above the top) and
 * sets `offset` to 0 once open. Swiping it back up, tapping below it or
 * Escape fires `close`. Also fires `brightness` (detail: 10–100) and `ask`.
 */
export class LuxFrameQuickPanel extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    brightness: { type: Number },
    assist: { type: Boolean },
    offset: { type: Number },
    _dy: { state: true },
    _closing: { state: true },
    _drop: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: QuickPanelConfig;
  declare brightness: number;
  declare assist: boolean;
  /** How far the panel still sits above its open position, while being pulled. */
  declare offset: number;
  declare _dy: number;
  declare _closing: boolean;
  /** Opened by a tap rather than pulled: it drops in by itself. */
  declare _drop: boolean;

  private _swipe?: { y: number; id: number; active: boolean };

  constructor() {
    super();
    this.brightness = 100;
    this.assist = true;
    this.offset = 0;
    this._dy = 0;
    this._closing = false;
    this._drop = false;
  }

  protected willUpdate(): void {
    if (!this.hasUpdated) this._drop = this.offset === 0;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', this._onKey);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('keydown', this._onKey);
  }

  close(): void {
    if (this._closing) return;
    this._closing = true;
    window.setTimeout(() => this.dispatchEvent(new CustomEvent('close')), CLOSE_MS);
  }

  private _onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close();
    }
  };

  // Swipe up anywhere but a control to put it away.
  private _down(e: PointerEvent): void {
    if (e.button !== 0) return;
    const onControl = e
      .composedPath()
      .some((el) => el instanceof Element && el !== this && el.matches(CONTROLS));
    if (!onControl) this._swipe = { y: e.clientY, id: e.pointerId, active: false };
  }

  private _move(e: PointerEvent): void {
    const swipe = this._swipe;
    if (!swipe) return;
    const dy = Math.min(0, e.clientY - swipe.y);
    if (!swipe.active && dy < -8) {
      swipe.active = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(swipe.id);
      } catch {
        // Pointer already gone.
      }
    }
    if (swipe.active) this._dy = dy;
  }

  private _up(): void {
    if (!this._swipe) return;
    this._swipe = undefined;
    if (this._dy < -CLOSE_DISTANCE) this.close();
    else this._dy = 0;
  }

  private _renderMedia() {
    return html`<luxframe-now-playing class="card media" .hass=${this.hass} .entity=${this.config?.media_player}>
    </luxframe-now-playing>`;
  }

  private _renderSide() {
    const pinned = (this.config?.pinned ?? []).slice(0, MAX_PINNED);
    const brightness = this.brightness;
    return html`
      <div class="side">
        <div class="card">
          <div class="labelled">
            ${icon('sun', 22)}
            <luxframe-slider
              filled
              label="Screen brightness"
              .min=${MIN_BRIGHTNESS}
              .value=${brightness}
              .valueText=${`${brightness}%`}
              @input=${(e: CustomEvent<number>) => this._fire('brightness', e.detail)}
              @change=${(e: CustomEvent<number>) => this._fire('brightness', e.detail)}
            ></luxframe-slider>
          </div>
        </div>
        ${pinned.length
          ? html`<div class="pinned" style="--count: ${pinned.length}">
              ${pinned.map(
                (entity) => html`<luxframe-tile .hass=${this.hass} .entity=${entity} subtitle="state">
                </luxframe-tile>`,
              )}
            </div>`
          : nothing}
        ${this.assist
          ? html`<button class="ask" @click=${() => this._fire('ask')}>
              ${icon('ask', 22)} Ask Home Assistant
            </button>`
          : nothing}
      </div>
    `;
  }

  private _fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  protected render() {
    const dragging = this.offset > 0 || this._swipe?.active;
    const shift = this._closing ? -100 : 0;
    const style = this._closing
      ? `transform: translateY(${shift}%)`
      : `transform: translateY(${-this.offset + this._dy}px)`;
    return html`
      <div class="backdrop ${this._closing ? 'closing' : ''}" @click=${this.close}></div>
      <section
        class="panel ${dragging ? 'dragging' : ''} ${this._drop ? 'drop' : ''}"
        style=${style}
        role="dialog"
        aria-label="Quick controls"
        @pointerdown=${this._down}
        @pointermove=${this._move}
        @pointerup=${this._up}
        @pointercancel=${this._up}
      >
        <div class="content">${this._renderMedia()} ${this._renderSide()}</div>
        <button class="grabber" aria-label="Close quick controls" @click=${this.close}></button>
      </section>
    `;
  }

  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      z-index: 8;
      color: var(--lf-text);
      font-family: var(--lf-font);
    }

    .backdrop {
      position: absolute;
      inset: 0;
      background: rgb(0 0 0 / 22%);
      animation: fade 200ms ease-out;
      transition: opacity 200ms;
    }

    .backdrop.closing {
      opacity: 0;
    }

    .panel {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      max-height: 92%;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      padding: var(--lf-pad) var(--lf-pad) 10px;
      overflow-y: auto;
      border-radius: 0 0 calc(var(--lf-radius) + 10px) calc(var(--lf-radius) + 10px);
      background: var(--lf-sheet);
      -webkit-backdrop-filter: var(--lf-blur-strong);
      backdrop-filter: var(--lf-blur-strong);
      box-shadow: 0 20px 50px rgb(0 0 0 / 30%);
      transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
      touch-action: pan-x;
    }

    .panel.dragging {
      transition: none;
    }

    .panel.drop {
      animation: drop 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    @keyframes drop {
      from {
        transform: translateY(-100%);
      }
    }

    .content {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--lf-gap);
    }

    @media (orientation: landscape) {
      .content {
        grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
      }
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 18px;
      border-radius: var(--lf-radius);
      background: rgb(255 255 255 / 10%);
    }








    .muted {
      color: var(--lf-muted);
    }


    button {
      font: inherit;
      color: inherit;
      border: 0;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    button:disabled {
      opacity: 0.35;
      cursor: default;
    }

    button:focus-visible {
      outline: 3px solid var(--lf-accent);
      outline-offset: 2px;
    }



    .labelled {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--lf-muted);
    }

    .labelled luxframe-slider {
      flex: 1;
      --slider-fill: var(--lf-surface-active);
    }

    .side {
      display: flex;
      flex-direction: column;
      gap: var(--lf-gap);
    }

    .pinned {
      display: grid;
      grid-template-columns: repeat(var(--count), minmax(0, 1fr));
      gap: var(--lf-gap);
    }

    .pinned luxframe-tile {
      --mdc-icon-size: 28px;
    }

    .ask {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 56px;
      border-radius: 999px;
      font-size: 17px;
      font-weight: 600;
      background: rgb(255 255 255 / 14%);
    }

    .grabber {
      align-self: center;
      width: 64px;
      height: 22px;
      margin-top: 8px;
      padding: 0;
      background: none;
      position: relative;
    }

    .grabber::after {
      content: '';
      position: absolute;
      left: 10px;
      right: 10px;
      top: 8px;
      height: 5px;
      border-radius: 3px;
      background: var(--lf-faint);
    }

    @keyframes fade {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .panel,
      .backdrop {
        transition: none;
        animation: none;
      }
    }
  `;
}

define('luxframe-quick-panel', LuxFrameQuickPanel);
