import { LitElement, html, nothing } from 'lit';
import '../confirm-button';
import { define } from '../define';
import { kindColor, stateLabel } from '../entity';
import { stateIcon } from '../icon';
import type { HassEntity, HomeAssistant } from '../types';
import { detailStyles } from './styles';

/** A lock: its state, Lock at once, and Unlock only after a second tap. */
export class LuxFrameLockDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;

  private _call(service: 'lock' | 'unlock'): void {
    this.hass?.callService('lock', service, { entity_id: this.stateObj!.entity_id });
  }

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const locked = s.state === 'locked';
    const busy = s.state === 'locking' || s.state === 'unlocking';
    const unavailable = s.state === 'unavailable';

    return html`
      <div class="status" aria-live="polite">${stateLabel(this.hass, s)}</div>
      <div class="layout">
        <div class="orb glass ${locked ? '' : 'on'}" style="--tile-color: ${kindColor(s.entity_id)}" aria-hidden="true">
          ${stateIcon(this.hass, s, undefined, locked ? 'L' : 'U')}
        </div>
        <div class="side">
          ${locked
            ? html`<luxframe-confirm-button
                label="Unlock"
                confirm-label="Tap again to unlock"
                ?disabled=${unavailable}
                @confirm=${() => this._call('unlock')}
              ></luxframe-confirm-button>`
            : html`<button class="pill on" ?disabled=${busy || unavailable} @click=${() => this._call('lock')}>
                Lock
              </button>`}
        </div>
      </div>
    `;
  }

  static styles = detailStyles;
}

define('luxframe-lock-detail', LuxFrameLockDetail);
