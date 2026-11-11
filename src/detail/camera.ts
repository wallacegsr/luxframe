import { LitElement, css, html, nothing } from 'lit';
import { cameraStill } from '../data';
import { define } from '../define';
import { changedAgo, domainOf, isActive, resolve, stateLabel } from '../entity';
import { stateIcon } from '../icon';
import type { HassEntity, HomeAssistant } from '../types';
import { siblings } from './vacuum';

const STILL_MS = 2000;
// Only these sit beside a camera: what it saw, not its settings.
const EVENTS = new Set(['binary_sensor', 'event']);

/**
 * A camera, large and live: Home Assistant's own stream where it's loaded,
 * else its motion JPEG stream, else a still every two seconds. Under it,
 * what the camera's device senses (motion, a person, the doorbell) and when.
 */
export class LuxFrameCameraDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
    _tick: { state: true },
    _failed: { state: true },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;
  declare _tick: number;
  /** The live stream wouldn't load; fall back to stills. */
  declare _failed: boolean;

  private _timer?: number;

  constructor() {
    super();
    this._tick = Date.now();
    this._failed = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._timer = window.setInterval(() => {
      if (!document.hidden) this._tick = Date.now();
    }, STILL_MS);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._timer);
  }

  private _renderPicture(s: HassEntity) {
    if (s.state === 'unavailable') return html`<div class="message muted">Camera unavailable</div>`;
    if (customElements.get('ha-camera-stream')) {
      return html`<ha-camera-stream .hass=${this.hass} .stateObj=${s} controls muted allow-exoplayer></ha-camera-stream>`;
    }
    const token = s.attributes.access_token;
    if (token && !this._failed) {
      return html`<img src="/api/camera_proxy_stream/${s.entity_id}?token=${token}" alt=""
        @error=${() => (this._failed = true)} />`;
    }
    const still = cameraStill(s, this._tick);
    return still ? html`<img src=${still} alt="" />` : html`<div class="message muted">No picture</div>`;
  }

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const sensed = siblings(this.hass, s.entity_id).filter((o) => EVENTS.has(domainOf(o.entity_id)));
    const features: number = s.attributes.supported_features ?? 0;

    return html`
      <div class="picture">${this._renderPicture(s)}</div>
      <div class="below">
        <span class="muted state">${stateLabel(this.hass, s)}</span>
        ${sensed.map((o) => {
          const { name } = resolve(this.hass, o.entity_id);
          const at = domainOf(o.entity_id) === 'event' ? o.state : o.last_changed;
          const ago = changedAgo(this.hass, at);
          return html`<span class="sensed ${isActive(o) && domainOf(o.entity_id) === 'binary_sensor' ? 'on' : ''}">
            ${stateIcon(this.hass, o, undefined, name)}
            <span>${name}</span>
            <span class="muted">${domainOf(o.entity_id) === 'event' ? ago : `${stateLabel(this.hass, o)}${ago ? ` · ${ago}` : ''}`}</span>
          </span>`;
        })}
        ${features & 1
          ? html`<button class="chip" @click=${() =>
              this.hass?.callService('camera', s.state === 'off' ? 'turn_on' : 'turn_off', { entity_id: s.entity_id })}>
              ${s.state === 'off' ? 'Turn on' : 'Turn off'}
            </button>`
          : nothing}
      </div>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 100%;
      height: 100%;
      min-height: 0;
      color: var(--lf-text);
      font-family: var(--lf-font);
    }

    .picture {
      flex: 1;
      min-height: 0;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: var(--lf-radius);
      background: rgb(0 0 0 / 40%);
    }

    img,
    ha-camera-stream {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .message {
      font-size: 17px;
    }

    .below {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 10px 20px;
      font-size: 15px;
    }

    .state {
      font-size: 15px;
    }

    .sensed {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      padding: 0 16px;
      border-radius: 999px;
      background: var(--lf-control);
      --mdc-icon-size: 20px;
    }

    .sensed.on {
      color: var(--lf-text-active);
      background: var(--lf-surface-active);
    }

    .glyph {
      font-weight: 600;
    }

    .muted {
      color: var(--lf-muted);
    }

    .chip {
      min-height: 44px;
      padding: 0 18px;
      border: 0;
      border-radius: 999px;
      font: inherit;
      font-size: 17px;
      font-weight: 500;
      color: inherit;
      background: var(--lf-control);
      cursor: pointer;
    }
  `;
}

define('luxframe-camera-detail', LuxFrameCameraDetail);
