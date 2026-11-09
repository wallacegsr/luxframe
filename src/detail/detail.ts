import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { domainOf, resolve } from '../entity';
import type { HassEntity, HomeAssistant } from '../types';

const CLOSE_DISTANCE = 120;
const CLOSE_MS = 180;
// A swipe that starts on one of these belongs to the control, not the sheet.
const CONTROLS = 'button, luxframe-slider, luxframe-confirm-button, [data-no-swipe]';

/** The controls for an entity's kind: a light's brightness and color, a lock's button. */
export function renderEntityView(hass: HomeAssistant | undefined, stateObj: HassEntity | undefined) {
  if (!stateObj) return html`<div class="missing">This device isn't in Home Assistant anymore.</div>`;
  switch (domainOf(stateObj.entity_id)) {
    case 'light':
      return html`<luxframe-light-detail .hass=${hass} .stateObj=${stateObj}></luxframe-light-detail>`;
    case 'fan':
      return html`<luxframe-fan-detail .hass=${hass} .stateObj=${stateObj}></luxframe-fan-detail>`;
    case 'cover':
      return html`<luxframe-cover-detail .hass=${hass} .stateObj=${stateObj}></luxframe-cover-detail>`;
    case 'climate':
      return html`<luxframe-climate-detail .hass=${hass} .stateObj=${stateObj}></luxframe-climate-detail>`;
    case 'lock':
      return html`<luxframe-lock-detail .hass=${hass} .stateObj=${stateObj}></luxframe-lock-detail>`;
    case 'media_player':
      return html`<luxframe-media-detail .hass=${hass} .stateObj=${stateObj}></luxframe-media-detail>`;
    default:
      return html`<luxframe-generic-detail .hass=${hass} .stateObj=${stateObj}></luxframe-generic-detail>`;
  }
}

/**
 * The full-screen detail view LuxFrame opens over its pages. It blurs the
 * page behind, shows the entity's name and area, and the view for its kind.
 * Close with ✕, Escape, or by swiping down. ⋯ hands over to Home Assistant's
 * own dialog for settings LuxFrame doesn't show.
 *
 * Fires `close`, and `more` with the entity id.
 */
export class LuxFrameDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    entityId: { attribute: false },
    _dy: { state: true },
    _closing: { state: true },
  };

  declare hass?: HomeAssistant;
  declare entityId?: string;
  declare _dy: number;
  declare _closing: boolean;

  private _swipe?: { y: number; id: number; active: boolean };
  private _returnFocus?: Element | null;

  constructor() {
    super();
    this._dy = 0;
    this._closing = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._returnFocus = document.activeElement;
    this.addEventListener('keydown', this._onKey);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('keydown', this._onKey);
    (this._returnFocus as HTMLElement | null)?.focus?.();
  }

  protected firstUpdated(): void {
    (this.renderRoot.querySelector('.close') as HTMLElement | null)?.focus();
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
    const dy = Math.max(0, e.clientY - swipe.y);
    if (!swipe.active && dy > 8) {
      swipe.active = true;
      (e.currentTarget as HTMLElement).setPointerCapture(swipe.id);
    }
    if (swipe.active) this._dy = dy;
  }

  private _up(): void {
    if (!this._swipe) return;
    this._swipe = undefined;
    if (this._dy > CLOSE_DISTANCE) this.close();
    else this._dy = 0;
  }

  private _renderView() {
    return renderEntityView(this.hass, this.entityId ? this.hass?.states[this.entityId] : undefined);
  }

  protected render() {
    if (!this.entityId) return nothing;
    const { name, area } = resolve(this.hass, this.entityId);
    const dragging = this._swipe?.active;

    return html`
      <div class="backdrop ${this._closing ? 'closing' : ''}"></div>
      <div
        class="sheet ${this._closing ? 'closing' : ''} ${dragging ? 'dragging' : ''}"
        style="transform: translateY(${this._dy}px)"
        role="dialog"
        aria-modal="true"
        aria-label=${name}
        @pointerdown=${this._down}
        @pointermove=${this._move}
        @pointerup=${this._up}
        @pointercancel=${this._up}
      >
        <header>
          <button class="round close" aria-label="Close" @click=${this.close}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4"
                stroke-linecap="round" />
            </svg>
          </button>
          <div class="titles">
            <h2>${name}</h2>
            ${area ? html`<div class="area">${area}</div>` : nothing}
          </div>
          <button
            class="round more"
            aria-label="More settings in Home Assistant"
            @click=${() =>
              this.dispatchEvent(new CustomEvent('more', { detail: { entityId: this.entityId } }))}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <circle cx="5" cy="12" r="2" fill="currentColor" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
              <circle cx="19" cy="12" r="2" fill="currentColor" />
            </svg>
          </button>
        </header>
        <main class=${domainOf(this.entityId) === 'media_player' ? 'fill' : ''}>${this._renderView()}</main>
        <div class="grabber" aria-hidden="true"></div>
      </div>
    `;
  }

  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      z-index: 10;
      color: var(--lf-text);
      font-family: var(--lf-font);
    }

    .backdrop {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, var(--lf-tint, #000) 30%, rgb(0 0 0 / 38%));
      -webkit-backdrop-filter: var(--lf-blur-strong);
      backdrop-filter: var(--lf-blur-strong);
      animation: fade 200ms ease-out;
    }

    .sheet {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      padding: var(--lf-pad);
      padding-top: max(16px, calc(var(--lf-pad) / 2));
      overflow-y: auto;
      transition: transform 220ms ease-out, opacity 180ms;
      animation: rise 220ms ease-out;
      touch-action: pan-x;
    }

    .sheet.dragging {
      transition: none;
    }

    .closing.backdrop {
      opacity: 0;
      transition: opacity 180ms;
    }

    .closing.sheet {
      opacity: 0;
      transform: translateY(40px) !important;
    }

    header {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .titles {
      flex: 1;
      min-width: 0;
      text-align: center;
    }

    h2 {
      margin: 0;
      font-size: clamp(24px, 3.2vw, 32px);
      font-weight: 600;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .area {
      margin-top: 2px;
      font-size: 17px;
      color: var(--lf-muted);
    }

    .round {
      flex: none;
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      color: var(--lf-text);
      background: var(--lf-surface);
      -webkit-backdrop-filter: var(--lf-blur);
      backdrop-filter: var(--lf-blur);
      box-shadow: var(--lf-shadow);
      cursor: pointer;
    }

    .round:focus-visible {
      outline: 3px solid var(--lf-accent);
      outline-offset: 2px;
    }

    main {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px 0;
    }

    /* A speaker fills the sheet: its lists scroll inside it. */
    main.fill {
      align-items: stretch;
      min-height: 0;
      padding-bottom: 0;
    }

    .missing {
      font-size: 18px;
      color: var(--lf-muted);
    }

    .grabber {
      align-self: center;
      width: 44px;
      height: 5px;
      margin-top: 4px;
      border-radius: 3px;
      background: var(--lf-faint);
    }

    @keyframes fade {
      from {
        opacity: 0;
      }
    }

    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(32px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .sheet,
      .backdrop {
        animation: none;
        transition: none;
      }
    }
  `;
}

define('luxframe-detail', LuxFrameDetail);
