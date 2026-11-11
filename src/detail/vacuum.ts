import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { stateLabel } from '../entity';
import { icon } from '../icons';
import type { HassEntity, HomeAssistant } from '../types';
import { detailStyles } from './styles';

// Home Assistant's vacuum features, by bit.
const PAUSE = 4;
const STOP = 8;
const RETURN_HOME = 16;
const FAN_SPEED = 32;
const LOCATE = 512;
const CLEAN_SPOT = 1024;

/** Other entities on the same device, such as a vacuum's battery sensor. */
export function siblings(hass: HomeAssistant | undefined, entityId: string): HassEntity[] {
  const device = hass?.entities?.[entityId]?.device_id;
  if (!device || !hass?.entities) return [];
  return Object.values(hass.entities)
    .filter((e) => e.device_id === device && e.entity_id !== entityId)
    .map((e) => hass.states[e.entity_id])
    .filter((s): s is HassEntity => !!s);
}

/** A device's battery level: its own attribute, or a battery sensor beside it. */
export function batteryOf(hass: HomeAssistant | undefined, s: HassEntity): number | undefined {
  const own = s.attributes.battery_level;
  if (typeof own === 'number') return own;
  const sensor = siblings(hass, s.entity_id).find(
    (o) => o.attributes.device_class === 'battery' && Number.isFinite(Number(o.state)),
  );
  return sensor ? Number(sensor.state) : undefined;
}

export const isCleaning = (s: HassEntity | undefined) => s?.state === 'cleaning' || s?.state === 'returning';

/** Starts a vacuum that's resting, or pauses one that's cleaning. */
export function startOrPause(hass: HomeAssistant | undefined, s: HassEntity): void {
  const features = s.attributes.supported_features ?? 0;
  const service = s.state === 'cleaning' ? (features & PAUSE ? 'pause' : 'stop') : 'start';
  hass?.callService('vacuum', service, { entity_id: s.entity_id });
}

/**
 * A robot vacuum: what it's doing and its battery, Start or Pause, Return to
 * dock, and where it offers them: stop, spot clean, locate and suction.
 */
export class LuxFrameVacuumDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;

  private _call(service: string, data: Record<string, unknown> = {}): void {
    this.hass?.callService('vacuum', service, { entity_id: this.stateObj!.entity_id, ...data });
  }

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const features: number = s.attributes.supported_features ?? 0;
    const cleaning = s.state === 'cleaning';
    const battery = batteryOf(this.hass, s);
    const unavailable = s.state === 'unavailable';
    const speeds: string[] = s.attributes.fan_speed_list ?? [];

    return html`
      <div class="status" aria-live="polite">
        ${stateLabel(this.hass, s)}
        ${battery !== undefined ? html`<span class="muted">· ${Math.round(battery)}% battery</span>` : nothing}
      </div>
      <div class="layout">
        <div class="orb glass ${isCleaning(s) ? 'on spin' : ''}" aria-hidden="true">
          ${icon('robot', 72)}
          ${battery !== undefined
            ? html`<span class="battery" style="--level: ${battery}%"><span></span></span>`
            : nothing}
        </div>
        <div class="side">
          <button class="pill on" ?disabled=${unavailable} @click=${() => startOrPause(this.hass, s)}>
            ${icon(cleaning ? 'pause' : 'play', 22)} ${cleaning ? 'Pause' : s.state === 'paused' ? 'Resume' : 'Start cleaning'}
          </button>
          ${features & RETURN_HOME
            ? html`<button class="pill glass" ?disabled=${unavailable || s.state === 'docked'}
                @click=${() => this._call('return_to_base')}>${icon('dock', 22)} Return to dock</button>`
            : nothing}
          <div class="row">
            ${features & STOP && isCleaning(s)
              ? html`<button class="chip" @click=${() => this._call('stop')}>${icon('stop', 20)} Stop</button>`
              : nothing}
            ${features & CLEAN_SPOT
              ? html`<button class="chip" ?disabled=${unavailable} @click=${() => this._call('clean_spot')}>
                  ${icon('target', 20)} Spot clean</button>`
              : nothing}
            ${features & LOCATE
              ? html`<button class="chip" ?disabled=${unavailable} @click=${() => this._call('locate')}>
                  ${icon('speaker', 20)} Locate</button>`
              : nothing}
          </div>
          ${features & FAN_SPEED && speeds.length
            ? html`<h3>Suction</h3>
                <div class="row" role="group" aria-label="Suction">
                  ${speeds.map(
                    (speed) => html`<button class="chip ${s.attributes.fan_speed === speed ? 'on' : ''}"
                      aria-pressed=${s.attributes.fan_speed === speed}
                      @click=${() => this._call('set_fan_speed', { fan_speed: speed })}>
                      ${speed.charAt(0).toUpperCase() + speed.slice(1).replace(/_/g, ' ')}
                    </button>`,
                  )}
                </div>`
            : nothing}
        </div>
      </div>
    `;
  }

  static styles = [
    detailStyles,
    css`
      .orb {
        position: relative;
        width: 180px;
        height: 180px;
      }

      .orb.on {
        color: var(--lf-accent);
      }

      .spin svg {
        animation: spin 3s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .battery {
        position: absolute;
        bottom: 26px;
        width: 44px;
        height: 8px;
        border-radius: 4px;
        background: var(--lf-control);
        overflow: hidden;
      }

      .battery span {
        display: block;
        width: var(--level);
        height: 100%;
        background: var(--lf-color-switch);
      }

      .pill,
      .chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      h3 {
        margin: 8px 0 -6px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--lf-muted);
      }

      .row {
        max-width: 420px;
      }

      @media (prefers-reduced-motion: reduce) {
        .spin svg {
          animation: none;
        }
      }
    `,
  ];
}

define('luxframe-vacuum-detail', LuxFrameVacuumDetail);
