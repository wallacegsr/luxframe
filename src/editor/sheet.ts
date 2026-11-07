import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';

/**
 * A glass panel over the frame for the editor: a title, a Done button, and
 * whatever is slotted in. Escape or a tap outside closes it too. Fires
 * `close`.
 */
export class LuxFrameSheet extends LitElement {
  static properties = {
    heading: {},
    wide: { type: Boolean, reflect: true },
  };

  declare heading: string;
  declare wide: boolean;

  private _returnFocus?: Element | null;

  constructor() {
    super();
    this.heading = '';
    this.wide = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._returnFocus = document.activeElement;
    this.addEventListener('keydown', this._onKey);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('keydown', this._onKey);
    (this._returnFocus as HTMLElement | null)?.focus?.();
  }

  protected firstUpdated(): void {
    (this.renderRoot.querySelector('.done') as HTMLElement | null)?.focus();
  }

  private _onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this._close();
    }
  };

  private _close(): void {
    this.dispatchEvent(new CustomEvent('close'));
  }

  protected render() {
    return html`
      <div class="backdrop" @click=${this._close}></div>
      <section class="panel" role="dialog" aria-modal="true" aria-label=${this.heading}>
        <header>
          <h2>${this.heading}</h2>
          <button class="done" @click=${this._close}>Done</button>
        </header>
        <div class="body"><slot></slot></div>
      </section>
      ${nothing}
    `;
  }

  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      z-index: 20;
      display: grid;
      place-items: center;
      padding: 16px;
      color: var(--lf-text);
      font-family: var(--lf-font);
    }

    .backdrop {
      position: absolute;
      inset: 0;
      background: rgb(0 0 0 / 28%);
      animation: fade 160ms ease-out;
    }

    .panel {
      position: relative;
      display: flex;
      flex-direction: column;
      width: min(520px, 100%);
      max-height: min(720px, 100%);
      border-radius: calc(var(--lf-radius) + 6px);
      background: var(--lf-sheet);
      -webkit-backdrop-filter: var(--lf-blur-strong);
      backdrop-filter: var(--lf-blur-strong);
      box-shadow: 0 24px 60px rgb(0 0 0 / 35%);
      animation: pop 200ms ease-out;
      overflow: hidden;
    }

    :host([wide]) .panel {
      width: min(720px, 100%);
    }

    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 18px 18px 10px 24px;
    }

    h2 {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-size: 22px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .done {
      min-height: 44px;
      padding: 0 20px;
      border: 0;
      border-radius: 999px;
      font: inherit;
      font-weight: 600;
      color: var(--lf-text-active);
      background: var(--lf-surface-active);
      cursor: pointer;
    }

    .done:focus-visible {
      outline: 3px solid var(--lf-accent);
      outline-offset: 2px;
    }

    .body {
      padding: 6px 24px 24px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    @keyframes fade {
      from {
        opacity: 0;
      }
    }

    @keyframes pop {
      from {
        opacity: 0;
        transform: scale(0.96);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .backdrop,
      .panel {
        animation: none;
      }
    }
  `;
}

define('luxframe-sheet', LuxFrameSheet);

/** Controls inside editor sheets: section labels, chips, steppers, fields, list rows. */
export const editorStyles = css`
  :host {
    display: block;
    color: var(--lf-text);
    font-family: var(--lf-font);
  }

  h3 {
    margin: 18px 0 8px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--lf-muted);
  }

  h3:first-child {
    margin-top: 4px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  button {
    font: inherit;
    color: inherit;
    border: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 3px solid var(--lf-accent);
    outline-offset: 2px;
  }

  .chip {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 999px;
    font-size: 16px;
    font-weight: 500;
    background: rgb(255 255 255 / 14%);
  }

  .chip.on {
    color: var(--lf-text-active);
    background: var(--lf-surface-active);
  }

  .danger {
    color: #fff;
    background: #d9473f;
  }

  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    background: rgb(255 255 255 / 10%);
    padding: 4px;
  }

  .stepper button {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    font-size: 22px;
    line-height: 1;
    background: rgb(255 255 255 / 14%);
  }

  .stepper output {
    min-width: 2ch;
    text-align: center;
    font-size: 18px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  label.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 15px;
    color: var(--lf-muted);
  }

  input[type='text'],
  input[type='search'] {
    box-sizing: border-box;
    width: 100%;
    min-height: 46px;
    padding: 0 14px;
    border: 0;
    border-radius: 12px;
    font: inherit;
    font-size: 17px;
    color: var(--lf-text);
    background: rgb(255 255 255 / 12%);
  }

  input::placeholder {
    color: var(--lf-faint);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    min-height: 54px;
    padding: 6px 12px;
    border-radius: 12px;
    text-align: left;
    background: transparent;
    box-sizing: border-box;
  }

  button.item:hover,
  button.item:active {
    background: rgb(255 255 255 / 10%);
  }

  .item .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    --mdc-icon-size: 24px;
    --state-icon-color: currentColor;
  }

  .item .text {
    flex: 1;
    min-width: 0;
  }

  .item .name {
    font-size: 17px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item .sub {
    font-size: 14px;
    color: var(--lf-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .muted {
    color: var(--lf-muted);
  }

  .glyph {
    font-size: 17px;
    font-weight: 600;
  }
`;
