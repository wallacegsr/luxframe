import { LitElement, html, nothing } from 'lit';
import { define } from '../define';
import { kindColor, levelOf, setLevel } from '../entity';
import { stateIcon } from '../icon';
import { Pending, near } from '../pending';
import type { HassEntity, HomeAssistant } from '../types';
import { detailStyles } from './styles';

/** A fan: a speed slider in its own steps, presets, oscillation, and Turn On / Off. */
export class LuxFrameFanDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;

  private _speed = new Pending<number>(this);

  private _call(service: string, data: Record<string, unknown> = {}): void {
    this.hass?.callService('fan', service, { entity_id: this.stateObj!.entity_id, ...data });
  }

  private _setSpeed(value: number): void {
    this._speed.release(value);
    if (this.hass && this.stateObj) setLevel(this.hass, this.stateObj, value);
  }

  private _toggle(on: boolean): void {
    this._speed.clear();
    this._call(on ? 'turn_off' : 'turn_on');
  }

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const a = s.attributes;
    const unavailable = s.state === 'unavailable';
    const reported = levelOf(s);
    const speed = reported === null ? null : (this._speed.get(reported, near(1)) ?? reported);
    const on = speed !== null ? speed > 0 : s.state === 'on';
    const step: number = a.percentage_step ?? 1;
    const presets: string[] = a.preset_modes ?? [];
    const status = unavailable ? 'Unavailable' : speed !== null && on ? `${speed}%` : on ? 'On' : 'Off';

    return html`
      <div class="status" aria-live="polite">${status}</div>
      <div class="layout">
        ${speed !== null
          ? html`<luxframe-slider
              class="big"
              vertical
              .value=${speed}
              .step=${step}
              label="Speed"
              .valueText=${status}
              ?disabled=${unavailable}
              @input=${(e: CustomEvent<number>) => this._speed.hold(e.detail)}
              @change=${(e: CustomEvent<number>) => this._setSpeed(e.detail)}
            ></luxframe-slider>`
          : html`<button
              class="orb glass ${on ? 'on' : ''}"
              style="--tile-color: ${kindColor(s.entity_id)}"
              aria-label=${on ? 'Turn off' : 'Turn on'}
              ?disabled=${unavailable}
              @click=${() => this._toggle(on)}
            >
              ${stateIcon(this.hass, s, undefined, 'F')}
            </button>`}
        <div class="side">
          ${presets.length
            ? html`<div class="row" role="group" aria-label="Modes">
                ${presets.map(
                  (mode) => html`<button
                    class="chip ${a.preset_mode === mode ? 'on' : 'glass'}"
                    aria-pressed=${a.preset_mode === mode}
                    @click=${() => this._call('set_preset_mode', { preset_mode: mode })}
                  >
                    ${mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>`,
                )}
              </div>`
            : nothing}
          ${typeof a.oscillating === 'boolean'
            ? html`<button
                class="chip ${a.oscillating ? 'on' : 'glass'}"
                aria-pressed=${a.oscillating}
                @click=${() => this._call('oscillate', { oscillating: !a.oscillating })}
              >
                Oscillate
              </button>`
            : nothing}
          <button class="pill ${on ? 'on' : 'glass'}" ?disabled=${unavailable} @click=${() => this._toggle(on)}>
            ${on ? 'Turn Off' : 'Turn On'}
          </button>
        </div>
      </div>
    `;
  }

  static styles = detailStyles;
}

define('luxframe-fan-detail', LuxFrameFanDetail);
