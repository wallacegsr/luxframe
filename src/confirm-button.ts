import { LitElement, css, html } from 'lit';
import { define } from './define';

const ARMED_MS = 3000;

/**
 * A pill button for actions that open up the house (unlock, open the garage):
 * the first tap arms it and changes its words, a second tap within three
 * seconds confirms. Fires `confirm`.
 */
export class LuxFrameConfirmButton extends LitElement {
  static properties = {
    label: {},
    confirmLabel: { attribute: 'confirm-label' },
    disabled: { type: Boolean },
    _armed: { state: true },
  };

  declare label: string;
  declare confirmLabel: string;
  declare disabled: boolean;
  declare _armed: boolean;

  private _timer?: number;

  constructor() {
    super();
    this.label = '';
    this.confirmLabel = 'Tap again to confirm';
    this.disabled = false;
    this._armed = false;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._timer);
  }

  private _click(): void {
    window.clearTimeout(this._timer);
    if (this._armed) {
      this._armed = false;
      this.dispatchEvent(new CustomEvent('confirm', { bubbles: true, composed: true }));
      return;
    }
    this._armed = true;
    this._timer = window.setTimeout(() => (this._armed = false), ARMED_MS);
  }

  protected render() {
    return html`
      <button
        class=${this._armed ? 'armed' : ''}
        ?disabled=${this.disabled}
        aria-live="polite"
        @click=${this._click}
      >
        ${this._armed ? this.confirmLabel : this.label}
      </button>
    `;
  }

  static styles = css`
    button {
      min-width: 220px;
      min-height: 56px;
      padding: 0 28px;
      border: 0;
      border-radius: 999px;
      font: 600 18px var(--lf-font);
      color: var(--lf-text-active);
      background: var(--lf-surface-active);
      cursor: pointer;
      transition: background 160ms, color 160ms;
    }

    button.armed {
      color: #fff;
      background: #d9452b;
    }

    button:disabled {
      opacity: 0.5;
      cursor: default;
    }

    button:focus-visible {
      outline: 3px solid var(--lf-accent);
      outline-offset: 2px;
    }
  `;
}

define('luxframe-confirm-button', LuxFrameConfirmButton);
