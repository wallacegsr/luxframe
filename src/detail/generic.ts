import { LitElement, html, nothing } from 'lit';
import { define } from '../define';
import { changedAgo, domainOf, isActive, isMomentary, stateLabel } from '../entity';
import { stateIcon } from '../icon';
import type { HassEntity, HomeAssistant } from '../types';
import { detailStyles } from './styles';

const TOGGLES = new Set(['switch', 'input_boolean', 'automation', 'siren', 'humidifier']);

/**
 * Anything without its own view: its icon and state, when it last changed,
 * and Turn On / Off or Run where that makes sense. ⋯ in the header leads to
 * Home Assistant's full dialog for the rest.
 */
export class LuxFrameGenericDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const domain = domainOf(s.entity_id);
    const on = isActive(s);
    const unavailable = s.state === 'unavailable';
    const ago = changedAgo(this.hass, s.last_changed);
    const target = { entity_id: s.entity_id };

    let action: unknown = nothing;
    if (isMomentary(s)) {
      action = html`<button class="pill on" ?disabled=${unavailable}
        @click=${() => this.hass?.callService(domain, 'turn_on', target)}>Run</button>`;
    } else if (TOGGLES.has(domain)) {
      action = html`<button class="pill ${on ? 'on' : 'glass'}" ?disabled=${unavailable}
        @click=${() => this.hass?.callService(domain, on ? 'turn_off' : 'turn_on', target)}>
        ${on ? 'Turn Off' : 'Turn On'}
      </button>`;
    }

    return html`
      <div class="orb glass ${on ? 'on' : ''}" aria-hidden="true">
        ${stateIcon(this.hass, s, undefined, s.attributes.friendly_name ?? '?')}
      </div>
      <div class="status" aria-live="polite">${stateLabel(this.hass, s)}</div>
      ${ago && !isMomentary(s) ? html`<div class="muted">Changed ${ago}</div>` : nothing}
      ${action}
    `;
  }

  static styles = detailStyles;
}

define('luxframe-generic-detail', LuxFrameGenericDetail);
