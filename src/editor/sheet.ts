import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { controls, sectionLabel } from '../theme';

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
          <button class="chip on done" @click=${this._close}>Done</button>
        </header>
        <div class="body"><slot></slot></div>
      </section>
      ${nothing}
    `;
  }

  static styles = [
    controls,
    css`
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
      animation: fade var(--lf-fast) ease-out;
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
      animation: pop var(--lf-move) var(--lf-ease);
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
      font-weight: 600;
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
  `,
  ];
}

define('luxframe-sheet', LuxFrameSheet);

/** Controls inside editor sheets: section labels, chips, steppers, fields, list rows. */
export const editorStyles = [
  controls,
  sectionLabel,
  css`
  :host {
    display: block;
    color: var(--lf-text);
    font-family: var(--lf-font);
  }

  h3 {
    margin: 18px 0 8px;
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

  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    background: var(--lf-control-row);
    padding: 4px;
  }

  .stepper button {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    font-size: 22px;
    line-height: 1;
    background: var(--lf-control);
  }

  .stepper output {
    min-width: 2ch;
    text-align: center;
    font-size: 17px;
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
  input[type='search'],
  select {
    box-sizing: border-box;
    width: 100%;
    min-height: 46px;
    padding: 0 14px;
    border: 0;
    border-radius: var(--lf-radius-s);
    font: inherit;
    font-size: 17px;
    color: var(--lf-text);
    background: var(--lf-control);
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
    border-radius: var(--lf-radius-s);
    text-align: left;
    background: transparent;
    box-sizing: border-box;
  }

  button.item:hover,
  button.item:active {
    background: var(--lf-control);
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
    font-size: 15px;
    color: var(--lf-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .glyph {
    font-size: 17px;
    font-weight: 600;
  }
`,
];
