import { LitElement, html, nothing, svg } from 'lit';
import '../confirm-button';
import { define } from '../define';
import { isGuardedCover, kindColor, setLevel, stateLabel } from '../entity';
import { stateIcon } from '../icon';
import { Pending, near } from '../pending';
import type { HassEntity, HomeAssistant } from '../types';
import { detailStyles } from './styles';

// CoverEntityFeature bits.
const STOP = 8;

const arrow = (path: string) => svg`
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
    <path d=${path} fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linecap="round" stroke-linejoin="round" />
  </svg>
`;
const UP = arrow('M6 15l6-6 6 6');
const DOWN = arrow('M6 9l6 6 6-6');
const STOP_ICON = svg`
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
  </svg>
`;

/**
 * A shade or blind: a position slider and Open / Stop / Close.
 * A garage door, door or gate: its state and one button that asks for a
 * second tap before it opens, so a brush against the wall can't open the house.
 */
export class LuxFrameCoverDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;

  private _position = new Pending<number>(this);

  private _call(service: string): void {
    this._position.clear();
    this.hass?.callService('cover', service, { entity_id: this.stateObj!.entity_id });
  }

  private _setPosition(value: number): void {
    this._position.release(value);
    if (this.hass && this.stateObj) setLevel(this.hass, this.stateObj, value);
  }

  private _renderGuarded(s: HassEntity) {
    const closed = s.state === 'closed';
    const moving = s.state === 'opening' || s.state === 'closing';
    return html`
      <div class="status" aria-live="polite">${stateLabel(this.hass, s)}</div>
      <div class="layout">
        <div class="orb glass ${closed ? '' : 'on'}" style="--tile-color: ${kindColor(s.entity_id)}" aria-hidden="true">
          ${stateIcon(this.hass, s, undefined, 'G')}
        </div>
        <div class="side">
          ${closed
            ? html`<luxframe-confirm-button
                label="Open"
                confirm-label="Tap again to open"
                ?disabled=${s.state === 'unavailable'}
                @confirm=${() => this._call('open_cover')}
              ></luxframe-confirm-button>`
            : html`<button class="pill on" ?disabled=${moving} @click=${() => this._call('close_cover')}>
                Close
              </button>`}
        </div>
      </div>
    `;
  }

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    if (isGuardedCover(s)) return this._renderGuarded(s);

    const a = s.attributes;
    const unavailable = s.state === 'unavailable';
    const reported: number | undefined =
      typeof a.current_position === 'number' ? a.current_position : undefined;
    const position = reported === undefined ? undefined : (this._position.get(reported, near(1)) ?? reported);
    const status = unavailable
      ? 'Unavailable'
      : position === undefined
        ? stateLabel(this.hass, s)
        : position === 0
          ? 'Closed'
          : position === 100
            ? 'Open'
            : `${position}% open`;

    return html`
      <div class="status" aria-live="polite">${status}</div>
      <div class="layout">
        ${position !== undefined
          ? html`<luxframe-slider
              class="big"
              vertical
              .value=${position}
              label="Position"
              .valueText=${status}
              ?disabled=${unavailable}
              @input=${(e: CustomEvent<number>) => this._position.hold(e.detail)}
              @change=${(e: CustomEvent<number>) => this._setPosition(e.detail)}
            ></luxframe-slider>`
          : html`<div class="orb glass ${s.state === 'closed' ? '' : 'on'}" style="--tile-color: ${kindColor(s.entity_id)}" aria-hidden="true">
              ${stateIcon(this.hass, s, undefined, 'S')}
            </div>`}
        <div class="row">
          <button class="round glass" aria-label="Open" ?disabled=${unavailable} @click=${() => this._call('open_cover')}>
            ${UP}
          </button>
          ${(a.supported_features ?? 0) & STOP
            ? html`<button class="round glass" aria-label="Stop" ?disabled=${unavailable}
                @click=${() => this._call('stop_cover')}>
                ${STOP_ICON}
              </button>`
            : nothing}
          <button class="round glass" aria-label="Close" ?disabled=${unavailable} @click=${() => this._call('close_cover')}>
            ${DOWN}
          </button>
        </div>
      </div>
    `;
  }

  static styles = detailStyles;
}

define('luxframe-cover-detail', LuxFrameCoverDetail);
