import { LitElement, css, html, nothing } from 'lit';
import { define } from './define';

/**
 * A large touch slider. Vertical, it's a tall glass pill that fills from the
 * bottom, like a dimmer. Horizontal, it's a track with a round thumb, used for
 * hue and white temperature. Horizontal and `filled`, it's a wide pill that
 * fills from the left, for volume and screen brightness.
 *
 * Fires `input` (detail: value) while dragging and `change` on release. Touch
 * and drag go straight to the value under the finger.
 */
export class LuxFrameSlider extends LitElement {
  static properties = {
    value: { type: Number },
    min: { type: Number },
    max: { type: Number },
    step: { type: Number },
    vertical: { type: Boolean, reflect: true },
    filled: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    label: {},
    valueText: { attribute: false },
  };

  declare value: number;
  declare min: number;
  declare max: number;
  declare step: number;
  declare vertical: boolean;
  declare filled: boolean;
  declare disabled: boolean;
  declare label: string;
  /** What a screen reader says for the value, e.g. "71%". */
  declare valueText?: string;

  private _dragging = false;

  constructor() {
    super();
    this.value = 0;
    this.min = 0;
    this.max = 100;
    this.step = 1;
    this.vertical = false;
    this.filled = false;
    this.disabled = false;
    this.label = '';
  }

  private get _fraction(): number {
    const span = this.max - this.min || 1;
    return Math.max(0, Math.min(1, (this.value - this.min) / span));
  }

  private _valueAt(e: PointerEvent): number {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fraction = this.vertical
      ? 1 - (e.clientY - rect.top) / rect.height
      : (e.clientX - rect.left) / rect.width;
    const raw = this.min + Math.max(0, Math.min(1, fraction)) * (this.max - this.min);
    return Math.round(raw / this.step) * this.step;
  }

  private _emit(type: 'input' | 'change', value: number): void {
    this.value = value;
    this.dispatchEvent(new CustomEvent(type, { detail: value, bubbles: true, composed: true }));
  }

  private _down(e: PointerEvent): void {
    if (this.disabled || e.button !== 0) return;
    this._dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this._emit('input', this._valueAt(e));
  }

  private _move(e: PointerEvent): void {
    if (this._dragging) this._emit('input', this._valueAt(e));
  }

  private _up(): void {
    if (!this._dragging) return;
    this._dragging = false;
    this._emit('change', this.value);
  }

  private _key(e: KeyboardEvent): void {
    if (this.disabled) return;
    const big = (this.max - this.min) / 10;
    const delta: Record<string, number> = {
      ArrowUp: this.step,
      ArrowRight: this.step,
      ArrowDown: -this.step,
      ArrowLeft: -this.step,
      PageUp: big,
      PageDown: -big,
    };
    let next: number;
    if (e.key in delta) next = this.value + delta[e.key];
    else if (e.key === 'Home') next = this.min;
    else if (e.key === 'End') next = this.max;
    else return;
    e.preventDefault();
    e.stopPropagation();
    next = Math.max(this.min, Math.min(this.max, Math.round(next / this.step) * this.step));
    this._emit('input', next);
    this._emit('change', next);
  }

  protected render() {
    const percent = `${(this._fraction * 100).toFixed(2)}%`;
    return html`
      <div
        class="track"
        role="slider"
        tabindex=${this.disabled ? -1 : 0}
        aria-label=${this.label}
        aria-orientation=${this.vertical ? 'vertical' : 'horizontal'}
        aria-valuemin=${this.min}
        aria-valuemax=${this.max}
        aria-valuenow=${this.value}
        aria-valuetext=${this.valueText ?? nothing}
        aria-disabled=${this.disabled}
        @pointerdown=${this._down}
        @pointermove=${this._move}
        @pointerup=${this._up}
        @pointercancel=${this._up}
        @keydown=${this._key}
      >
        ${this.vertical
          ? html`<div class="fill" style="height: ${percent}"></div>`
          : this.filled
            ? html`<div class="fill" style="width: ${percent}"></div>`
            : html`<div class="thumb" style="left: ${percent}"></div>`}
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      touch-action: none;
    }

    .track {
      position: relative;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      outline: none;
      cursor: pointer;
    }

    .track:focus-visible {
      box-shadow: 0 0 0 3px var(--lf-accent);
    }

    :host([disabled]) .track {
      cursor: default;
      opacity: 0.5;
    }

    /* Vertical: a dimmer pill. */
    :host([vertical]) .track {
      overflow: hidden;
      border-radius: 32px;
      background: var(--lf-surface);
      -webkit-backdrop-filter: var(--lf-blur);
      backdrop-filter: var(--lf-blur);
      box-shadow: var(--lf-shadow);
    }

    .fill {
      position: absolute;
      inset: auto 0 0 0;
      background: var(--slider-fill, var(--lf-surface-active));
      transition: height 120ms ease-out;
    }

    /* Horizontal and filled: a wide pill filling from the left. */
    :host([filled]:not([vertical])) {
      height: 56px;
    }

    :host([filled]:not([vertical])) .track {
      overflow: hidden;
      border-radius: 18px;
      background: var(--slider-track, rgb(255 255 255 / 14%));
      box-shadow: none;
    }

    :host([filled]:not([vertical])) .fill {
      inset: 0 auto 0 0;
      transition: width 120ms ease-out;
    }

    /* Horizontal: a colored track with a thumb. */
    :host(:not([vertical])) {
      height: 44px;
    }

    :host(:not([vertical])) .track {
      border-radius: 22px;
      background: var(--slider-track, var(--lf-surface));
      box-shadow: var(--lf-shadow);
    }

    .thumb {
      position: absolute;
      top: 50%;
      width: 36px;
      height: 36px;
      margin: -18px 0 0 -18px;
      border-radius: 50%;
      background: var(--slider-thumb, #fff);
      border: 3px solid #fff;
      box-sizing: border-box;
      box-shadow: 0 1px 6px rgb(0 0 0 / 35%);
      pointer-events: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .fill {
        transition: none;
      }
    }
  `;
}

define('luxframe-slider', LuxFrameSlider);
