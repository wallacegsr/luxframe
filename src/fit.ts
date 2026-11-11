import { LitElement, css, html, type PropertyValues } from 'lit';
import { define } from './define';

/** Below this, a shrunk card would be too small to read; it scrolls instead. */
const SMALLEST = 0.55;

/**
 * Its contents, drawn `size` times their normal size and, with `shrink`,
 * smaller still until they fit the box. Shrunk with CSS zoom, the contents
 * lay out again at the narrower size, so text wraps less and a card fits in
 * fewer steps than a picture would. `scroll` keeps them at `size` and scrolls.
 */
export class LuxFrameFit extends LitElement {
  static properties = {
    mode: { reflect: true },
    size: { type: Number },
    center: { type: Boolean, reflect: true },
  };

  /** `shrink` (default) or `scroll`. */
  declare mode: 'shrink' | 'scroll';
  /** The largest the contents are drawn; 1 is their normal size. */
  declare size: number;
  /** Centered top to bottom when there's room to spare. */
  declare center: boolean;

  private _observer?: ResizeObserver;
  private _frame = 0;

  constructor() {
    super();
    this.mode = 'shrink';
    this.size = 1;
    this.center = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._observer = new ResizeObserver(() => this._schedule());
    this._observer.observe(this);
    if (this.hasUpdated) this._watchContent();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._observer?.disconnect();
    this._observer = undefined;
    cancelAnimationFrame(this._frame);
  }

  protected firstUpdated(): void {
    this._watchContent();
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has('mode') || changed.has('size')) this._fit();
  }

  private get _content(): HTMLElement | null {
    return this.renderRoot.querySelector('.content');
  }

  private _watchContent(): void {
    const content = this._content;
    if (content) this._observer?.observe(content);
  }

  private _schedule(): void {
    cancelAnimationFrame(this._frame);
    this._frame = requestAnimationFrame(() => this._fit());
  }

  /**
   * Shrinking widens the layout, which only ever makes the contents shorter,
   * so shrinking by the share they overflow always fits; a few halvings
   * between that and full size then bring them close to filling the box.
   */
  private _fit(): void {
    const content = this._content;
    if (!content) return;
    const base = Number.isFinite(this.size) && this.size > 0 ? this.size : 1;
    const zoom = (s: number) => {
      content.style.zoom = String(s);
      return content.getBoundingClientRect().height;
    };
    if (this.mode === 'scroll') {
      zoom(base);
      this.toggleAttribute('overflowing', false);
      return;
    }
    const room = this.clientHeight;
    const fits = (h: number) => h <= room + 0.5;
    let height = zoom(base);
    if (room <= 0 || fits(height)) {
      this.toggleAttribute('overflowing', false);
      return;
    }
    // A first guess that always fits, then closer to filling the box.
    let lo = Math.max(SMALLEST, (base * room) / height - 0.002);
    let hi = base;
    height = zoom(lo);
    if (fits(height)) {
      for (let i = 0; i < 6 && hi - lo > 0.01; i++) {
        const mid = (lo + hi) / 2;
        if (fits(zoom(mid))) lo = mid;
        else hi = mid;
      }
      height = zoom(lo);
    }
    this.toggleAttribute('overflowing', height > room + 0.5);
  }

  protected render() {
    return html`<div class="content"><slot></slot></div>`;
  }

  static styles = css`
    :host {
      display: block;
      min-height: 0;
      overflow: hidden;
    }

    :host([center]) {
      display: flex;
      flex-direction: column;
      justify-content: safe center;
    }

    :host([mode='scroll']),
    :host([overflowing]) {
      overflow-y: auto;
      overscroll-behavior-y: contain;
    }
  `;
}

define('luxframe-fit', LuxFrameFit);
