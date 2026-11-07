import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { define } from './define';
import './editor/customize';
import './editor/picker';
import './editor/sheet';
import './editor/tile-editor';
import { normalizeTile, tileLabel } from './editor/layout';
import { clearLocal, describe, loadLocal, save, stableJson } from './editor/store';
import { openMoreInfo } from './entity';
import { kiosk, onKiosk, type KioskTheme } from './kiosk';
import './quick/assist';
import './quick/panel';
import { readBrightness, veilOpacity, writeBrightness } from './screen';
import { detectFlat } from './perf';
import type { GotoTarget } from './tiles/goto';
import { tokens } from './theme';
import { averageColor, backgroundUrl } from './tint';
import type { GridPageConfig, GridTileConfig, HomeAssistant, LuxFrameConfig, PageConfig } from './types';

const PAGE_HOLD_MS = 1000;
const PAGE_HOLD_TOLERANCE = 10;
/**
 * What a press on a page shouldn't start editing from: things with a hold or
 * drag of their own. A button only has a tap, so holding one starts editing
 * and the tap is dropped.
 */
const HOLDS_OWN = 'luxframe-tile, input, select, textarea, [role="slider"]';

const DEFAULT_HOME_AFTER = 120;
const PAGE_TYPES = ['clock', 'room', 'scenes', 'grid', 'weather', 'calendar', 'cameras', 'photos', 'night'];
const TOAST_MS = 4500;
/** A pull from the top edge this far opens the quick panel. */
const PULL_OPEN = 60;
const EDGE_HOLD_MS = 1000;

/** An editor sheet open over the frame; `page` indexes `config.pages`. */
type Sheet =
  | { kind: 'tile'; page: number; index: number }
  | { kind: 'add'; page: number }
  | { kind: 'replace'; page: number; index: number }
  | { kind: 'customize' }
  | { kind: 'pin' };

/**
 * The frame: a full-height, horizontally swipeable row of pages with dots.
 * Swiping is native CSS scroll-snap, so it feels like the platform on touch
 * and also works with a trackpad, mouse wheel, the dots or arrow keys.
 *
 * Holding a grid page starts editing: the pages show a draft until Done
 * saves it (to the dashboard, or to this tablet) or Cancel drops it.
 */
