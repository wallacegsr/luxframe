import { LitElement, css, html, nothing } from 'lit';
import { ACTION_LABELS, HVAC_LABELS, TempSetter, formatTemp, modeLabel } from '../climate';
import { define } from '../define';
import { chevron } from '../tiles/thermostat';
import type { HassEntity, HomeAssistant } from '../types';
import { detailStyles } from './styles';

/**
 * A thermostat: the target large with big ▼/▲, what it's doing now, its
 * modes, and its fan modes, presets and swing where it has them. A heat/cool
 * range shows Low and High side by side. Taps are gathered and sent once they
 * stop.
 */
export class LuxFrameClimateDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;

  private _send(data: Record<string, unknown>): void {
    this.hass?.callService('climate', 'set_temperature', { entity_id: this.stateObj!.entity_id, ...data });
  }

  private _target = new TempSetter(this, (temperature) => this._send({ temperature }));
  private _low = new TempSetter(this, (low) =>
    this._send({ target_temp_low: low, target_temp_high: this._high.value(this.stateObj?.attributes.target_temp_high) }),
  );
  private _high = new TempSetter(this, (high) =>
    this._send({ target_temp_low: this._low.value(this.stateObj?.attributes.target_temp_low), target_temp_high: high }),
  );

  private _stepper(label: string, setter: TempSetter, reported: number | undefined, size: 'large' | 'small') {
    const s = this.stateObj!;
    const value = setter.value(reported);
    const disabled = s.state === 'unavailable' || value === undefined;
    return html`
      <div class="stepper ${size}" role="group" aria-label=${label}>
        <button class="round glass" aria-label="Lower ${label}" ?disabled=${disabled}
          @click=${() => setter.step(this.hass, s, reported, -1)}>
          ${chevron(false, 30)}
        </button>
        <div class="value" aria-live="polite">${value !== undefined ? formatTemp(value) : '–'}°</div>
        <button class="round glass" aria-label="Raise ${label}" ?disabled=${disabled}
          @click=${() => setter.step(this.hass, s, reported, 1)}>
          ${chevron(true, 30)}
        </button>
      </div>
    `;
  }

  /** One row of choices such as fan modes; nothing when the device has none. */
  private _choices(label: string, options: unknown, current: unknown, service: string, field: string) {
    if (!Array.isArray(options) || options.length < 2) return nothing;
    const s = this.stateObj!;
    return html`<div class="labelled">
      <div class="muted">${label}</div>
      <div class="row" role="group" aria-label=${label}>
        ${options.map(
          (option: string) => html`<button
            class="chip ${current === option ? 'on' : 'glass'}"
            aria-pressed=${current === option}
            ?disabled=${s.state === 'unavailable'}
            @click=${() => this.hass?.callService('climate', service, { entity_id: s.entity_id, [field]: option })}
          >
            ${modeLabel(option)}
          </button>`,
        )}
      </div>
    </div>`;
  }

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const a = s.attributes;
    const modes: string[] = a.hvac_modes ?? [];
    const range = a.temperature == null && (a.target_temp_low != null || a.target_temp_high != null);
    const action = a.hvac_action ? (ACTION_LABELS[a.hvac_action] ?? a.hvac_action) : undefined;
    const now = typeof a.current_temperature === 'number' ? `Now ${formatTemp(a.current_temperature)}°` : undefined;

    return html`
      <div class="status">
        ${s.state === 'unavailable'
          ? 'Unavailable'
          : html`${action ?? HVAC_LABELS[s.state] ?? s.state}${now
              ? html` <span class="muted">· ${now}</span>`
              : nothing}`}
      </div>
      ${range
        ? html`<div class="row range">
            <div class="labelled"><div class="muted">Low</div>
              ${this._stepper('low', this._low, a.target_temp_low, 'small')}</div>
            <div class="labelled"><div class="muted">High</div>
              ${this._stepper('high', this._high, a.target_temp_high, 'small')}</div>
          </div>`
        : this._stepper('target', this._target, a.temperature, 'large')}
      ${modes.length
        ? html`<div class="row" role="group" aria-label="Mode">
            ${modes.map(
              (mode) => html`<button
                class="chip ${s.state === mode ? 'on' : 'glass'}"
                aria-pressed=${s.state === mode}
                @click=${() =>
                  this.hass?.callService('climate', 'set_hvac_mode', {
                    entity_id: s.entity_id,
                    hvac_mode: mode,
                  })}
              >
                ${HVAC_LABELS[mode] ?? mode}
              </button>`,
            )}
          </div>`
        : nothing}
      ${this._choices('Fan', a.fan_modes, a.fan_mode, 'set_fan_mode', 'fan_mode')}
      ${this._choices('Preset', a.preset_modes, a.preset_mode, 'set_preset_mode', 'preset_mode')}
      ${this._choices('Swing', a.swing_modes, a.swing_mode, 'set_swing_mode', 'swing_mode')}
    `;
  }

  static styles = [
    detailStyles,
    css`
      .stepper {
        display: flex;
        align-items: center;
        gap: clamp(16px, 4vw, 40px);
      }

      .value {
        min-width: 3ch;
        text-align: center;
        font-weight: 300;
        letter-spacing: -0.03em;
        font-variant-numeric: tabular-nums;
      }

      /* Not .big: that's the sliders' size, shared by every detail view. */
      .large .value {
        font-size: var(--lf-detail-temp-size, clamp(88px, 14vw, 160px));
      }

      .large .round {
        width: 76px;
        height: 76px;
      }

      .small .value {
        font-size: 64px;
      }

      .range {
        gap: clamp(24px, 6vw, 72px);
      }

      .labelled {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        font-size: 17px;
      }
    `,
  ];
}

define('luxframe-climate-detail', LuxFrameClimateDetail);
