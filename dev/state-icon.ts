import { LitElement, css, html, svg } from 'lit';
import { icon, type IconName } from '../src/icons';
import type { HassEntity } from '../src/types';

// ?icons stands in for Home Assistant's <ha-state-icon> and <ha-icon> with LuxFrame's own
// line icons, by kind, so the dev page (and README screenshots) show icons
// rather than the first letter LuxFrame falls back to outside Home Assistant.

const EXTRA = {
  lock: svg`<rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />`,
  unlock: svg`<rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 7.5-2" />`,
  blinds: svg`<rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 8h16M4 13h16" />`,
  garage: svg`<path d="M3 10l9-6 9 6v10H3z" /><path d="M7 20v-7h10v7M7 16h10" />`,
  coffee: svg`<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M11 3v3" />`,
};

const draw = (paths: unknown) =>
  html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** Material Design icon names the dev page uses, drawn with LuxFrame's own. */
function mdi(name = ''): unknown {
  if (name === 'mdi:coffee') return draw(EXTRA.coffee);
  if (name.includes('lightbulb')) return icon('bulb');
  if (name.includes('night')) return icon('moon');
  if (/snow|hail/.test(name)) return icon('snow');
  if (/rain|pour|lightning/.test(name)) return icon('drop');
  if (name.includes('weather')) return icon('sun');
  return icon('circle');
}

const BY_DOMAIN: Record<string, IconName> = {
  light: 'bulb',
  switch: 'power',
  input_boolean: 'power',
  fan: 'fan',
  media_player: 'speaker',
  scene: 'sun',
  script: 'play',
  button: 'tap',
  input_button: 'tap',
  climate: 'range',
  camera: 'camera',
  binary_sensor: 'target',
  event: 'target',
  alarm_control_panel: 'shield',
  vacuum: 'robot',
  input_number: 'sliders',
  number: 'sliders',
  input_select: 'choice',
  select: 'choice',
  timer: 'timer',
  todo: 'list',
  calendar: 'calendar',
  weather: 'sun',
  person: 'person',
};

class DevStateIcon extends LitElement {
  static properties = { stateObj: { attribute: false }, icon: { attribute: false } };

  declare stateObj?: HassEntity;
  declare icon?: string;

  protected render() {
    const s = this.stateObj;
    if (this.icon) return mdi(this.icon);
    if (!s) return icon('tap');
    const domain = s.entity_id.split('.')[0];
    if (domain === 'lock') return draw(s.state === 'locked' ? EXTRA.lock : EXTRA.unlock);
    if (domain === 'cover') return draw(s.attributes.device_class === 'garage' ? EXTRA.garage : EXTRA.blinds);
    if (domain === 'sensor') {
      const kind = s.attributes.device_class;
      return icon(kind === 'humidity' || s.attributes.unit_of_measurement === '%' ? 'drop' : kind === 'power' ? 'bolt' : 'range');
    }
    return icon(BY_DOMAIN[domain] ?? 'circle');
  }

  static styles = css`
    :host {
      display: inline-flex;
      color: var(--state-icon-color, currentColor);
    }

    svg {
      width: var(--mdc-icon-size, 24px);
      height: var(--mdc-icon-size, 24px);
    }
  `;
}

/** <ha-icon .icon="mdi:…">, the same way. */
class DevIcon extends LitElement {
  static properties = { icon: { attribute: false } };

  declare icon?: string;

  protected render() {
    return mdi(this.icon);
  }

  static styles = DevStateIcon.styles;
}

customElements.define('ha-state-icon', DevStateIcon);
customElements.define('ha-icon', DevIcon);
