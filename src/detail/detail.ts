import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { domainOf, resolve, type DetailView } from '../entity';
import { controls } from '../theme';
import type { HassEntity, HomeAssistant } from '../types';
import { renderWidgetView } from './views';

const CLOSE_DISTANCE = 120;
const CLOSE_MS = 180;
// A swipe that starts on one of these belongs to the control, not the sheet.
const CONTROLS = 'button, input, luxframe-slider, luxframe-chart, luxframe-confirm-button, [data-no-swipe]';

/** Views that fill the sheet and scroll inside it, rather than centering. */
const FILLS = new Set(['media_player', 'camera', 'weather', 'calendar', 'todo']);

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
    case 'sensor':
    case 'binary_sensor':
      return html`<luxframe-sensor-detail .hass=${hass} .stateObj=${stateObj}></luxframe-sensor-detail>`;
    case 'alarm_control_panel':
      return html`<luxframe-alarm-detail .hass=${hass} .stateObj=${stateObj}></luxframe-alarm-detail>`;
    case 'timer':
      return html`<luxframe-timer-detail .hass=${hass} .stateObj=${stateObj}></luxframe-timer-detail>`;
    case 'vacuum':
      return html`<luxframe-vacuum-detail .hass=${hass} .stateObj=${stateObj}></luxframe-vacuum-detail>`;
    case 'person':
    case 'device_tracker':
      return html`<luxframe-person-detail .hass=${hass} .stateObj=${stateObj}></luxframe-person-detail>`;
    case 'input_number':
    case 'number':
      return html`<luxframe-number-detail .hass=${hass} .stateObj=${stateObj}></luxframe-number-detail>`;
    case 'input_select':
    case 'select':
      return html`<luxframe-select-detail .hass=${hass} .stateObj=${stateObj}></luxframe-select-detail>`;
    case 'camera':
      return html`<luxframe-camera-detail .hass=${hass} .stateObj=${stateObj}></luxframe-camera-detail>`;
    case 'weather':
      return html`<luxframe-weather-page embedded .hass=${hass} .config=${{ type: 'weather', entity: stateObj.entity_id }}></luxframe-weather-page>`;
    case 'calendar':
      return html`<luxframe-calendar-page embedded .hass=${hass} .config=${{ type: 'calendar', entities: [stateObj.entity_id] }}></luxframe-calendar-page>`;
    case 'sun':
      return html`<luxframe-sun-detail .hass=${hass} .stateObj=${stateObj}></luxframe-sun-detail>`;
    case 'todo':
      return html`<luxframe-todo-detail .hass=${hass} .stateObj=${stateObj}></luxframe-todo-detail>`;
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
    view: { attribute: false },
    _dy: { state: true },
    _closing: { state: true },
  };

  declare hass?: HomeAssistant;
  declare entityId?: string;
  /** A widget's fuller view, in place of an entity's controls. */
  declare view?: DetailView;
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
    const path = e.composedPath().filter((el): el is Element => el instanceof Element && el !== this);
    const onControl = path.some((el) => el.matches(CONTROLS));
    // A list scrolled down scrolls back up before the sheet moves.
    const scrolled = path.some((el) => el.scrollTop > 0);
    if (!onControl && !scrolled) this._swipe = { y: e.clientY, id: e.pointerId, active: false };
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
    if (this.view) return renderWidgetView(this.hass, this.view.tile);
    return renderEntityView(this.hass, this.entityId ? this.hass?.states[this.entityId] : undefined);
  }

  protected render() {
    if (!this.entityId && !this.view) return nothing;
    const { name, area } = this.view
      ? { name: this.view.title, area: undefined }
      : resolve(this.hass, this.entityId!);
    const dragging = this._swipe?.active;
    const fills = this.view ? true : FILLS.has(domainOf(this.entityId!));

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
        <div class="grabber" aria-hidden="true"></div>
        <header>
          <button class="round small glass close" aria-label="Close" @click=${this.close}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4"
                stroke-linecap="round" />
            </svg>
          </button>
          <div class="titles">
            <h2>${name}</h2>
            ${area ? html`<div class="area">${area}</div>` : nothing}
          </div>
          ${this.entityId
            ? html`<button
                class="round small glass more"
                aria-label="More settings in Home Assistant"
                @click=${() =>
                  this.dispatchEvent(new CustomEvent('more', { detail: { entityId: this.entityId } }))}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <circle cx="5" cy="12" r="2" fill="currentColor" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" />
                  <circle cx="19" cy="12" r="2" fill="currentColor" />
                </svg>
              </button>`
            : html`<span class="spacer" aria-hidden="true"></span>`}
        </header>
        <main class=${fills ? 'fill' : ''}>${this._renderView()}</main>
      </div>
    `;
  }

  static styles = [
    controls,
    css`
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
      animation: fade var(--lf-move) ease-out;
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
      transition:
        transform var(--lf-move) var(--lf-ease),
        opacity var(--lf-move);
      animation: rise var(--lf-move) var(--lf-ease);
      touch-action: pan-x;
    }

    .sheet.dragging {
      transition: none;
    }

    .closing.backdrop {
      opacity: 0;
      transition: opacity var(--lf-move);
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

    .spacer {
      flex: none;
      width: 44px;
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

    /* The view fills the sheet: its status under the header, its controls centered below. */
    main {
      flex: 1;
      display: flex;
      align-items: stretch;
      justify-content: center;
      padding: 16px 0;
    }

    /* A speaker's lists scroll inside it. */
    main.fill {
      min-height: 0;
      padding-bottom: 0;
    }

    .missing {
      align-self: center;
      font-size: 17px;
      color: var(--lf-muted);
    }

    /* Swipe down to close; the handle says so, as on a sheet. */
    .grabber {
      flex: none;
      align-self: center;
      width: 44px;
      height: 5px;
      margin: -4px 0 12px;
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
  `,
  ];
}

define('luxframe-detail', LuxFrameDetail);