export class LuxFrameCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _index: { state: true },
    _kioskDark: { state: true },
    _hideHeader: { state: true },
    _detail: { state: true },
    _editing: { state: true },
    _draft: { state: true },
    _sheet: { state: true },
    _saving: { state: true },
    _local: { state: true },
    _toast: { state: true },
    _quick: { state: true },
    _pull: { state: true },
    _assist: { state: true },
    _brightness: { state: true },
    _slow: { state: true },
  };

  declare hass?: HomeAssistant;
  declare _config?: LuxFrameConfig;
  declare _index: number;
  declare _kioskDark?: boolean;
  declare _hideHeader: boolean;
  /** The entity whose detail view is open over the pages. */
  declare _detail?: string;
  /** Rearranging on the tablet: pages show `_draft` until Done or Cancel. */
  declare _editing: boolean;
  declare _draft?: LuxFrameConfig;
  declare _sheet?: Sheet;
  declare _saving: boolean;
  /** Showing this tablet's own saved layout instead of the dashboard's. */
  declare _local: boolean;
  declare _toast?: string;
  /** The quick panel is out; `_pull` is how much of it is still above the top while pulled. */
  declare _quick: boolean;
  declare _pull: number;
  declare _assist: boolean;
  /** Screen brightness 10–100. */
  declare _brightness: number;
  /** This device can't blur, or blurs too slowly: `style: auto` goes flat. */
  declare _slow: boolean;

  private _edge?: { y: number; id: number; timer: number; pulling: boolean; height: number; dy: number };
  /** The config as the dashboard has it; edits are saved against this. */
  private _base?: LuxFrameConfig;
  private _toastTimer?: number;
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
    this._editing = false;
    this._saving = false;
    this._local = false;
    this._quick = false;
    this._pull = 0;
    this._assist = false;
    this._brightness = 100;
    this._slow = false;
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
      if (!page || !PAGE_TYPES.includes(page.type)) {
        throw new Error(`Page ${i + 1} has an unknown type "${page?.type}".`);
      }
    });
    if (config.theme && !['auto', 'light', 'dark', 'ha'].includes(config.theme)) {
      throw new Error(`Unknown theme "${config.theme}". Use auto, light, dark or ha.`);
    }
    if (config.style && !['auto', 'glass', 'flat'].includes(config.style)) {
      throw new Error(`Unknown style "${config.style}". Use auto, glass or flat.`);
    }
    this._base = config;
    const local = loadLocal(config);
    this._local = !!local;
    this._config = local ?? config;
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
    this.addEventListener('luxframe-edit-start', this._startEditing);
    this.addEventListener('luxframe-goto', this._onGoto);
    detectFlat((slow) => (this._slow = slow));
    if (kiosk) this._connectKiosk();
    readBrightness().then((level) => (this._brightness = level));
    this._resetIdle();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._media.removeEventListener('change', this._requestThemeUpdate);
    this.removeEventListener('pointerdown', this._resetIdle);
    this.removeEventListener('keydown', this._onKey);
    this.removeEventListener('luxframe-open-detail', this._onOpenDetail);
    this.removeEventListener('luxframe-edit-start', this._startEditing);
    this.removeEventListener('luxframe-goto', this._onGoto);
    window.clearTimeout(this._toastTimer);
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
    this.toggleAttribute('ha-theme', this._shown?.theme === 'ha');
    const style = this._shown?.style ?? 'auto';
    this.toggleAttribute('flat', style === 'flat' || (style === 'auto' && this._slow));
    if (changed.has('_config') || changed.has('_draft')) {
      this.goTo(Math.min(this._index, this._pages.length - 1), false);
      this._applyTint();
    }
  }

  private _applyTint(): void {
    const { tint, background } = this._shown ?? {};
    if (tint) this.style.setProperty('--lf-tint-config', tint);
    else this.style.removeProperty('--lf-tint-config');

    this.style.removeProperty('--lf-tint-auto');
    const url = backgroundUrl(background);
    if (!tint && url) {
      averageColor(url).then((color) => {
        if (color && backgroundUrl(this._shown?.background) === url) {
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

  /** The config on screen: the draft while editing. */
  private get _shown(): LuxFrameConfig | undefined {
    return (this._editing && this._draft) || this._config;
  }

  /** Pages in the frame, with their index in `config.pages`. Hidden ones are left out. */
  private get _visible(): Array<{ page: PageConfig; i: number }> {
    const all = (this._shown?.pages ?? []).map((page, i) => ({ page, i }));
    const visible = all.filter(({ page }) => !page.hidden);
    return visible.length ? visible : all;
  }

  private get _pages(): PageConfig[] {
    return this._visible.map(({ page }) => page);
  }

  private get _isDark(): boolean {
    const mode = this._shown?.theme ?? 'auto';
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
    if (this._editing) return;
    this._detail = undefined;
    this._quick = false;
    this._assist = false;
    this.goTo(0, smooth);
  }

  private _resetIdle = (): void => {
    window.clearTimeout(this._idleTimer);
    if (this._editing) return;
    const seconds = this._config?.home_after ?? DEFAULT_HOME_AFTER;
    if (seconds > 0) {
      this._idleTimer = window.setTimeout(() => this._goHome(), seconds * 1000);
    }
  };

  private _onOpenDetail = (e: Event): void => {
    e.preventDefault(); // claimed: the opener won't fall back to HA's dialog
    e.stopPropagation();
    if (this._editing) return;
    this._detail = (e as CustomEvent<{ entityId: string }>).detail.entityId;
  };

  /** A tile asking for a page: the first visible one of that type or title. */
  private _onGoto = (e: Event): void => {
    if (this._editing) return;
    const { type, title } = (e as CustomEvent<GotoTarget>).detail;
    const index = this._visible.findIndex(
      ({ page }) =>
        (!type || page.type === type) &&
        (!title || ('title' in page && page.title?.toLowerCase() === title.toLowerCase())),
    );
    if (index < 0) return;
    e.preventDefault();
    this._quick = false;
    this.goTo(index);
  };

  private _onMore(e: CustomEvent<{ entityId: string }>): void {
    this._detail = undefined;
    openMoreInfo(this, e.detail.entityId);
  }

  private _onKey = (e: KeyboardEvent): void => {
    if (this._detail || this._sheet || this._quick || this._assist) return;
    if (e.composedPath()[0] instanceof HTMLInputElement) return;
    if (e.key === 'ArrowRight') this.goTo(this._index + 1);
    else if (e.key === 'ArrowLeft') this.goTo(this._index - 1);
    else return;
    e.preventDefault();
    this._resetIdle();
  };

  // ---- Quick panel and Assist ----------------------------------------------

  private get _quickConfig() {
    const config = this._shown?.quick_panel;
    return config === false ? undefined : (config ?? {});
  }

  private get _assistEnabled(): boolean {
    return this._shown?.assist !== false;
  }

  private get _panelHeight(): number {
    const panel = this.renderRoot
      .querySelector('luxframe-quick-panel')
      ?.shadowRoot?.querySelector('.panel') as HTMLElement | null | undefined;
    return panel?.offsetHeight || 360;
  }

  // The strip along the top edge: pull down for the panel, tap for it too,
  // hold for Assist.
  private _edgeDown(e: PointerEvent): void {
    if (e.button !== 0 || this._editing) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Pointer already gone.
    }
    this._edge = {
      y: e.clientY,
      id: e.pointerId,
      pulling: false,
      height: 0,
      dy: 0,
      timer: window.setTimeout(() => {
        if (!this._edge || this._edge.pulling) return;
        this._edge = undefined;
        if (this._assistEnabled) this._openAssist();
      }, EDGE_HOLD_MS),
    };
  }

  private _edgeMove(e: PointerEvent): void {
    const edge = this._edge;
    if (!edge || e.pointerId !== edge.id) return;
    edge.dy = Math.max(0, e.clientY - edge.y);
    if (!edge.pulling) {
      if (edge.dy < 10) return;
      window.clearTimeout(edge.timer);
      edge.pulling = true;
      this._pull = 2000; // fully hidden until its height is known
      this._quick = true;
      return;
    }
    edge.height ||= this._panelHeight;
    this._pull = Math.max(0, edge.height - edge.dy);
  }

  private _edgeUp(e: PointerEvent): void {
    const edge = this._edge;
    if (!edge || e.pointerId !== edge.id) return;
    window.clearTimeout(edge.timer);
    this._edge = undefined;
    if (!edge.pulling) {
      // A tap on the edge opens it too.
      this._pull = 0;
      this._quick = true;
    } else if (edge.dy >= PULL_OPEN) {
      this._pull = 0;
    } else {
      this._quick = false;
      this._pull = 0;
    }
  }

  private _openAssist(): void {
    this._quick = false;
    this._assist = true;
  }

  private _setBrightness(level: number): void {
    this._brightness = level;
    writeBrightness(level);
  }

  // ---- Holding a page to start editing ----------------------------------------
  //
  // A grid page starts editing itself when a tile or its background is held.
  // Every other page (clock, weather, calendar…) has nothing of its own to
  // hold, so holding still anywhere on it for a second starts editing too,
  // camera stills and buttons included. A tile or slider keeps its own hold:
  // holding a tile on a room page still opens its details.

  private _pageHold?: { x: number; y: number; timer: number };
  /** The release after a hold that started editing isn't also a tap. */
  private _swallowClick = false;

  private _pageDown = (e: PointerEvent): void => {
    this._pageUp();
    this._swallowClick = false;
    if (this._editing || e.button !== 0 || !this._config) return;
    const own = e
      .composedPath()
      .some((el) => el instanceof Element && (el.localName === 'luxframe-grid' || el.matches(HOLDS_OWN)));
    if (own) return;
    this._pageHold = {
      x: e.clientX,
      y: e.clientY,
      timer: window.setTimeout(() => {
        this._pageHold = undefined;
        this._swallowClick = true;
        this._startEditing();
      }, PAGE_HOLD_MS),
    };
  };

  private _pageMove = (e: PointerEvent): void => {
    const hold = this._pageHold;
    if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > PAGE_HOLD_TOLERANCE) this._pageUp();
  };

  private _pageUp = (): void => {
    if (this._pageHold) window.clearTimeout(this._pageHold.timer);
    this._pageHold = undefined;
  };

  private _pageClick = {
    capture: true,
    handleEvent: (e: Event): void => {
      if (!this._swallowClick) return;
      this._swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  // ---- Editing on the tablet ------------------------------------------------

  private _startEditing = (): void => {
    if (this._editing || !this._config) return;
    this._detail = undefined;
    this._draft = structuredClone(this._config);
    this._editing = true;
    this._resetIdle();
  };

  private _cancelEditing(): void {
    this._sheet = undefined;
    this._editing = false;
    this._draft = undefined;
    this._resetIdle();
  }

  private async _finishEditing(): Promise<void> {
    const draft = this._draft;
    if (!draft || !this._base || this._saving) return;
    this._sheet = undefined;
    if (stableJson(draft) === stableJson(this._config)) return this._cancelEditing();

    this._saving = true;
    const result = await save(this.hass, this._base, draft);
    this._saving = false;
    // Home Assistant hands the saved config back through setConfig shortly;
    // until then, show the draft.
    this._config = draft;
    this._local = result.where === 'tablet';
    this._cancelEditing();
    this._showToast(describe(result));
  }

  private _useDashboardLayout(): void {
    if (!this._base) return;
    clearLocal(this._base);
    this._local = false;
    this._config = this._base;
    this._draft = structuredClone(this._base);
    this._showToast("This tablet now uses the dashboard's layout");
  }

  private _showToast(message: string): void {
    window.clearTimeout(this._toastTimer);
    this._toast = message;
    this._toastTimer = window.setTimeout(() => (this._toast = undefined), TOAST_MS);
  }

  private _gridAt(page: number): GridPageConfig | undefined {
    const config = this._draft?.pages[page];
    return config?.type === 'grid' ? config : undefined;
  }

  private _setTiles(page: number, tiles: Array<GridTileConfig | string>): void {
    const grid = this._gridAt(page);
    if (!grid || !this._draft) return;
    const pages = [...this._draft.pages];
    pages[page] = { ...grid, tiles };
    this._draft = { ...this._draft, pages };
  }

  private _tileSheetEvent(page: number, index: number, e: CustomEvent): void {
    const tiles = [...(this._gridAt(page)?.tiles ?? [])];
    switch (e.type) {
      case 'change':
        tiles[index] = e.detail.tile;
        break;
      case 'move': {
        const to = index + (e.detail as number);
        const [tile] = tiles.splice(index, 1);
        tiles.splice(to, 0, tile);
        this._sheet = { kind: 'tile', page, index: to };
        break;
      }
      case 'remove':
        tiles.splice(index, 1);
        this._sheet = undefined;
        break;
      case 'replace':
        this._sheet = { kind: 'replace', page, index };
        return;
    }
    this._setTiles(page, tiles);
  }

  private _picked(tile: GridTileConfig | string): void {
    const sheet = this._sheet;
    if (sheet?.kind === 'pin' && this._draft) {
      const entity = typeof tile === 'string' ? tile : 'entity' in tile ? tile.entity : undefined;
      const quick = this._draft.quick_panel || {};
      if (entity && !quick.pinned?.includes(entity)) {
        this._draft = { ...this._draft, quick_panel: { ...quick, pinned: [...(quick.pinned ?? []), entity] } };
      }
      this._sheet = { kind: 'customize' };
      return;
    }
    if (!sheet || (sheet.kind !== 'add' && sheet.kind !== 'replace')) return;
    const tiles = [...(this._gridAt(sheet.page)?.tiles ?? [])];
    if (sheet.kind === 'add') {
      tiles.push(tile);
      // An empty card tile is for pasting YAML, so go straight to that.
      this._sheet =
        typeof tile !== 'string' && tile.type === 'card' && !tile.card?.type
          ? { kind: 'tile', page: sheet.page, index: tiles.length - 1 }
          : undefined;
    } else {
      // A new choice keeps the tile's size.
      const size = normalizeTile(tiles[sheet.index]).size;
      tiles[sheet.index] = size ? { ...normalizeTile(tile), size } : tile;
      this._sheet = { kind: 'tile', page: sheet.page, index: sheet.index };
    }
    this._setTiles(sheet.page, tiles);
  }

  private _renderEditBar() {
    const current = this._visible[this._index];
    const onGrid = current?.page.type === 'grid';
    return html`
      <div class="editbar" role="toolbar" aria-label="Editing">
        <div class="group">
          ${onGrid
            ? html`<button class="bar-btn" @click=${() => (this._sheet = { kind: 'add', page: current.i })}>
                + Add tile
              </button>`
            : nothing}
          <button class="bar-btn" @click=${() => (this._sheet = { kind: 'customize' })}>Customize</button>
        </div>
        <div class="group">
          <button class="bar-btn" ?disabled=${this._saving} @click=${this._cancelEditing}>Cancel</button>
          <button class="bar-btn primary" ?disabled=${this._saving} @click=${this._finishEditing}>
            ${this._saving ? 'Saving…' : 'Done'}
          </button>
        </div>
      </div>
    `;
  }

  private _renderSheet() {
    const sheet = this._sheet;
    const draft = this._draft;
    if (!sheet || !draft) return nothing;
    const close = () => (this._sheet = undefined);

    if (sheet.kind === 'customize') {
      return html`<luxframe-sheet heading="Customize" wide @close=${close}>
        <luxframe-customize
          .hass=${this.hass}
          .config=${draft}
          .page=${this._visible[this._index]?.i ?? 0}
          ?local=${this._local}
          @change=${(e: CustomEvent) => (this._draft = e.detail.config)}
          @reset=${this._useDashboardLayout}
          @pin=${() => (this._sheet = { kind: 'pin' })}
        ></luxframe-customize>
      </luxframe-sheet>`;
    }
    if (sheet.kind === 'pin') {
      return html`<luxframe-sheet heading="Pin to the quick panel"
        @close=${() => (this._sheet = { kind: 'customize' })}>
        <luxframe-picker .hass=${this.hass} entities-only
          @pick=${(e: CustomEvent) => this._picked(e.detail.tile)}></luxframe-picker>
      </luxframe-sheet>`;
    }
    if (sheet.kind === 'add' || sheet.kind === 'replace') {
      const back = sheet.kind === 'add' ? close : () => (this._sheet = { ...sheet, kind: 'tile' });
      return html`<luxframe-sheet heading=${sheet.kind === 'add' ? 'Add a tile' : 'Show on this tile'}
        @close=${back}>
        <luxframe-picker .hass=${this.hass} @pick=${(e: CustomEvent) => this._picked(e.detail.tile)}>
        </luxframe-picker>
      </luxframe-sheet>`;
    }
    const tiles = this._gridAt(sheet.page)?.tiles ?? [];
    const tile = tiles[sheet.index];
    if (tile === undefined) return nothing;
    const on = (e: CustomEvent) => this._tileSheetEvent(sheet.page, sheet.index, e);
    return html`<luxframe-sheet heading=${tileLabel(this.hass, tile)} @close=${close}>
      <luxframe-tile-editor
        .hass=${this.hass}
        .tile=${tile}
        ?first=${sheet.index === 0}
        ?last=${sheet.index === tiles.length - 1}
        .columns=${this._gridAt(sheet.page)?.columns ?? 4}
        @change=${on}
        @move=${on}
        @remove=${on}
        @replace=${on}
      ></luxframe-tile-editor>
    </luxframe-sheet>`;
  }

  // ---- Paging -------------------------------------------------------------

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

  private _renderPage(page: PageConfig, i: number) {
    switch (page.type) {
      case 'clock':
        return html`<luxframe-clock .hass=${this.hass} .config=${page}></luxframe-clock>`;
      case 'room':
        return html`<luxframe-room .hass=${this.hass} .config=${page}></luxframe-room>`;
      case 'scenes':
        return html`<luxframe-scenes .hass=${this.hass} .config=${page}></luxframe-scenes>`;
      case 'weather':
        return html`<luxframe-weather-page .hass=${this.hass} .config=${page}></luxframe-weather-page>`;
      case 'calendar':
        return html`<luxframe-calendar-page .hass=${this.hass} .config=${page}></luxframe-calendar-page>`;
      case 'cameras':
        return html`<luxframe-cameras-page .hass=${this.hass} .config=${page}></luxframe-cameras-page>`;
      case 'photos':
        return html`<luxframe-photos-page .hass=${this.hass} .config=${page}></luxframe-photos-page>`;
      case 'night':
        return html`<luxframe-night-page .hass=${this.hass} .config=${page}></luxframe-night-page>`;
      case 'grid':
        return html`<luxframe-grid
          .hass=${this.hass}
          .config=${page}
          ?editing=${this._editing}
          @luxframe-tiles-change=${(e: CustomEvent) => this._setTiles(i, e.detail.tiles)}
          @luxframe-tile-edit=${(e: CustomEvent) =>
            (this._sheet = { kind: 'tile', page: i, index: e.detail.index })}
          @luxframe-add-tile=${() => (this._sheet = { kind: 'add', page: i })}
        ></luxframe-grid>`;
    }
  }

  protected render() {
    const config = this._shown;
    if (!config) return nothing;
    const height =
      config.height ?? (this._hideHeader ? '100dvh' : 'calc(100dvh - var(--header-height, 0px))');
    const visible = this._visible;
    const style = config.background
      ? `height: ${height}; --lf-backdrop: ${config.background}`
      : `height: ${height}`;

    return html`
      <div class="frame" style=${style} tabindex="0">
        <div
          class="track"
          @scroll=${this._onScroll}
          @scrollend=${this._onScrollEnd}
          @pointerdown=${this._pageDown}
          @pointermove=${this._pageMove}
          @pointerup=${this._pageUp}
          @pointercancel=${this._pageUp}
          @click=${this._pageClick}
          @contextmenu=${(e: Event) => this._pageHold && e.preventDefault()}
        >
          ${visible.map(
            ({ page, i }, n) => html`
              <section class="page" aria-label="Page ${n + 1} of ${visible.length}">
                ${this._renderPage(page, i)}
              </section>
            `,
          )}
        </div>
        ${visible.length > 1
          ? html`
              <nav class="dots">
                ${visible.map(
                  (_, n) => html`
                    <button
                      class=${n === this._index ? 'dot on' : 'dot'}
                      aria-label="Go to page ${n + 1}"
                      aria-current=${n === this._index ? 'page' : 'false'}
                      @click=${() => this.goTo(n)}
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
        ${this._quickConfig && !this._editing
          ? html`<div
              class="edge"
              role="button"
              tabindex="0"
              aria-label="Quick controls. Pull down, or hold to ask Home Assistant."
              @pointerdown=${this._edgeDown}
              @pointermove=${this._edgeMove}
              @pointerup=${this._edgeUp}
              @pointercancel=${this._edgeUp}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  this._quick = true;
                }
              }}
            ><span class="handle"></span></div>`
          : nothing}
        ${this._quick && this._quickConfig
          ? html`<luxframe-quick-panel
              .hass=${this.hass}
              .config=${this._quickConfig}
              .brightness=${this._brightness}
              .offset=${this._pull}
              ?assist=${this._assistEnabled}
              @close=${() => (this._quick = false)}
              @brightness=${(e: CustomEvent<number>) => this._setBrightness(e.detail)}
              @ask=${this._openAssist}
            ></luxframe-quick-panel>`
          : nothing}
        ${this._assist
          ? html`<luxframe-sheet heading="Ask Home Assistant" wide @close=${() => (this._assist = false)}>
              <luxframe-assist
                .hass=${this.hass}
                .agentId=${typeof this._shown?.assist === 'object' ? this._shown.assist.agent_id : undefined}
              ></luxframe-assist>
            </luxframe-sheet>`
          : nothing}
        ${this._editing ? this._renderEditBar() : nothing} ${this._renderSheet()}
        ${this._toast ? html`<div class="toast" role="status">${this._toast}</div>` : nothing}
        <div class="veil" style="opacity: ${veilOpacity(this._brightness)}"></div>
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

      .edge {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 4;
        height: 28px;
        display: flex;
        justify-content: center;
        touch-action: none;
        outline: none;
        cursor: grab;
      }

      .handle {
        width: 44px;
        height: 5px;
        margin-top: 8px;
        border-radius: 3px;
        background: var(--lf-faint);
        opacity: 0.7;
      }

      .edge:focus-visible .handle {
        outline: 3px solid var(--lf-accent);
        outline-offset: 3px;
      }

      .veil {
        position: absolute;
        inset: 0;
        z-index: 50;
        background: #000;
        pointer-events: none;
        transition: opacity 150ms;
      }

      .editbar {
        position: absolute;
        top: max(16px, calc(var(--lf-pad) / 2));
        left: var(--lf-pad);
        right: var(--lf-pad);
        z-index: 5;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        pointer-events: none;
      }

      .group {
        display: flex;
        gap: 10px;
        pointer-events: auto;
      }

      .bar-btn {
        min-height: 48px;
        padding: 0 22px;
        border: 0;
        border-radius: 999px;
        font: inherit;
        font-size: 17px;
        font-weight: 600;
        color: var(--lf-text);
        background: var(--lf-surface);
        -webkit-backdrop-filter: var(--lf-blur);
        backdrop-filter: var(--lf-blur);
        box-shadow: var(--lf-shadow);
        cursor: pointer;
      }

      .bar-btn.primary {
        color: var(--lf-text-active);
        background: var(--lf-surface-active);
      }

      .bar-btn:disabled {
        opacity: 0.6;
        cursor: default;
      }

      .bar-btn:focus-visible {
        outline: 3px solid var(--lf-accent);
        outline-offset: 2px;
      }

      .toast {
        position: absolute;
        left: 50%;
        bottom: 52px;
        z-index: 30;
        transform: translateX(-50%);
        max-width: min(560px, calc(100% - 32px));
        padding: 12px 22px;
        border-radius: 999px;
        font-size: 16px;
        text-align: center;
        color: var(--lf-text-active);
        background: var(--lf-surface-active);
        box-shadow: 0 8px 24px rgb(0 0 0 / 25%);
        animation: toast 220ms ease-out;
      }

      @keyframes toast {
        from {
          opacity: 0;
          transform: translate(-50%, 12px);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .track {
          scroll-behavior: auto;
        }

        .toast {
          animation: none;
        }
      }
    `,
  ];
}

define('luxframe-card', LuxFrameCard);
