import { LitElement, html, nothing } from 'lit';
import { define } from '../define';
import { levelOf, setLevel } from '../entity';
import { stateIcon } from '../icon';
import { Pending, near } from '../pending';
import type { HassEntity, HomeAssistant } from '../types';
import { detailStyles } from './styles';

const COLOR_MODES = new Set(['hs', 'rgb', 'xy', 'rgbw', 'rgbww']);
const SATURATION = 85;

const HUE_SWATCHES: Array<[number, string]> = [
  [0, '#ff4b4b'],
  [30, '#ff9b3d'],
  [52, '#ffd43b'],
  [130, '#4cd964'],
  [210, '#3b8cff'],
  [275, '#b36bff'],
];
const WHITE_SWATCHES: Array<[number, string]> = [
  [2700, '#ffcf8f'],
  [4000, '#fff1dc'],
  [5500, '#e6efff'],
];

/** The color a light's slider fills with: its own color, softened toward white. */
function fillColor(stateObj: HassEntity): string {
  const rgb = stateObj.attributes.rgb_color as number[] | undefined;
  if (stateObj.state !== 'on' || !rgb) return '#fff3d9';
  return `color-mix(in srgb, rgb(${rgb.join(' ')}) 60%, white)`;
}

/**
 * A light: a tall brightness slider in the light's own color, white and
 * color presets with hue and warmth sliders where the bulb has them, and Turn
 * On / Turn Off. Brightness, hue and warmth are sent when you let go.
 */
export class LuxFrameLightDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;

  private _level = new Pending<number>(this);
  private _hue = new Pending<number>(this);
  private _kelvin = new Pending<number>(this);

  private _call(service: string, data: Record<string, unknown> = {}): void {
    this.hass?.callService('light', service, { entity_id: this.stateObj!.entity_id, ...data });
  }

  private _setLevel(value: number): void {
    this._level.release(value);
    if (this.hass && this.stateObj) setLevel(this.hass, this.stateObj, value);
  }

  private _setHue(hue: number): void {
    this._hue.release(hue);
    this._kelvin.clear();
    this._call('turn_on', { hs_color: [hue, SATURATION] });
  }

  private _setKelvin(kelvin: number): void {
    this._kelvin.release(kelvin);
    this._hue.clear();
    this._call('turn_on', { color_temp_kelvin: kelvin });
  }

  private _toggle(on: boolean): void {
    this._level.clear();
    this._call(on ? 'turn_off' : 'turn_on');
  }

  private _renderColor(hasColor: boolean, hasTemp: boolean, hue: number, kelvin: number, min: number, max: number) {
    const a = this.stateObj!.attributes;
    const showingWhite = a.color_mode === 'color_temp';
    return html`
      <div class="row" role="group" aria-label="Presets">
        ${hasTemp
          ? WHITE_SWATCHES.filter(([k]) => k >= min && k <= max).map(
              ([k, color]) => html`<button
                class="swatch ${showingWhite && Math.abs(kelvin - k) < 300 ? 'selected' : ''}"
                style="background: ${color}"
                aria-label="White ${k} kelvin"
                @click=${() => this._setKelvin(k)}
              ></button>`,
            )
          : nothing}
        ${hasColor
          ? HUE_SWATCHES.map(
              ([h, color]) => html`<button
                class="swatch ${!showingWhite && Math.abs(hue - h) < 12 ? 'selected' : ''}"
                style="background: ${color}"
                aria-label="Color, hue ${h}"
                @click=${() => this._setHue(h)}
              ></button>`,
            )
          : nothing}
      </div>
      ${hasColor
        ? html`<luxframe-slider
            class="wide"
            .min=${0}
            .max=${359}
            .value=${hue}
            label="Color"
            style="--slider-track: linear-gradient(to right, hsl(0 90% 60%), hsl(60 90% 60%),
              hsl(120 90% 60%), hsl(180 90% 60%), hsl(240 90% 60%), hsl(300 90% 60%), hsl(359 90% 60%));
              --slider-thumb: hsl(${hue} 90% 60%)"
            @input=${(e: CustomEvent<number>) => this._hue.hold(e.detail)}
            @change=${(e: CustomEvent<number>) => this._setHue(e.detail)}
          ></luxframe-slider>`
        : nothing}
      ${hasTemp
        ? html`<luxframe-slider
            class="wide"
            .min=${min}
            .max=${max}
            .step=${50}
            .value=${kelvin}
            label="Warmth"
            .valueText=${`${kelvin} kelvin`}
            style="--slider-track: linear-gradient(to right, #ffae54, #fff4e4, #d6e4ff)"
            @input=${(e: CustomEvent<number>) => this._kelvin.hold(e.detail)}
            @change=${(e: CustomEvent<number>) => this._setKelvin(e.detail)}
          ></luxframe-slider>`
        : nothing}
    `;
  }

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const a = s.attributes;
    const unavailable = s.state === 'unavailable';
    const reported = levelOf(s);
    const level = reported === null ? null : (this._level.get(reported, near(1)) ?? reported);
    const on = level !== null ? level > 0 : s.state === 'on';

    const modes: string[] = a.supported_color_modes ?? [];
    const hasColor = modes.some((m) => COLOR_MODES.has(m));
    const hasTemp = modes.includes('color_temp');
    const minK: number = a.min_color_temp_kelvin ?? 2000;
    const maxK: number = a.max_color_temp_kelvin ?? 6500;
    const reportedHue: number | undefined = a.hs_color?.[0];
    const hue = Math.round(this._hue.get(reportedHue, near(2)) ?? reportedHue ?? 30);
    const reportedK: number | undefined = a.color_temp_kelvin;
    const kelvin = this._kelvin.get(reportedK, near(60)) ?? reportedK ?? Math.round((minK + maxK) / 2);

    const status = unavailable ? 'Unavailable' : level !== null ? (level > 0 ? `${level}%` : 'Off') : on ? 'On' : 'Off';

    return html`
      <div class="status" aria-live="polite">${status}</div>
      <div class="layout">
        ${level !== null
          ? html`<luxframe-slider
              class="big"
              vertical
              .value=${level}
              label="Brightness"
              .valueText=${status}
              ?disabled=${unavailable}
              style="--slider-fill: ${fillColor(s)}"
              @input=${(e: CustomEvent<number>) => this._level.hold(e.detail)}
              @change=${(e: CustomEvent<number>) => this._setLevel(e.detail)}
            ></luxframe-slider>`
          : html`<button
              class="orb glass ${on ? 'on' : ''}"
              aria-label=${on ? 'Turn off' : 'Turn on'}
              ?disabled=${unavailable}
              @click=${() => this._toggle(on)}
            >
              ${stateIcon(this.hass, s, undefined, 'L')}
            </button>`}
        <div class="side">
          ${on && (hasColor || hasTemp)
            ? this._renderColor(hasColor, hasTemp, hue, kelvin, minK, maxK)
            : nothing}
          <button
            class="pill ${on ? 'on' : 'glass'}"
            ?disabled=${unavailable}
            @click=${() => this._toggle(on)}
          >
            ${on ? 'Turn Off' : 'Turn On'}
          </button>
        </div>
      </div>
    `;
  }

  static styles = detailStyles;
}

define('luxframe-light-detail', LuxFrameLightDetail);
