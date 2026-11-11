import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { stateLabel } from '../entity';
import { icon, type IconName } from '../icons';
import type { HassEntity, HomeAssistant } from '../types';
import { detailStyles } from './styles';

/** Home Assistant's arm modes, by the feature bit that offers each. */
export const ARM_MODES = [
  { mode: 'home', label: 'Home', bit: 1 },
  { mode: 'away', label: 'Away', bit: 2 },
  { mode: 'night', label: 'Night', bit: 4 },
  { mode: 'vacation', label: 'Vacation', bit: 32 },
  { mode: 'custom_bypass', label: 'Custom', bit: 16 },
] as const;

type Mode = (typeof ARM_MODES)[number]['mode'];

/** How an alarm panel looks in a state: its color and shield. */
export function alarmLook(state: string): { color: string; icon: IconName; busy: boolean } {
  if (state === 'triggered') return { color: 'var(--lf-danger)', icon: 'shield-alert', busy: true };
  if (state === 'arming' || state === 'pending' || state === 'disarming') {
    return { color: 'var(--lf-accent)', icon: 'shield', busy: true };
  }
  if (state.startsWith('armed')) return { color: 'var(--lf-color-lock)', icon: 'shield-check', busy: false };
  if (state === 'disarmed') return { color: 'var(--lf-color-switch)', icon: 'shield', busy: false };
  return { color: 'var(--lf-muted)', icon: 'shield', busy: false };
}

/** The modes this panel offers; Home and Away when it doesn't say. */
export function armModes(s: HassEntity) {
  const features = s.attributes.supported_features;
  if (typeof features !== 'number') return ARM_MODES.filter((m) => m.mode === 'home' || m.mode === 'away');
  return ARM_MODES.filter((m) => features & m.bit);
}

/**
 * An alarm panel: its state on a large shield, a button for each arm mode it
 * offers, and Disarm while armed. A panel that wants a code asks for it on a
 * keypad (or a text field, for a text code) before sending.
 */
export class LuxFrameAlarmDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
    _asking: { state: true },
    _code: { state: true },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;
  /** What's waiting for the code: an arm mode, or disarming. */
  declare _asking?: Mode | 'disarm';
  declare _code: string;

  constructor() {
    super();
    this._code = '';
  }

  private _needsCode(action: Mode | 'disarm'): boolean {
    const a = this.stateObj?.attributes ?? {};
    if (!a.code_format) return false;
    return action === 'disarm' || a.code_arm_required !== false;
  }

  private _choose(action: Mode | 'disarm'): void {
    if (this._needsCode(action)) {
      this._asking = action;
      this._code = '';
    } else {
      this._send(action);
    }
  }

  private _send(action: Mode | 'disarm', code?: string): void {
    const service = action === 'disarm' ? 'alarm_disarm' : `alarm_arm_${action}`;
    this.hass?.callService('alarm_control_panel', service, {
      entity_id: this.stateObj!.entity_id,
      ...(code ? { code } : {}),
    });
    this._asking = undefined;
    this._code = '';
  }

  private _key(k: string): void {
    if (k === 'back') this._code = this._code.slice(0, -1);
    else if (this._code.length < 12) this._code += k;
  }

  private _renderCode(action: Mode | 'disarm') {
    const label = action === 'disarm' ? 'Disarm' : `Arm ${ARM_MODES.find((m) => m.mode === action)?.label}`;
    const text = this.stateObj?.attributes.code_format === 'text';
    return html`
      <div class="code">
        <div class="prompt">Enter the code to ${label.toLowerCase()}</div>
        ${text
          ? html`<input type="password" class="field" aria-label="Code" autocomplete="off" .value=${this._code}
              @input=${(e: Event) => (this._code = (e.target as HTMLInputElement).value)}
              @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this._code && this._send(action, this._code)} />`
          : html`<div class="dots" aria-label="${this._code.length} digits entered">
                ${this._code ? [...this._code].map(() => html`<span></span>`) : html`<span class="none"></span>`}
              </div>
              <div class="keypad" role="group" aria-label="Keypad">
                ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(
                  (k) => html`<button class="round big glass" @click=${() => this._key(k)}>${k}</button>`,
                )}
                <button class="round big plain" aria-label="Delete" ?disabled=${!this._code}
                  @click=${() => this._key('back')}>${icon('backspace', 28)}</button>
                <button class="round big glass" @click=${() => this._key('0')}>0</button>
                <span></span>
              </div>`}
        <div class="row">
          <button class="pill glass" @click=${() => (this._asking = undefined)}>Cancel</button>
          <button class="pill on" ?disabled=${!this._code} @click=${() => this._send(action, this._code)}>${label}</button>
        </div>
      </div>
    `;
  }

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const look = alarmLook(s.state);
    const armed = s.state.startsWith('armed') || s.state === 'triggered' || s.state === 'arming' || s.state === 'pending';
    const unavailable = s.state === 'unavailable';

    return html`
      <div class="status" aria-live="polite">${stateLabel(this.hass, s)}</div>
      <div class="layout">
        <div class="orb glass ${look.busy ? 'busy' : ''}" style="color: ${look.color}" aria-hidden="true">
          ${icon(look.icon, 72)}
        </div>
        <div class="side">
          ${this._asking
            ? this._renderCode(this._asking)
            : armed
              ? html`<button class="pill ${s.state === 'triggered' ? 'danger' : 'on'}" ?disabled=${unavailable}
                  @click=${() => this._choose('disarm')}>Disarm</button>`
              : html`<div class="modes">
                  ${armModes(s).map(
                    (m) => html`<button class="pill glass" ?disabled=${unavailable} @click=${() => this._choose(m.mode)}>
                      Arm ${m.label}
                    </button>`,
                  )}
                </div>`}
        </div>
      </div>
    `;
  }

  static styles = [
    detailStyles,
    css`
      .orb {
        width: 180px;
        height: 180px;
      }

      .busy svg {
        animation: pulse 1.4s ease-in-out infinite;
      }

      @keyframes pulse {
        50% {
          opacity: 0.45;
        }
      }

      .modes {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .code {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 18px;
      }

      .prompt {
        font-size: 17px;
        color: var(--lf-muted);
      }

      .dots {
        display: flex;
        gap: 12px;
        height: 14px;
      }

      .dots span {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--lf-text);
      }

      .dots .none {
        background: var(--lf-faint);
      }

      .keypad {
        display: grid;
        grid-template-columns: repeat(3, 72px);
        gap: 14px 22px;
      }

      .keypad .round {
        font-size: 28px;
        font-weight: 400;
      }

      .field {
        box-sizing: border-box;
        width: 260px;
        min-height: 52px;
        padding: 0 18px;
        border: 0;
        border-radius: 999px;
        background: var(--lf-control);
        color: inherit;
        font: inherit;
        font-size: 20px;
        text-align: center;
      }

      .code .pill {
        min-width: 140px;
      }

      @media (prefers-reduced-motion: reduce) {
        .busy svg {
          animation: none;
        }
      }
    `,
  ];
}

define('luxframe-alarm-detail', LuxFrameAlarmDetail);
