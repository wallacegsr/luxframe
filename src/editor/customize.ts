import { LitElement, css, html, nothing } from 'lit';
import { alertOf, alertWhen } from '../alerts';
import { hasTitleBar } from '../badges';
import { dockKind, dockLabel, dockOf, normalizeDock } from '../quick/dock';
import { MAX_PINNED } from '../quick/panel';
import { define } from '../define';
import { zoomOf } from '../zoom';
import { domainOf, resolve } from '../entity';
import type {
  BadgeLook,
  GridPageConfig,
  HomeAssistant,
  QuickDockItem,
  LuxFrameConfig,
  NightPageConfig,
  PageConfig,
  QuickPanelConfig,
  WeatherPageConfig,
  XBloomPageConfig,
} from '../types';
import { PAGE_KINDS, TITLE_DEFAULTS, kindLabel, pageLabel, suggestPages } from './layout';
import { editorStyles } from './sheet';
import './photo-settings';
import type { PhotoSettings } from './photo-settings';

const THEMES: Array<{ value: NonNullable<LuxFrameConfig['theme']>; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'ha', label: 'HA theme' },
];

const TILE_STYLES: Array<{ value: NonNullable<LuxFrameConfig['tile_style']>; label: string }> = [
  { value: 'center', label: 'Centered' },
  { value: 'corner', label: 'Icon in the corner' },
];

/** Corner radii in px; unset follows the theme. */
const CORNERS: Array<{ value: number | undefined; label: string }> = [
  { value: undefined, label: 'From theme' },
  { value: 0, label: 'Square' },
  { value: 10, label: 'Slight' },
  { value: 22, label: 'Rounded' },
  { value: 32, label: 'Round' },
];

/** Seconds without a touch before going back to the start page; 0 stays put. */
const HOME_AFTER: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Never' },
  { value: 30, label: '30 sec' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 300, label: '5 min' },
  { value: 600, label: '10 min' },
  { value: 1800, label: '30 min' },
];
const DEFAULT_HOME_AFTER = 120;

/** Accent colors to choose from; unset is the theme's own. */
const ACCENTS: Array<{ value: string; label: string }> = [
  { value: '#ff9f0a', label: 'Orange' },
  { value: '#ffd60a', label: 'Yellow' },
  { value: '#30d158', label: 'Green' },
  { value: '#64d2ff', label: 'Teal' },
  { value: '#0a84ff', label: 'Blue' },
  { value: '#bf5af2', label: 'Purple' },
  { value: '#ff375f', label: 'Pink' },
];

/** The sheet's sections, one showing at a time. */
export type CustomizeSection = 'page' | 'pages' | 'quick' | 'look' | 'alerts' | 'tablet';

const SECTIONS: Array<{ id: CustomizeSection; label: string }> = [
  { id: 'page', label: 'This page' },
  { id: 'pages', label: 'Pages' },
  { id: 'quick', label: 'Quick panel' },
  { id: 'look', label: 'Look' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'tablet', label: 'This tablet' },
];

/** A row being dragged to a new place in its list. */
interface Drag {
  list: 'pages' | 'dock';
  from: number;
  to: number;
  count: number;
  /** How far the pointer has moved, and one row's height, in px. */
  dy: number;
  height: number;
  startY: number;
  /** The frame's size, which the pointer's distance is divided by. */
  zoom: number;
}

const grip = html`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 8h14M5 12h14M5 16h14" /></svg>`;

/** "90" → "90 sec", "150" → "2.5 min": a value set in YAML that isn't a chip. */
function secondsLabel(s: number): string {
  return s < 60 ? `${s} sec` : `${Math.round((s / 60) * 10) / 10} min`;
}

/**
 * The frame's settings while editing: the current grid page's columns and
 * rows; the pages, with their names, which show and in what order; suggested
 * pages from Home Assistant's areas; and the look (theme, wallpaper, tint).
 * Fires `change` with the whole new config, `show-page` with a page just
 * added, and `reset` to drop this tablet's own layout.
 */
/** What a dock item opens, as its list row says. */
const DOCK_KINDS: Record<string, string> = {
  media: 'What\u2019s playing',
  entity: 'Controls',
  card: 'Home Assistant card',
  tile: 'LuxFrame tile',
};

