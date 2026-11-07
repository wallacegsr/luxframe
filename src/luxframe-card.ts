import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { define } from './define';
import { openMoreInfo } from './entity';
import { kiosk, onKiosk, type KioskTheme } from './kiosk';
import { tokens } from './theme';
import { averageColor, backgroundUrl } from './tint';
import type { HomeAssistant, LuxFrameConfig, PageConfig } from './types';

const DEFAULT_HOME_AFTER = 120;

/**
 * The frame: a full-height, horizontally swipeable row of pages with dots.
 * Swiping is native CSS scroll-snap, so it feels like the platform on touch
 * and also works with a trackpad, mouse wheel, the dots or arrow keys.
 */
export class LuxFrameCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _index: { state: true },
    _kioskDark: { state: true },
    _hideHeader: { state: true },
    _detail: { state: true },
  };

  declare hass?: HomeAssistant;
  declare _config?: LuxFrameConfig;
  declare _index: number;
  declare _kioskDark?: boolean;
  declare _hideHeader: boolean;
  /** The entity whose detail view is open over the pages. */
  declare _detail?: string;

  private _idleTimer?: number;
  private _scrollFrame?: number;
  private _target?: number;
  private _resize?: ResizeObserver;
  private _unsubs: Array<() => void> = [];
  private _media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    super();
    this._index = 0;
    this._hideHeader = false;
  }

  static getStubConfig(): LuxFrameConfig {
    return {
      type: 'custom:luxframe-card',
      pages: [{ type: 'clock' }],
    };
  }

  setConfig(config: LuxFrameConfig): void {
    if (!config || !Array.isArray(config.pages) || config.pages.length === 0) {
      throw new Error('LuxFrame needs at least one entry under `pages`.');
    }
    config.pages.forEach((page, i) => {
      if (!page || !['clock', 'room', 'scenes', 'grid'].includes(page.type)) {
        throw new Error(`Page ${i + 1} has an unknown type "${page?.type}".`);
      }
    });
    if (config.theme && !['auto', 'light', 'dark', 'ha'].includes(config.theme)) {
      throw new Error(`Unknown theme "${config.theme}". Use auto, light, dark or ha.`);
    }
    this._config = config;
  }

  getCardSize(): number {
    return 12;
  }

  getGridOptions() {
    return { columns: 'full', rows: 'auto' };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._media.addEventListener('change', this._requestThemeUpdate);
    this.addEventListener('pointerdown', this._resetIdle);
    this.addEventListener('keydown', this._onKey);
    this.addEventListener('luxframe-open-detail', this._onOpenDetail);
    if (kiosk) this._connectKiosk();
    this._resetIdle();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._media.removeEventListener('change', this._requestThemeUpdate);
    this.removeEventListener('pointerdown', this._resetIdle);
    this.removeEventListener('keydown', this._onKey);
    this.removeEventListener('luxframe-open-detail', this._onOpenDetail);
    this._unsubs.forEach((off) => off());
    this._unsubs = [];
    this._resize?.disconnect();
    window.clearTimeout(this._idleTimer);
  }

  protected firstUpdated(): void {
    // Keep the current page in place when the tablet rotates.
    this._resize = new ResizeObserver(() => this.goTo(this._index, false));
    this._resize.observe(this._track);
  }

  protected updated(changed: PropertyValues): void {
    this.toggleAttribute('dark', this._isDark);
    this.toggleAttribute('ha-theme', this._config?.theme === 'ha');
    if (changed.has('_config')) {
      this.goTo(Math.min(this._index, this._pages.length - 1), false);
      this._applyTint();
    }
  }

  private _applyTint(): void {
    const { tint, background } = this._config ?? {};
    if (tint) this.style.setProperty('--lf-tint-config', tint);
    else this.style.removeProperty('--lf-tint-config');

    this.style.removeProperty('--lf-tint-auto');
    const url = backgroundUrl(background);
    if (!tint && url) {
      averageColor(url).then((color) => {
        if (color && backgroundUrl(this._config?.background) === url) {
          this.style.setProperty('--lf-tint-auto', color);
        }
      });
    }
  }

  /** Scrolls to page `index`; out-of-range values clamp. */
  goTo(index: number, smooth = true): void {
    const track = this._track;
    if (!track) return;
    const target = Math.max(0, Math.min(index, this._pages.length - 1));
    this._target = smooth ? target : undefined;
    track.scrollTo({ left: target * track.clientWidth, behavior: smooth ? 'smooth' : 'instant' });
    this._index = target;
  }

  private get _track(): HTMLElement {
    return this.renderRoot.querySelector('.track') as HTMLElement;
  }

  private get _pages(): PageConfig[] {
    return this._config?.pages ?? [];
  }

  private get _isDark(): boolean {
    const mode = this._config?.theme ?? 'auto';
    if (mode === 'light' || mode === 'dark') return mode === 'dark';
    if (this._kioskDark !== undefined) return this._kioskDark;
    if (this.hass?.themes?.darkMode !== undefined) return this.hass.themes.darkMode;
    return this._media.matches;
  }

  private _requestThemeUpdate = () => this.requestUpdate();

  private _connectKiosk(): void {
    const applyTheme = (theme: KioskTheme | null) => {
      if (theme) this._kioskDark = theme.homeAssistant.dark;
    };
    kiosk!.getTheme().then(applyTheme);
    kiosk!.getKioskState().then((state) => {
      this._hideHeader = !!state?.haKioskMode?.hideHeader;
    });
    this._unsubs.push(
      onKiosk<KioskTheme>('theme', applyTheme),
      // Coming back from a screensaver or a dark screen should land on page one.
      onKiosk('screenon', () => this._goHome(false)),
      onKiosk('screensaverstop', () => this._goHome(false)),
    );
  }

  private _goHome(smooth = true): void {
    this._detail = undefined;
    this.goTo(0, smooth);
  }

  private _resetIdle = (): void => {
    window.clearTimeout(this._idleTimer);
    const seconds = this._config?.home_after ?? DEFAULT_HOME_AFTER;
    if (seconds > 0) {
      this._idleTimer = window.setTimeout(() => this._goHome(), seconds * 1000);
    }
  };

  private _onOpenDetail = (e: Event): void => {
    e.preventDefault(); // claimed: the opener won't fall back to HA's dialog
    e.stopPropagation();
    this._detail = (e as CustomEvent<{ entityId: string }>).detail.entityId;
  };

  private _onMore(e: CustomEvent<{ entityId: string }>): void {
    this._detail = undefined;
    openMoreInfo(this, e.detail.entityId);
  }

  private _onKey = (e: KeyboardEvent): void => {
    if (this._detail) return;
    if (e.key === 'ArrowRight') this.goTo(this._index + 1);
    else if (e.key === 'ArrowLeft') this.goTo(this._index - 1);
    else return;
    e.preventDefault();
    this._resetIdle();
  };

  private _onScroll(): void {
    if (this._scrollFrame) return;
    this._scrollFrame = requestAnimationFrame(() => {
      this._scrollFrame = undefined;
      const track = this._track;
      if (!track.clientWidth) return;
      const position = track.scrollLeft / track.clientWidth;
      // While goTo() animates, the target is already the index; following the
      // in-between positions would make repeated arrow presses fall short.
      if (this._target !== undefined) {
        if (Math.abs(position - this._target) < 0.01) this._target = undefined;
        return;
      }
      this._index = Math.round(position);
    });
  }

  private _onScrollEnd(): void {
    this._target = undefined;
    const track = this._track;
    if (track.clientWidth) this._index = Math.round(track.scrollLeft / track.clientWidth);
  }

  private _renderPage(page: PageConfig) {
    switch (page.type) {
      case 'clock':
        return html`<luxframe-clock .hass=${this.hass} .config=${page}></luxframe-clock>`;
      case 'room':
        return html`<luxframe-room .hass=${this.hass} .config=${page}></luxframe-room>`;
      case 'scenes':
        return html`<luxframe-scenes .hass=${this.hass} .config=${page}></luxframe-scenes>`;
      case 'grid':
        return html`<luxframe-grid .hass=${this.hass} .config=${page}></luxframe-grid>`;
    }
  }

  protected render() {
    if (!this._config) return nothing;
    const height =
      this._config.height ??
      (this._hideHeader ? '100dvh' : 'calc(100dvh - var(--header-height, 0px))');
    const pages = this._pages;
    const style = this._config.background
      ? `height: ${height}; --lf-backdrop: ${this._config.background}`
      : `height: ${height}`;

    return html`
      <div class="frame" style=${style} tabindex="0">
        <div class="track" @scroll=${this._onScroll} @scrollend=${this._onScrollEnd}>
          ${pages.map(
            (page, i) => html`
              <section class="page" aria-label="Page ${i + 1} of ${pages.length}">
                ${this._renderPage(page)}
              </section>
            `,
          )}
        </div>
        ${pages.length > 1
          ? html`
              <nav class="dots">
                ${pages.map(
                  (_, i) => html`
                    <button
                      class=${i === this._index ? 'dot on' : 'dot'}
                      aria-label="Go to page ${i + 1}"
                      aria-current=${i === this._index ? 'page' : 'false'}
                      @click=${() => this.goTo(i)}
                    ></button>
                  `,
                )}
              </nav>
            `
          : nothing}
        ${this._detail
          ? html`<luxframe-detail
              .hass=${this.hass}
              .entityId=${this._detail}
              @close=${() => (this._detail = undefined)}
              @more=${this._onMore}
            ></luxframe-detail>`
          : nothing}
      </div>
    `;
  }

  static styles = [
    tokens,
    css`
      :host {
        display: block;
      }

      .frame {
        position: relative;
        overflow: hidden;
        background: var(--lf-backdrop);
        color: var(--lf-text);
        font-family: var(--lf-font);
        outline: none;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }

      .track {
        display: flex;
        height: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-snap-type: x mandatory;
        overscroll-behavior-x: contain;
        scrollbar-width: none;
      }

      .track::-webkit-scrollbar {
        display: none;
      }

      .page {
        flex: 0 0 100%;
        height: 100%;
        scroll-snap-align: start;
        scroll-snap-stop: always;
      }

      .dots {
        position: absolute;
        left: 50%;
        bottom: 14px;
        transform: translateX(-50%);
        display: flex;
        gap: 4px;
      }

      .dot {
        width: 24px;
        height: 24px;
        padding: 0;
        border: 0;
        background: none;
        cursor: pointer;
        display: grid;
        place-items: center;
      }

      .dot::after {
        content: '';
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--lf-faint);
        transition: background 200ms, transform 200ms;
      }

      .dot.on::after {
        background: var(--lf-text);
        transform: scale(1.15);
      }

      @media (prefers-reduced-motion: reduce) {
        .track {
          scroll-behavior: auto;
        }
      }
    `,
  ];
}

define('luxframe-card', LuxFrameCard);
