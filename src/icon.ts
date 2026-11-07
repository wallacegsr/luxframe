import { html } from 'lit';
import type { HassEntity, HomeAssistant } from './types';

/**
 * An entity's icon via Home Assistant's own <ha-state-icon>, which follows
 * state (an open lock, a lit bulb). Outside HA, as on the dev page, a letter.
 */
export function stateIcon(
  hass: HomeAssistant | undefined,
  stateObj: HassEntity | undefined,
  icon?: string,
  fallback = '?',
) {
  return customElements.get('ha-state-icon')
    ? html`<ha-state-icon .hass=${hass} .stateObj=${stateObj} .icon=${icon}></ha-state-icon>`
    : html`<span class="glyph">${fallback.charAt(0)}</span>`;
}
