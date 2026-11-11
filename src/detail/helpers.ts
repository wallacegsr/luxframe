import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { domainOf } from '../entity';
import { formatNumber } from '../history';
import { icon } from '../icons';
import { Pending } from '../pending';
import '../slider';
import type { HassEntity, HomeAssistant } from '../types';
import { detailStyles } from './styles';

/** A number helper's range and step, and its value now. */
export function numberRange(s: HassEntity) {
  const a = s.attributes;
  const min = Number(a.min ?? 0);
  const max = Number(a.max ?? 100);
  const step = Number(a.step ?? 1) || 1;
  return { min, max, step, value: Number(s.state), unit: (a.unit_of_measurement as string | undefined) ?? '' };
}

export function setNumber(hass: HomeAssistant | undefined, s: HassEntity, value: number): void {
  hass?.callService(domainOf(s.entity_id), 'set_value', { entity_id: s.entity_id, value });
}

export function selectOption(hass: HomeAssistant | undefined, s: HassEntity, option: string): void {
  hass?.callService(domainOf(s.entity_id), 'select_option', { entity_id: s.entity_id, option });
}

/** An option as Home Assistant shows it, when it can. */
export const optionLabel = (hass: HomeAssistant | undefined, s: HassEntity, option: string): string =>
  hass?.formatEntityState?.(s, option) ?? option;

/** A number helper: its value, a large slider, and a step down or up. */
export class LuxFrameNumberDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;

  private _value = new Pending<number>(this);

  private _set(value: number): void {
    const { min, max } = numberRange(this.stateObj!);
    const next = Math.max(min, Math.min(max, value));
    this._value.release(next);
    setNumber(this.hass, this.stateObj!, next);
  }

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const { min, max, step, value: reported, unit } = numberRange(s);
    const value = this._value.get(reported) ?? reported;
    const fmt = (v: number) => `${formatNumber(this.hass, v, String(step))}${unit ? ` ${unit}` : ''}`;
    const unavailable = s.state === 'unavailable' || !Number.isFinite(value);
    // Round away floating-point dust from adding steps.
    const by = (n: number) => Math.round((value + n * step) / step) * step;

    return html`
      <div class="status" aria-live="polite">${unavailable ? 'Unavailable' : fmt(value)}</div>
      <div class="layout">
        <luxframe-slider class="big" vertical label=${s.attributes.friendly_name ?? 'Value'}
          .value=${value} .min=${min} .max=${max} .step=${step} .valueText=${fmt(value)} ?disabled=${unavailable}
          @input=${(e: CustomEvent<number>) => this._value.hold(e.detail)}
          @change=${(e: CustomEvent<number>) => this._set(e.detail)}></luxframe-slider>
        <div class="side">
          <button class="round big glass" aria-label="Up one step" ?disabled=${unavailable || value >= max}
            @click=${() => this._set(by(1))}>${icon('plus', 30)}</button>
          <div class="muted range">${fmt(min)} – ${fmt(max)}</div>
          <button class="round big glass" aria-label="Down one step" ?disabled=${unavailable || value <= min}
            @click=${() => this._set(by(-1))}>${icon('minus', 30)}</button>
        </div>
      </div>
    `;
  }

  static styles = [
    detailStyles,
    css`
      .range {
        font-size: 15px;
        font-variant-numeric: tabular-nums;
      }
    `,
  ];
}

/** A choice helper: every option, the chosen one marked. */
export class LuxFrameSelectDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;

  private _chosen = new Pending<string>(this);

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const options: string[] = s.attributes.options ?? [];
    const chosen = this._chosen.get(s.state) ?? s.state;
    const unavailable = s.state === 'unavailable';

    return html`
      <div class="status" aria-live="polite">${unavailable ? 'Unavailable' : optionLabel(this.hass, s, chosen)}</div>
      <ul class="options glass" role="radiogroup" aria-label=${s.attributes.friendly_name ?? 'Options'} data-no-swipe>
        ${options.map(
          (o) => html`<li>
            <button role="radio" aria-checked=${o === chosen} class=${o === chosen ? 'chosen' : ''} ?disabled=${unavailable}
              @click=${() => {
                this._chosen.release(o);
                selectOption(this.hass, s, o);
              }}>
              <span>${optionLabel(this.hass, s, o)}</span>
              ${o === chosen ? icon('check', 24) : nothing}
            </button>
          </li>`,
        )}
      </ul>
    `;
  }

  static styles = [
    detailStyles,
    css`
      :host {
        justify-content: flex-start;
      }

      .options {
        box-sizing: border-box;
        width: min(460px, 100%);
        max-height: 60vh;
        margin: 0;
        padding: 6px;
        overflow-y: auto;
        list-style: none;
        border-radius: var(--lf-radius);
      }

      .options button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        min-height: 56px;
        padding: 0 18px;
        border-radius: var(--lf-radius-s);
        background: none;
        font-size: 18px;
        text-align: left;
      }

      .options li + li {
        border-top: 1px solid var(--lf-control-row);
      }

      .options .chosen {
        font-weight: 600;
        color: var(--lf-text-active);
        background: var(--lf-surface-active);
      }
    `,
  ];
}

define('luxframe-number-detail', LuxFrameNumberDetail);
define('luxframe-select-detail', LuxFrameSelectDetail);