export class LuxFrameCustomize extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    page: { type: Number },
    local: { type: Boolean },
    section: {},
    _drag: { state: true },
    _menu: { state: true },
    _settling: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: LuxFrameConfig;
  /** The page being looked at, as an index into `config.pages`. */
  declare page: number;
  /** True when this tablet is showing its own saved layout. */
  declare local: boolean;
  /** The section showing; left unset, this page's settings if it has any, else the pages. */
  declare section?: CustomizeSection;
  declare _drag?: Drag;
  /** The page whose "more" row is open, as an index into `config.pages`. */
  declare _menu?: number;
  /** Just after a drop, while the rows take their new places without animating. */
  declare _settling: boolean;

  /** A page just added whose name field wants the focus once it's drawn. */
  private _focusTitle?: number;

  constructor() {
    super();
    this.page = 0;
    this.local = false;
    this._settling = false;
  }

  protected updated(): void {
    if (this._focusTitle === undefined) return;
    const input = this.renderRoot.querySelector<HTMLInputElement>(`input.title[data-page="${this._focusTitle}"]`);
    if (!input) return;
    this._focusTitle = undefined;
    input.focus();
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  private _change(config: LuxFrameConfig): void {
    this.dispatchEvent(new CustomEvent('change', { detail: { config } }));
  }

  private _set(changes: Partial<LuxFrameConfig>): void {
    const next: Record<string, unknown> = { ...this.config!, ...changes };
    for (const [key, value] of Object.entries(changes)) if (value === undefined || value === '') delete next[key];
    this._change(next as unknown as LuxFrameConfig);
  }

  private _setPages(pages: PageConfig[]): void {
    this._set({ pages });
  }

  /** Makes a page the one the frame opens on; the first page needs no mark. */
  private _setHome(index: number): void {
    const pages = this.config!.pages.map((page, i) => {
      const { home: _, ...rest } = page;
      return i === index && index !== this.config!.pages.findIndex((p) => !p.hidden) ? { ...rest, home: true } : rest;
    }) as PageConfig[];
    this._setPages(pages);
  }

  private _setPage(
    index: number,
    changes: Partial<GridPageConfig> & PhotoSettings & { hidden?: boolean; home?: boolean },
  ): void {
    const pages = [...this.config!.pages];
    const next: Record<string, unknown> = { ...pages[index], ...changes };
    for (const [key, value] of Object.entries(changes)) if (value === undefined || value === '' || value === false) delete next[key];
    pages[index] = next as unknown as PageConfig;
    this._setPages(pages);
  }

  private _movePage(index: number, by: number): void {
    const pages = [...this.config!.pages];
    const to = index + by;
    if (to < 0 || to >= pages.length) return;
    const [page] = pages.splice(index, 1);
    pages.splice(to, 0, page);
    this._menu = undefined;
    this._setPages(pages);
  }

  private _grab(e: PointerEvent, list: Drag['list'], index: number, count: number): void {
    const handle = e.currentTarget as HTMLElement;
    const row = handle.closest('li');
    if (!row || count < 2) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    this._menu = undefined;
    // Rows are 2px apart.
    const zoom = zoomOf(row);
    this._drag = { list, from: index, to: index, count, dy: 0, zoom, height: row.getBoundingClientRect().height / zoom + 2, startY: e.clientY };
  }

  private _dragMove(e: PointerEvent): void {
    const d = this._drag;
    if (!d) return;
    const dy = (e.clientY - d.startY) / d.zoom;
    const to = Math.min(d.count - 1, Math.max(0, d.from + Math.round(dy / d.height)));
    this._drag = { ...d, dy, to };
  }

  private _drop(): void {
    const d = this._drag;
    if (!d) return;
    this._drag = undefined;
    if (d.to === d.from) return;
    // The rows land where they are, rather than sliding there from where the drag left them.
    this._settling = true;
    requestAnimationFrame(() => requestAnimationFrame(() => (this._settling = false)));
    if (d.list === 'pages') this._movePage(d.from, d.to - d.from);
    else this._moveDock(d.from, d.to - d.from);
  }

  /** The handle a row is dragged by; the arrow keys move it too. */
  private _grip(list: Drag['list'], index: number, count: number, label: string) {
    const move = (by: number) => (list === 'pages' ? this._movePage(index, by) : this._moveDock(index, by));
    return html`<button
      class="grip"
      aria-label="Move ${label}. Drag, or use the up and down arrow keys."
      ?disabled=${count < 2}
      @pointerdown=${(e: PointerEvent) => this._grab(e, list, index, count)}
      @pointermove=${this._dragMove}
      @pointerup=${this._drop}
      @pointercancel=${() => (this._drag = undefined)}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        move(e.key === 'ArrowUp' ? -1 : 1);
      }}
    >${grip}</button>`;
  }

  /** Where a row sits while one of its list is dragged: under the finger, or out of its way. */
  private _dragStyle(list: Drag['list'], index: number): string {
    const d = this._drag;
    if (!d || d.list !== list) return '';
    if (index === d.from) return `transform: translateY(${d.dy}px); z-index: 2; transition: none`;
    if (d.from < d.to && index > d.from && index <= d.to) return `transform: translateY(${-d.height}px)`;
    if (d.from > d.to && index < d.from && index >= d.to) return `transform: translateY(${d.height}px)`;
    return '';
  }

  /** A setting that's an entity: a list of the ones that would do. */
  private _entityRow(label: string, value: string | undefined, domains: string[], none: string, set: (id?: string) => void) {
    const options = Object.keys(this.hass?.states ?? {})
      .filter((id) => domains.includes(domainOf(id)))
      .sort((a, b) => resolve(this.hass, a).name.localeCompare(resolve(this.hass, b).name));
    // One set in YAML that Home Assistant doesn't have still shows.
    if (value && !options.includes(value)) options.unshift(value);
    return html`<label class="field">
      ${label}
      <select @change=${(e: Event) => set((e.target as HTMLSelectElement).value || undefined)}>
        <option value="" ?selected=${!value}>${none}</option>
        ${options.map((id) => html`<option value=${id} ?selected=${value === id}>${resolve(this.hass, id).name}</option>`)}
      </select>
    </label>`;
  }

  /**
   * Adds a page and shows it behind the sheet. A blank page of tiles has
   * nothing to tell it apart yet, so its name field is ready to type in.
   */
  private _addPage(page: PageConfig): void {
    const index = this.config!.pages.length;
    this._setPages([...this.config!.pages, structuredClone(page)]);
    if (page.type === 'grid') this._focusTitle = index;
    this.dispatchEvent(new CustomEvent('show-page', { detail: { page: index } }));
  }

  private _rename(index: number, input: HTMLInputElement): void {
    const page = this.config!.pages[index];
    const title = input.value.trim();
    // A room keeps a name: it has no other heading to fall back on.
    if (!title && page.type === 'room') {
      input.value = page.title;
      return;
    }
    this._setPage(index, { title });
  }

  private _removePage(index: number): void {
    const pages = [...this.config!.pages];
    pages.splice(index, 1);
    this._setPages(pages);
  }

  private _stepper(
    label: string,
    value: number,
    min: number,
    max: number,
    set: (v: number) => void,
    format: (v: number) => string = String,
    words: [string, string] = ['Fewer', 'More'],
  ) {
    return html`
      <div class="setting">
        <span>${label}</span>
        <div class="stepper" role="group" aria-label=${label}>
          <button aria-label="${words[0]} ${label.toLowerCase()}" ?disabled=${value <= min} @click=${() => set(value - 1)}>−</button>
          <output>${format(value)}</output>
          <button aria-label="${words[1]} ${label.toLowerCase()}" ?disabled=${value >= max} @click=${() => set(value + 1)}>+</button>
        </div>
      </div>
    `;
  }

  /** A setting that's on or off. */
  private _switch(label: string, on: boolean, set: (on: boolean) => void) {
    return html`<div class="setting">
      <span>${label}</span>
      <button class="switch" role="switch" aria-checked=${on} aria-label=${label} @click=${() => set(!on)}></button>
    </div>`;
  }

  /** The xBloom page's layout with xBloom Studio: the grid of its Brew and Manual tabs, and how big it's drawn. */
  private _renderXBloom(page: XBloomPageConfig) {
    const set = (changes: Partial<Omit<XBloomPageConfig, 'type'>>) =>
      this._setPage(this.page, changes as unknown as Partial<GridPageConfig>);
    const rows = page.rows ?? 2;
    // In tenths, so the stepper moves 10% at a time.
    const size = Math.round((page.scale ?? 1) * 10);
    const laidOut = page.brew !== undefined || page.manual !== undefined;
    const titled = page.title !== '';
    return html`
      <p class="muted note">With xBloom Studio. Hold a card on the Brew or Manual tab to move or resize it.</p>
      <div class="settings">
        ${this._switch('Title', titled, (on) => set({ title: on ? undefined : '' }))}
        ${this._switch('Glow when ready', page.glow !== false, (on) => set({ glow: on ? undefined : false }))}
        ${this._stepper('Columns', page.columns ?? 6, 1, 12, (columns) => set({ columns }))}
        ${this._stepper('Columns upright', page.portrait_columns ?? 2, 1, 8, (v) => set({ portrait_columns: v }))}
        ${this._stepper('Rows', rows, 1, 8, (v) => set({ rows: v }))}
        ${this._stepper('Rows upright', page.portrait_rows ?? rows + 2, 1, 10, (v) => set({ portrait_rows: v }))}
        ${this._stepper('Size', size, 5, 20, (v) => set({ scale: v === 10 ? undefined : v / 10 }), (v) => `${v * 10}%`, [
          'Smaller',
          'Larger',
        ])}
      </div>
      ${this._entityRow('Beans are in', page.beans_loaded, ['input_boolean', 'switch', 'binary_sensor'],
        'Not tracked', (id) => set({ beans_loaded: id }))}
      ${laidOut
        ? html`<div class="row look-from">
            <span class="muted">The cards are moved or resized.</span>
            <button class="chip" @click=${() => set({ brew: undefined, manual: undefined })}>Reset cards</button>
          </div>`
        : nothing}
    `;
  }

  /**
   * Badge placement and look chips. `own` is what's set here, `fallback` what
   * shows when it isn't; `set` gets undefined to go back to the fallback.
   */
  private _badgeLookRow(
    label: string,
    own: BadgeLook,
    fallback: Required<BadgeLook>,
    set: (look: BadgeLook) => void,
  ) {
    const align = own.badge_align ?? fallback.badge_align;
    const style = own.badge_style ?? fallback.badge_style;
    return html`<div class="row badge-look" role="group" aria-label=${label}>
      <span class="label">${label}</span>
      ${(['left', 'center', 'right'] as const).map((a) => {
        const on = align === a;
        return html`<button class="chip ${on ? 'on' : ''}" aria-pressed=${on}
          @click=${() => set({ ...own, badge_align: a })}>
          ${a === 'left' ? 'Left' : a === 'center' ? 'Center' : 'Right'}</button>`;
      })}
      <button class="chip ${style === 'pill' ? 'on' : ''}" aria-pressed=${style === 'pill'}
        @click=${() => set({ ...own, badge_style: 'pill' })}>With background</button>
      <button class="chip ${style === 'plain' ? 'on' : ''}" aria-pressed=${style === 'plain'}
        @click=${() => set({ ...own, badge_style: 'plain' })}>No background</button>
    </div>`;
  }

  /** The badge look every page has unless it says otherwise. */
  private get _frameLook(): Required<BadgeLook> {
    return { badge_align: this.config!.badge_align ?? 'right', badge_style: this.config!.badge_style ?? 'pill' };
  }

  private _renderThisPage() {
    const page = this.config!.pages[this.page];
    if (!page) return nothing;
    const grid = page.type === 'grid';
    const titled = hasTitleBar(page);
    if (page.type === 'xbloom') return this._renderXBloom(page);
    if (page.type === 'night' || page.type === 'weather') {
      const key = page.type === 'night' ? 'weather' : 'entity';
      const value = page.type === 'night' ? (page as NightPageConfig).weather : (page as WeatherPageConfig).entity;
      return this._entityRow('Weather from', value, ['weather'], page.type === 'night' ? 'None' : 'The first one found',
        (id) => this._setPage(this.page, { [key]: id } as Partial<GridPageConfig>));
    }
    if (page.type === 'photos') {
      return html`<luxframe-photo-settings
          .hass=${this.hass}
          .value=${page}
          @change=${(e: CustomEvent<PhotoSettings>) => this._setPage(this.page, e.detail)}
        ></luxframe-photo-settings>`;
    }
    if (!grid && !titled) return html`<p class="muted">This page has no settings of its own.</p>`;
    const rows = grid ? (page.rows ?? 3) : 0;
    const look = page as BadgeLook;
    const ownLook = look.badge_align !== undefined || look.badge_style !== undefined;
    return html`
      ${grid
        ? html`<div class="settings">
            ${this._stepper('Columns', page.columns ?? 4, 1, 8, (columns) => this._setPage(this.page, { columns }))}
            ${this._stepper('Rows', rows, 1, 8, (v) => this._setPage(this.page, { rows: v }))}
            ${this._stepper('Rows upright', page.portrait_rows ?? rows + 2, 1, 10, (v) =>
              this._setPage(this.page, { portrait_rows: v }),
            )}
          </div>`
        : nothing}
      ${titled
        ? html`${this._badgeLookRow('Badges', look, this._frameLook, (l) => this._setPage(this.page, l))}
            <div class="row look-from">
              ${ownLook
                ? html`<span class="muted">Its own badge look.</span>
                    <button class="chip"
                      @click=${() => this._setPage(this.page, { badge_align: undefined, badge_style: undefined })}>
                      Same as every page</button>`
                : html`<span class="muted">The same as every page, set under Look.</span>`}
            </div>`
        : nothing}
    `;
  }

  private _renderPages() {
    const pages = this.config!.pages;
    const shown = pages.filter((p) => !p.hidden).length;
    const homeIndex = Math.max(
      pages.findIndex((p) => !p.hidden && p.home),
      pages.findIndex((p) => !p.hidden),
    );
    const suggestions = suggestPages(this.hass, pages);
    const homeAfter = this.config!.home_after ?? DEFAULT_HOME_AFTER;
    return html`
      <ul class="list ${this._settling ? 'settling' : ''}">
        ${pages.map((page, i) => {
          const home = i === homeIndex;
          const label = pageLabel(page, i);
          const status = [
            page.hidden ? 'Hidden' : i === this.page ? 'Showing now' : '',
            home ? 'Start page' : '',
          ]
            .filter(Boolean)
            .join(' · ');
          const fallback = TITLE_DEFAULTS[page.type];
          const open = this._menu === i;
          const lastShown = !page.hidden && shown <= 1;
          return html`<li class="item page ${page.hidden ? 'hidden' : ''} ${this._drag?.list === 'pages' && this._drag.from === i ? 'dragging' : ''}"
            style=${this._dragStyle('pages', i)}>
            ${this._grip('pages', i, pages.length, label)}
            <span class="text">
              ${fallback === undefined
                ? html`<span class="name">${label}</span>
                    <div class="sub">${status}</div>`
                : html`<input
                      type="text"
                      class="title"
                      data-page=${i}
                      aria-label="Name of page ${i + 1}, ${kindLabel(page)}"
                      placeholder=${fallback || (page.type === 'grid' ? 'Add a title' : kindLabel(page))}
                      .value=${(page as { title?: string }).title ?? ''}
                      @change=${(e: Event) => this._rename(i, e.target as HTMLInputElement)}
                    />
                    <div class="sub">${[kindLabel(page), status].filter(Boolean).join(' · ')}</div>`}
            </span>
            <button class="round small plain more" aria-label="More for ${label}" aria-expanded=${open}
              @click=${() => (this._menu = open ? undefined : i)}>⋯</button>
            ${open
              ? html`<div class="row menu" role="group" aria-label="${label}">
                  <button class="chip" ?disabled=${home || !!page.hidden} @click=${() => this._setHome(i)}>
                    ${home ? 'Start page' : 'Start here'}
                  </button>
                  <button class="chip" ?disabled=${lastShown}
                    @click=${() => this._setPage(i, { hidden: !page.hidden, ...(page.hidden ? {} : { home: undefined }) })}>
                    ${page.hidden ? 'Show' : 'Hide'}
                  </button>
                  <button class="chip danger" ?disabled=${pages.length <= 1 || lastShown}
                    @click=${() => ((this._menu = undefined), this._removePage(i))}>Delete</button>
                </div>`
              : nothing}
          </li>`;
        })}
      </ul>
      <h3>Add a page</h3>
      <div class="row" role="group" aria-label="Add a page">
        ${PAGE_KINDS.filter((k) => k.blank).map(
          (k) => html`<button class="chip" @click=${() => this._addPage(k.blank!)}>
            ${k.type === 'grid' ? 'Blank' : k.label}
          </button>`,
        )}
      </div>
      ${suggestions.length
        ? html`<div class="row add">
            <button class="chip" @click=${() => this._setPages([...pages, ...suggestions])}>
              Add ${suggestions.length} ${suggestions.length === 1 ? 'room' : 'rooms'} from Home Assistant
            </button>
          </div>`
        : nothing}
      <h3>Back to the start page</h3>
      <div class="row" role="group" aria-label="Back to the start page after no touch for">
        ${HOME_AFTER.map(
          (h) => html`<button class="chip ${homeAfter === h.value ? 'on' : ''}"
            aria-pressed=${homeAfter === h.value}
            @click=${() => this._set({ home_after: h.value === DEFAULT_HOME_AFTER ? undefined : h.value })}>${h.label}</button>`,
        )}
        ${HOME_AFTER.some((h) => h.value === homeAfter)
          ? nothing
          : html`<button class="chip on" aria-pressed="true">${secondsLabel(homeAfter)}</button>`}
      </div>
      <p class="muted hint">After this long without a touch.</p>
    `;
  }

  private _setQuick(changes: Partial<QuickPanelConfig>): void {
    const next: Record<string, unknown> = { ...(this.config!.quick_panel || {}), ...changes };
    for (const [key, value] of Object.entries(next)) {
      // An empty dock is kept: it means no dock, where none means media alone.
      if (value === undefined || (Array.isArray(value) && !value.length && key !== 'dock')) delete next[key];
    }
    this._set({ quick_panel: Object.keys(next).length ? (next as QuickPanelConfig) : undefined });
  }

  private _setDock(dock: QuickDockItem[]): void {
    this._setQuick({ dock });
  }

  private _moveDock(index: number, by: number): void {
    const dock = [...dockOf(this.config!.quick_panel || undefined)];
    const to = index + by;
    if (to < 0 || to >= dock.length) return;
    const [item] = dock.splice(index, 1);
    dock.splice(to, 0, item);
    this._setDock(dock);
  }

  private _renderDock() {
    const dock = dockOf(this.config!.quick_panel || undefined);
    const hasMedia = dock.some((raw) => dockKind(normalizeDock(raw)) === 'media');
    return html`
      <p class="muted">Each of these is a tab on the panel. With only one, it just shows.</p>
      <ul class="list ${this._settling ? 'settling' : ''}">
        ${dock.map((raw, i) => {
          const item = normalizeDock(raw);
          const label = dockLabel(this.hass, item);
          const sub = [
            DOCK_KINDS[dockKind(item) ?? 'card'],
            item.visibility?.length ? 'Sometimes' : '',
            item.open ? 'Opens first' : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return html`<li class="item page ${this._drag?.list === 'dock' && this._drag.from === i ? 'dragging' : ''}"
            style=${this._dragStyle('dock', i)}>
            ${this._grip('dock', i, dock.length, label)}
            <button class="open" aria-label="Edit ${label}"
              @click=${() => this.dispatchEvent(new CustomEvent('dock-edit', { detail: { index: i } }))}>
              <span class="text"><span class="name">${label}</span><div class="sub">${sub}</div></span>
              <span class="chevron" aria-hidden="true">›</span>
            </button>
          </li>`;
        })}
      </ul>
      <div class="row add">
        <button class="chip" @click=${() => this.dispatchEvent(new CustomEvent('dock-add'))}>Add a tab</button>
        ${hasMedia ? nothing : html`<button class="chip" @click=${() => this._setDock([...dock, 'media'])}>Add media</button>`}
      </div>
    `;
  }

  private _renderQuick() {
    const quick = this.config!.quick_panel;
    if (quick === false) return html`<p class="muted">The quick panel is turned off in this dashboard’s YAML.</p>`;
    const pinned = quick?.pinned ?? [];
    const brightness = quick?.brightness !== false;
    const players = Object.keys(this.hass?.states ?? {}).filter((id) => id.startsWith('media_player.'));
    return html`
      ${this._renderDock()}
      <h3>Pinned</h3>
      <ul class="list">
        ${pinned.map(
          (id, i) => html`<li class="item page">
            <span class="text"><span class="name">${resolve(this.hass, id).name}</span></span>
            <button class="round small plain" aria-label="Unpin ${resolve(this.hass, id).name}"
              @click=${() => this._setQuick({ pinned: pinned.filter((_, n) => n !== i) })}>✕</button>
          </li>`,
        )}
      </ul>
      <div class="row add">
        <button class="chip" ?disabled=${pinned.length >= MAX_PINNED}
          @click=${() => this.dispatchEvent(new CustomEvent('pin'))}>Pin a device</button>
        <span class="muted">Up to ${MAX_PINNED}. One tap switches them.</span>
      </div>
      <div class="settings">
        ${this._switch('Brightness slider', brightness, (on) => this._setQuick({ brightness: on ? undefined : false }))}
      </div>
      ${players.length
        ? html`<h3>Speaker</h3>
            ${this._entityRow('What the media tab controls', quick?.media_player, ['media_player'], 'Whatever’s playing',
              (id) => this._setQuick({ media_player: id }))}`
        : nothing}
    `;
  }

  private _renderLook() {
    const config = this.config!;
    const theme = config.theme ?? 'auto';
    // In twentieths, so the stepper moves 5% at a time.
    const size = Math.round((config.scale ?? 1) * 20);
    const customAccent = !!config.accent && !ACCENTS.some((a) => a.value === config.accent);
    return html`
      <h3>Theme</h3>
      <div class="row" role="group" aria-label="Theme">
        ${THEMES.map(
          (t) => html`<button class="chip ${theme === t.value ? 'on' : ''}" aria-pressed=${theme === t.value}
            @click=${() => this._set({ theme: t.value === 'auto' ? undefined : t.value })}>${t.label}</button>`,
        )}
      </div>
      <h3>Accent</h3>
      <div class="row" role="group" aria-label="Accent color">
        <button class="chip ${config.accent ? '' : 'on'}" aria-pressed=${!config.accent}
          @click=${() => this._set({ accent: undefined })}>From theme</button>
        ${ACCENTS.map(
          (a) => html`<button class="swatch ${config.accent === a.value ? 'on' : ''}" aria-pressed=${config.accent === a.value}
            aria-label=${a.label} title=${a.label} style="--swatch: ${a.value}"
            @click=${() => this._set({ accent: a.value })}></button>`,
        )}
        <input
          type="color"
          class=${customAccent ? 'on' : ''}
          aria-label="Another accent color"
          .value=${/^#[0-9a-f]{6}$/i.test(config.accent ?? '') ? config.accent! : '#ff9f0a'}
          @change=${(e: Event) => this._set({ accent: (e.target as HTMLInputElement).value })}
        />
      </div>
      <div class="settings">
        ${this._stepper('Size', size, 14, 30, (v) => this._set({ scale: v === 20 ? undefined : v / 20 }), (v) => `${v * 5}%`, [
          'Smaller',
          'Larger',
        ])}
      </div>
      <h3>Tiles</h3>
      <div class="row" role="group" aria-label="Tiles">
        ${TILE_STYLES.map(
          (t) => html`<button class="chip ${(config.tile_style ?? 'center') === t.value ? 'on' : ''}"
            aria-pressed=${(config.tile_style ?? 'center') === t.value}
            @click=${() => this._set({ tile_style: t.value === 'center' ? undefined : t.value })}>${t.label}</button>`,
        )}
      </div>
      <h3>Corners</h3>
      <div class="row" role="group" aria-label="Corners">
        ${CORNERS.map(
          (c) => html`<button class="chip ${config.corner_radius === c.value ? 'on' : ''}"
            aria-pressed=${config.corner_radius === c.value}
            @click=${() => this._set({ corner_radius: c.value })}>${c.label}</button>`,
        )}
        ${config.corner_radius !== undefined && !CORNERS.some((c) => c.value === config.corner_radius)
          ? html`<button class="chip on" aria-pressed="true">${config.corner_radius}px</button>`
          : nothing}
      </div>
      <h3>Wallpaper</h3>
      <label class="field">
        An image under /local/, or any CSS background
        <input
          type="text"
          placeholder="/local/wallpaper.jpg"
          .value=${config.background ?? ''}
          @change=${(e: Event) => this._set({ background: toBackground((e.target as HTMLInputElement).value) })}
        />
      </label>
      <h3>Glass tint</h3>
      <div class="row">
        <button class="chip ${config.tint ? '' : 'on'}" aria-pressed=${!config.tint}
          @click=${() => this._set({ tint: undefined })}>From wallpaper</button>
        <input
          type="color"
          aria-label="Tint color"
          .value=${/^#[0-9a-f]{6}$/i.test(config.tint ?? '') ? config.tint! : '#a77d58'}
          @change=${(e: Event) => this._set({ tint: (e.target as HTMLInputElement).value })}
        />
      </div>
      <h3>Badges, every page</h3>
      ${this._badgeLookRow('', config, { badge_align: 'right', badge_style: 'pill' }, (l) =>
        this._set({
          badge_align: l.badge_align === 'right' ? undefined : l.badge_align,
          badge_style: l.badge_style === 'pill' ? undefined : l.badge_style,
        }),
      )}
    `;
  }

  private _setAlerts(alerts: NonNullable<LuxFrameConfig['alerts']>): void {
    this._set({ alerts: alerts.length ? alerts : undefined });
  }

  private _renderAlerts() {
    const alerts = this.config!.alerts ?? [];
    return html`
      <p class="muted">
        A banner across the top of every page while one of these needs you: a door left open, a leak, the alarm going off.
      </p>
      <ul class="list">
        ${alerts.map((raw, i) => {
          const alert = alertOf(raw);
          const name = resolve(this.hass, alert.entity).name;
          return html`<li class="item page">
            <span class="text"><span class="name">${name}</span>
              <div class="sub">${alertWhen(this.hass, alert)}</div></span>
            <button class="round small plain" aria-label="Remove the alert for ${name}"
              @click=${() => this._setAlerts(alerts.filter((_, n) => n !== i))}>✕</button>
          </li>`;
        })}
      </ul>
      <div class="row add">
        <button class="chip" @click=${() => this.dispatchEvent(new CustomEvent('alert-add'))}>Add an alert</button>
      </div>
    `;
  }

  private _renderTablet() {
    return html`<p class="muted">This tablet shows its own saved layout, not the dashboard’s.</p>
      <button class="chip" @click=${() => this.dispatchEvent(new CustomEvent('reset'))}>
        Use the dashboard’s layout
      </button>`;
  }

  /** The section showing: the one asked for, else this page's. */
  private get _shownSection(): CustomizeSection {
    const section = this.section ?? 'page';
    return section === 'tablet' && !this.local ? 'page' : section;
  }

  private _renderSection(section: CustomizeSection) {
    switch (section) {
      case 'page':
        return this._renderThisPage();
      case 'pages':
        return this._renderPages();
      case 'quick':
        return this._renderQuick();
      case 'look':
        return this._renderLook();
      case 'alerts':
        return this._renderAlerts();
      case 'tablet':
        return this._renderTablet();
    }
  }

  protected render() {
    if (!this.config) return nothing;
    const shown = this._shownSection;
    return html`
      <nav class="tabs" role="tablist" aria-label="Customize">
        ${SECTIONS.filter((s) => s.id !== 'tablet' || this.local).map(
          (s) => html`<button class="chip ${shown === s.id ? 'on' : ''}" role="tab" aria-selected=${shown === s.id}
            @click=${() => {
              this._menu = undefined;
              this.section = s.id;
              this.dispatchEvent(new CustomEvent('section', { detail: { section: s.id } }));
            }}>${s.label}</button>`,
        )}
      </nav>
      <div class="section" role="tabpanel">${this._renderSection(shown)}</div>
    `;
  }

  static styles = [
    editorStyles,
    css`
      .settings {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 12px;
      }

      .setting {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 44px;
        font-size: 17px;
      }

      .tabs {
        display: flex;
        gap: 8px;
        margin: 0 -24px 18px;
        padding: 0 24px 2px;
        overflow-x: auto;
        scrollbar-width: none;
      }

      .tabs::-webkit-scrollbar {
        display: none;
      }

      .tabs .chip {
        flex: none;
      }

      .section > h3:first-child {
        margin-top: 4px;
      }

      .page {
        flex-wrap: wrap;
        gap: 6px;
        padding-left: 0;
        padding-right: 0;
        transition: transform var(--lf-move) var(--lf-ease);
      }

      .settling .page {
        transition: none;
      }

      .page.dragging {
        border-radius: var(--lf-radius-s);
        background: var(--lf-surface);
        box-shadow: 0 8px 24px rgb(0 0 0 / 30%);
      }

      /* The handle a row is dragged by. */
      .grip {
        flex: none;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        padding: 0;
        border-radius: 50%;
        background: none;
        color: var(--lf-muted);
        cursor: grab;
        touch-action: none;
      }

      .more {
        font-size: 22px;
      }

      /* What else a page can do, under its row once ⋯ is tapped. */
      .menu {
        width: 100%;
        padding: 4px 0 8px 50px;
        box-sizing: border-box;
      }

      /* A row that opens its own settings. */
      .open {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 44px;
        padding: 0 12px 0 0;
        text-align: left;
        background: none;
      }

      .chevron {
        flex: none;
        font-size: 24px;
        color: var(--lf-faint);
      }

      .swatch {
        flex: none;
        width: 44px;
        height: 44px;
        padding: 0;
        border-radius: 50%;
        background: var(--swatch);
        box-shadow: inset 0 0 0 2px rgb(255 255 255 / 25%);
      }

      .swatch.on,
      input[type='color'].on {
        outline: 3px solid var(--lf-text);
        outline-offset: 2px;
      }

      .hint {
        margin-top: 8px;
      }

      .page.hidden .name,
      .page.hidden input.title {
        opacity: 0.55;
      }

      /* A page's name, edited where it's listed. */
      .page input.title {
        min-height: 44px;
        margin-bottom: 2px;
        padding: 0 10px;
        font-weight: 500;
        background: var(--lf-control-row);
      }

      .add {
        margin-top: 10px;
      }

      .pinned-note {
        margin-top: 22px;
      }

      .add .label,
      .look-from {
        margin-top: 4px;
        align-items: center;
        font-size: 15px;
      }

      .badge-look .label {
        width: 100%;
        font-size: 15px;
        color: var(--lf-muted);
      }

      .badge-look .label:empty {
        display: none;
      }

      .field {
        margin-top: 14px;
      }

      h3 + .field,
      p + .field {
        margin-top: 0;
      }

      input[type='color'] {
        flex: none;
        width: 44px;
        height: 44px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: none;
        cursor: pointer;
        overflow: hidden;
        -webkit-appearance: none;
        appearance: none;
      }

      input[type='color']::-webkit-color-swatch-wrapper {
        padding: 0;
      }

      input[type='color']::-webkit-color-swatch {
        border: 0;
        border-radius: 50%;
      }

      p {
        margin: 0 0 10px;
        font-size: 15px;
      }
    `,
  ];
}

/** A bare image path becomes a full-screen cover background; CSS passes through. */
export function toBackground(value: string): string | undefined {
  const text = value.trim();
  if (!text) return undefined;
  if (/^(\/|https?:)\S+$/.test(text) && !/[()]/.test(text)) return `center / cover no-repeat url('${text}')`;
  return text;
}

define('luxframe-customize', LuxFrameCustomize);
