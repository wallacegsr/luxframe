import { LitElement, css, html, nothing } from 'lit';
import { alertOf, alertWhen } from '../alerts';
import { hasTitleBar } from '../badges';
import { dockKind, dockLabel, dockOf, normalizeDock } from '../quick/dock';
import { MAX_PINNED } from '../quick/panel';
import { define } from '../define';
import { zoomOf } from '../zoom';
import { domainOf, resolve } from '../entity';
import { icon, type IconName } from '../icons';
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

const SECTIONS: Array<{ id: CustomizeSection; label: string; icon: IconName }> = [
  { id: 'page', label: 'This page', icon: 'grid' },
  { id: 'pages', label: 'Pages', icon: 'list' },
  { id: 'quick', label: 'Quick panel', icon: 'dock' },
  { id: 'look', label: 'Look', icon: 'sliders' },
  { id: 'alerts', label: 'Alerts', icon: 'shield-alert' },
  { id: 'tablet', label: 'This tablet', icon: 'refresh' },
];

/**
 * The part of each section last looked at (the quick panel's Pinned, say),
 * kept while the sheet gives way to another and comes back.
 */
const remembered: Partial<Record<CustomizeSection, string>> = {};

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

  /**
   * Changes a page. Something set to nothing, empty or off is dropped from
   * its YAML; `exact` keeps empty and off, for the settings where they mean
   * something (an xBloom page with no title, or no glow).
   */
  private _setPage(
    index: number,
    changes: Partial<GridPageConfig> & PhotoSettings & { hidden?: boolean; home?: boolean },
    exact = false,
  ): void {
    const pages = [...this.config!.pages];
    const next: Record<string, unknown> = { ...pages[index], ...changes };
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || (!exact && (value === '' || value === false))) delete next[key];
    }
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

  /** A row in a group: a number with − and + beside it. */
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
      <div class="line">
        <span class="line-text">${label}</span>
        <div class="stepper" role="group" aria-label=${label}>
          <button aria-label="${words[0]} ${label.toLowerCase()}" ?disabled=${value <= min} @click=${() => set(value - 1)}>−</button>
          <output>${format(value)}</output>
          <button aria-label="${words[1]} ${label.toLowerCase()}" ?disabled=${value >= max} @click=${() => set(value + 1)}>+</button>
        </div>
      </div>
    `;
  }

  /** A row in a group: something that's on or off. */
  private _switch(label: string, on: boolean, set: (on: boolean) => void, note?: string) {
    return html`<div class="line">
      <span class="line-text">${label}${note ? html`<span class="sub">${note}</span>` : nothing}</span>
      <button class="switch" role="switch" aria-checked=${on} aria-label=${label} @click=${() => set(!on)}></button>
    </div>`;
  }

  /** A row in a group: one of a few choices, showing the one chosen; a tap lists the rest. */
  private _select(
    label: string,
    options: Array<{ value: string; label: string }>,
    value: string,
    set: (value: string) => void,
    note?: string,
  ) {
    return html`<label class="line">
      <span class="line-text">${label}${note ? html`<span class="sub">${note}</span>` : nothing}</span>
      <span class="pick">
        <select @change=${(e: Event) => set((e.target as HTMLSelectElement).value)}>
          ${options.map((o) => html`<option value=${o.value} .selected=${o.value === value}>${o.label}</option>`)}
        </select>
        <span class="chevron" aria-hidden="true">›</span>
      </span>
    </label>`;
  }

  /** A row in a group: an entity, from the ones that would do. */
  private _entityRow(label: string, value: string | undefined, domains: string[], none: string, set: (id?: string) => void) {
    const ids = Object.keys(this.hass?.states ?? {})
      .filter((id) => domains.includes(domainOf(id)))
      .sort((a, b) => resolve(this.hass, a).name.localeCompare(resolve(this.hass, b).name));
    // One set in YAML that Home Assistant doesn't have still shows.
    if (value && !ids.includes(value)) ids.unshift(value);
    return this._select(
      label,
      [{ value: '', label: none }, ...ids.map((id) => ({ value: id, label: resolve(this.hass, id).name }))],
      value ?? '',
      (id) => set(id || undefined),
    );
  }

  /** The part of a section showing, where it has parts. */
  private _sub<T extends string>(section: CustomizeSection, parts: readonly T[]): T {
    const kept = remembered[section] as T | undefined;
    return kept && parts.includes(kept) ? kept : parts[0];
  }

  /** A section's parts, as a segmented control across its top. */
  private _segments<T extends string>(section: CustomizeSection, parts: ReadonlyArray<{ id: T; label: string }>, shown: T) {
    return html`<div class="seg" role="tablist" aria-label="Part">
      ${parts.map(
        (p) => html`<button role="tab" class=${shown === p.id ? 'on' : ''} aria-selected=${shown === p.id}
          @click=${() => {
            remembered[section] = p.id;
            this.requestUpdate();
          }}>${p.label}</button>`,
      )}
    </div>`;
  }

  /** The xBloom page's layout with xBloom Studio: the grid of its Brew and Manual tabs, and how big it's drawn. */
  private _renderXBloom(page: XBloomPageConfig) {
    const set = (changes: Partial<Omit<XBloomPageConfig, 'type'>>) =>
      this._setPage(this.page, changes as unknown as Partial<GridPageConfig>, true);
    const rows = page.rows ?? 2;
    // In tenths, so the stepper moves 10% at a time.
    const size = Math.round((page.scale ?? 1) * 10);
    const laidOut = page.brew !== undefined || page.manual !== undefined;
    const titled = page.title !== '';
    return html`
      <div class="group">
        ${this._switch('Title', titled, (on) => set({ title: on ? undefined : '' }))}
        ${this._switch('Glow when ready', page.glow !== false, (on) => set({ glow: on ? undefined : false }))}
        ${this._entityRow('Beans are in', page.beans_loaded, ['input_boolean', 'switch', 'binary_sensor'],
          'Not tracked', (id) => set({ beans_loaded: id }))}
      </div>
      <h3>Brew and Manual cards</h3>
      <div class="group">
        ${this._stepper('Columns', page.columns ?? 6, 1, 12, (columns) => set({ columns }))}
        ${this._stepper('Columns upright', page.portrait_columns ?? 2, 1, 8, (v) => set({ portrait_columns: v }))}
        ${this._stepper('Rows', rows, 1, 8, (v) => set({ rows: v }))}
        ${this._stepper('Rows upright', page.portrait_rows ?? rows + 2, 1, 10, (v) => set({ portrait_rows: v }))}
        ${this._stepper('Size', size, 5, 20, (v) => set({ scale: v === 10 ? undefined : v / 10 }), (v) => `${v * 10}%`, [
          'Smaller',
          'Larger',
        ])}
        ${laidOut
          ? html`<div class="line">
              <span class="line-text">Cards<span class="sub">Moved or resized</span></span>
              <button class="chip" @click=${() => set({ brew: undefined, manual: undefined })}>Reset</button>
            </div>`
          : nothing}
      </div>
      <p class="muted foot">Hold a card on the Brew or Manual tab to move or resize it.</p>
    `;
  }

  /**
   * Where badges sit and whether they have a background. `own` is what's set
   * here, `fallback` what shows when it isn't.
   */
  private _badgeLook(from: BadgeLook, fallback: Required<BadgeLook>, set: (look: BadgeLook) => void) {
    // Only the look: `from` is a whole page or the whole card.
    const own: BadgeLook = { badge_align: from.badge_align, badge_style: from.badge_style };
    const align = own.badge_align ?? fallback.badge_align;
    const style = own.badge_style ?? fallback.badge_style;
    return html`
      ${this._select(
        'Badges sit',
        [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ],
        align,
        (a) => set({ ...own, badge_align: a as BadgeLook['badge_align'] }),
      )}
      ${this._switch('Badge background', style === 'pill', (on) => set({ ...own, badge_style: on ? 'pill' : 'plain' }))}
    `;
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
      return html`<div class="group">
        ${this._entityRow('Weather from', value, ['weather'], page.type === 'night' ? 'None' : 'The first one found',
          (id) => this._setPage(this.page, { [key]: id } as Partial<GridPageConfig>))}
      </div>`;
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
        ? html`<h3>Grid</h3>
            <div class="group">
              ${this._stepper('Columns', page.columns ?? 4, 1, 8, (columns) => this._setPage(this.page, { columns }))}
              ${this._stepper('Rows', rows, 1, 8, (v) => this._setPage(this.page, { rows: v }))}
              ${this._stepper('Rows upright', page.portrait_rows ?? rows + 2, 1, 10, (v) =>
                this._setPage(this.page, { portrait_rows: v }),
              )}
            </div>`
        : nothing}
      ${titled
        ? html`<h3>Badges</h3>
            <div class="group">
              ${this._badgeLook(look, this._frameLook, (l) => this._setPage(this.page, l))}
              ${ownLook
                ? html`<div class="line">
                    <span class="line-text">This page has its own badge look</span>
                    <button class="chip"
                      @click=${() => this._setPage(this.page, { badge_align: undefined, badge_style: undefined })}>
                      Same as every page</button>
                  </div>`
                : nothing}
            </div>
            ${ownLook ? nothing : html`<p class="muted foot">The same as every page, until you change it here.</p>`}`
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
    const afters = HOME_AFTER.map((h) => ({ value: String(h.value), label: h.label }));
    if (!HOME_AFTER.some((h) => h.value === homeAfter)) afters.push({ value: String(homeAfter), label: secondsLabel(homeAfter) });
    return html`
      <ul class="list group rows ${this._settling ? 'settling' : ''}">
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
        ${suggestions.length
          ? html`<button class="chip" @click=${() => this._setPages([...pages, ...suggestions])}>
              ${suggestions.length} ${suggestions.length === 1 ? 'room' : 'rooms'} from Home Assistant
            </button>`
          : nothing}
      </div>
      <h3>When nobody’s touching it</h3>
      <div class="group">
        ${this._select('Back to the start page', afters, String(homeAfter), (v) =>
          this._set({ home_after: Number(v) === DEFAULT_HOME_AFTER ? undefined : Number(v) }), 'After this long without a touch')}
      </div>
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
      ${dock.length
        ? html`<ul class="list group rows ${this._settling ? 'settling' : ''}">
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
          </ul>`
        : nothing}
      <div class="row add">
        <button class="chip" @click=${() => this.dispatchEvent(new CustomEvent('dock-add'))}>Add a tab</button>
        ${hasMedia ? nothing : html`<button class="chip" @click=${() => this._setDock([...dock, 'media'])}>Add media</button>`}
      </div>
      <p class="muted foot">Each is a tab on the panel. With only one, it just shows.</p>
    `;
  }

  private _renderPinned(pinned: string[]) {
    return html`
      ${pinned.length
        ? html`<ul class="list group rows">
            ${pinned.map(
              (id, i) => html`<li class="item page pin">
                <span class="text"><span class="name">${resolve(this.hass, id).name}</span></span>
                <button class="round small plain" aria-label="Unpin ${resolve(this.hass, id).name}"
                  @click=${() => this._setQuick({ pinned: pinned.filter((_, n) => n !== i) })}>✕</button>
              </li>`,
            )}
          </ul>`
        : nothing}
      <div class="row add">
        <button class="chip" ?disabled=${pinned.length >= MAX_PINNED}
          @click=${() => this.dispatchEvent(new CustomEvent('pin'))}>Pin a device</button>
      </div>
      <p class="muted foot">Up to ${MAX_PINNED} tiles beside the tabs. One tap switches them.</p>
    `;
  }

  private _renderQuick() {
    const quick = this.config!.quick_panel;
    if (quick === false) return html`<p class="muted">The quick panel is turned off in this dashboard’s YAML.</p>`;
    const pinned = quick?.pinned ?? [];
    const brightness = quick?.brightness !== false;
    const part = this._sub('quick', ['tabs', 'pinned', 'options'] as const);
    return html`
      ${this._segments(
        'quick',
        [
          { id: 'tabs', label: 'Tabs' },
          { id: 'pinned', label: 'Pinned' },
          { id: 'options', label: 'Options' },
        ] as const,
        part,
      )}
      ${part === 'tabs'
        ? this._renderDock()
        : part === 'pinned'
          ? this._renderPinned(pinned)
          : html`<div class="group">
              ${this._entityRow('Speaker', quick?.media_player, ['media_player'], 'Whatever’s playing', (id) =>
                this._setQuick({ media_player: id }))}
              ${this._switch('Brightness slider', brightness, (on) => this._setQuick({ brightness: on ? undefined : false }))}
            </div>`}
    `;
  }

  private _renderLook() {
    const config = this.config!;
    const theme = config.theme ?? 'auto';
    // In twentieths, so the stepper moves 5% at a time.
    const size = Math.round((config.scale ?? 1) * 20);
    const customAccent = !!config.accent && !ACCENTS.some((a) => a.value === config.accent);
    const part = this._sub('look', ['theme', 'tiles', 'background'] as const);
    const corners = CORNERS.map((c) => ({ value: c.value === undefined ? '' : String(c.value), label: c.label }));
    if (config.corner_radius !== undefined && !CORNERS.some((c) => c.value === config.corner_radius)) {
      corners.push({ value: String(config.corner_radius), label: `${config.corner_radius}px` });
    }
    const segments = this._segments(
      'look',
      [
        { id: 'theme', label: 'Theme' },
        { id: 'tiles', label: 'Tiles' },
        { id: 'background', label: 'Background' },
      ] as const,
      part,
    );
    if (part === 'theme') {
      return html`${segments}
        <div class="group">
          ${this._select('Theme', THEMES, theme, (v) =>
            this._set({ theme: v === 'auto' ? undefined : (v as LuxFrameConfig['theme']) }))}
          <div class="line tall" role="group" aria-label="Accent color">
            <span class="line-text">Accent</span>
            <div class="swatches">
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
          </div>
          ${this._stepper('Size', size, 14, 30, (v) => this._set({ scale: v === 20 ? undefined : v / 20 }), (v) => `${v * 5}%`, [
            'Smaller',
            'Larger',
          ])}
        </div>`;
    }
    if (part === 'tiles') {
      return html`${segments}
        <div class="group">
          ${this._select('Layout', TILE_STYLES, config.tile_style ?? 'center', (v) =>
            this._set({ tile_style: v === 'center' ? undefined : (v as LuxFrameConfig['tile_style']) }))}
          ${this._select('Corners', corners, config.corner_radius === undefined ? '' : String(config.corner_radius), (v) =>
            this._set({ corner_radius: v === '' ? undefined : Number(v) }))}
        </div>
        <h3>Badges, every page</h3>
        <div class="group">
          ${this._badgeLook(config, { badge_align: 'right', badge_style: 'pill' }, (l) =>
            this._set({
              badge_align: l.badge_align === 'right' ? undefined : l.badge_align,
              badge_style: l.badge_style === 'pill' ? undefined : l.badge_style,
            }),
          )}
        </div>`;
    }
    return html`${segments}
      <div class="group">
        <label class="line tall">
          <span class="line-text">Wallpaper<span class="sub">An image under /local/, or any CSS background</span></span>
          <input
            type="text"
            placeholder="/local/wallpaper.jpg"
            .value=${config.background ?? ''}
            @change=${(e: Event) => this._set({ background: toBackground((e.target as HTMLInputElement).value) })}
          />
        </label>
        ${this._switch('Glass tint from the wallpaper', !config.tint, (on) =>
          this._set({ tint: on ? undefined : '#a77d58' }))}
        ${config.tint
          ? html`<label class="line">
              <span class="line-text">Tint color</span>
              <input
                type="color"
                aria-label="Tint color"
                .value=${/^#[0-9a-f]{6}$/i.test(config.tint) ? config.tint : '#a77d58'}
                @change=${(e: Event) => this._set({ tint: (e.target as HTMLInputElement).value })}
              />
            </label>`
          : nothing}
      </div>`;
  }

  private _setAlerts(alerts: NonNullable<LuxFrameConfig['alerts']>): void {
    this._set({ alerts: alerts.length ? alerts : undefined });
  }

  private _renderAlerts() {
    const alerts = this.config!.alerts ?? [];
    return html`
      ${alerts.length
        ? html`<ul class="list group rows">
            ${alerts.map((raw, i) => {
              const alert = alertOf(raw);
              const name = resolve(this.hass, alert.entity).name;
              return html`<li class="item page pin">
                <span class="text"><span class="name">${name}</span>
                  <div class="sub">${alertWhen(this.hass, alert)}</div></span>
                <button class="round small plain" aria-label="Remove the alert for ${name}"
                  @click=${() => this._setAlerts(alerts.filter((_, n) => n !== i))}>✕</button>
              </li>`;
            })}
          </ul>`
        : nothing}
      <div class="row add">
        <button class="chip" @click=${() => this.dispatchEvent(new CustomEvent('alert-add'))}>Add an alert</button>
      </div>
      <p class="muted foot">
        A banner across the top of every page while one of these needs you: a door left open, a leak, the alarm going off.
      </p>
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

  /** How a section stands, in a few words under its name. */
  private _status(section: CustomizeSection): string {
    const config = this.config!;
    switch (section) {
      case 'page': {
        const page = config.pages[this.page];
        return page ? pageLabel(page, this.page) : '';
      }
      case 'pages': {
        const hidden = config.pages.filter((p) => p.hidden).length;
        const n = config.pages.length;
        return `${n} ${n === 1 ? 'page' : 'pages'}${hidden ? ` · ${hidden} hidden` : ''}`;
      }
      case 'quick': {
        if (config.quick_panel === false) return 'Off';
        const tabs = dockOf(config.quick_panel || undefined).length;
        const pinned = config.quick_panel?.pinned?.length ?? 0;
        return `${tabs} ${tabs === 1 ? 'tab' : 'tabs'}${pinned ? ` · ${pinned} pinned` : ''}`;
      }
      case 'look': {
        const theme = THEMES.find((t) => t.value === (config.theme ?? 'auto'))?.label ?? 'Auto';
        const accent = config.accent ? (ACCENTS.find((a) => a.value === config.accent)?.label.toLowerCase() ?? 'own accent') : '';
        return [theme, accent].filter(Boolean).join(' · ');
      }
      case 'alerts': {
        const n = config.alerts?.length ?? 0;
        return n ? `${n} set` : 'None';
      }
      case 'tablet':
        return 'Its own layout';
    }
  }

  protected render() {
    if (!this.config) return nothing;
    const shown = this._shownSection;
    return html`
      <div class="shell">
        <div class="layout">
          <nav class="rail" role="tablist" aria-label="Customize">
            ${SECTIONS.filter((s) => s.id !== 'tablet' || this.local).map(
              (s) => html`<button class="rail-item ${shown === s.id ? 'on' : ''}" role="tab" aria-selected=${shown === s.id}
                @click=${() => {
                  this._menu = undefined;
                  this.section = s.id;
                  this.dispatchEvent(new CustomEvent('section', { detail: { section: s.id } }));
                }}>
                <span class="rail-icon">${icon(s.icon, 22)}</span>
                <span class="rail-text"><span class="rail-name">${s.label}</span>
                  <span class="rail-status">${this._status(s.id)}</span></span>
              </button>`,
            )}
          </nav>
          <div class="section" role="tabpanel">${this._renderSection(shown)}</div>
        </div>
      </div>
    `;
  }

  static styles = [
    editorStyles,
    css`
      /* The sections down the side, the one chosen beside them. */
      .shell {
        container-type: inline-size;
      }

      .layout {
        display: grid;
        grid-template-columns: 216px minmax(0, 1fr);
        gap: 22px;
        align-items: start;
        /* Tall enough that the sheet keeps its size from one section to the next. */
        min-height: min(520px, 62vh);
      }

      .rail {
        position: sticky;
        top: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .rail-item {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 56px;
        padding: 6px 12px;
        border-radius: var(--lf-radius-s);
        text-align: left;
        background: none;
        transition:
          background-color var(--lf-move),
          color var(--lf-move);
      }

      .rail-item.on {
        color: var(--lf-text-active);
        background: var(--lf-surface-active);
      }

      .rail-icon {
        flex: none;
        display: grid;
        place-items: center;
        color: var(--lf-muted);
      }

      .rail-item.on .rail-icon {
        color: inherit;
      }

      .rail-text {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .rail-name {
        font-size: 17px;
        font-weight: 600;
      }

      .rail-status {
        font-size: 13px;
        color: var(--lf-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .rail-item.on .rail-status {
        color: var(--lf-muted-active);
      }

      .section {
        min-width: 0;
      }

      .section > h3:first-child {
        margin-top: 4px;
      }

      /* A section's parts, as one control: the chosen one is lit. */
      .seg {
        display: inline-flex;
        max-width: 100%;
        margin-bottom: 14px;
        padding: 4px;
        border-radius: 999px;
        background: var(--lf-control-row);
      }

      .seg button {
        min-height: 40px;
        padding: 0 18px;
        border-radius: 999px;
        font-size: 15px;
        font-weight: 600;
        background: none;
        transition:
          background-color var(--lf-move),
          color var(--lf-move);
      }

      .seg button.on {
        color: var(--lf-text-active);
        background: var(--lf-surface-active);
      }

      /* Settings that belong together, as rows on one card. */
      .group {
        border-radius: var(--lf-radius-s);
        background: var(--lf-control-row);
      }

      .line {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 56px;
        padding: 4px 8px 4px 16px;
        font-size: 17px;
        box-sizing: border-box;
      }

      .line + .line,
      .rows > li + li {
        border-top: 1px solid color-mix(in srgb, var(--lf-text) 9%, transparent);
      }

      .line-text {
        flex: 1;
        min-width: 0;
      }

      .line .sub {
        display: block;
        font-size: 13px;
        color: var(--lf-muted);
      }

      /* A row whose control goes under its name. */
      .line.tall {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        padding: 12px 16px;
      }

      .line .chip {
        flex: none;
        margin-right: 6px;
        font-size: 15px;
      }

      .line > .switch,
      .line > input[type='color'] {
        margin-right: 8px;
      }

      .line .stepper {
        background: none;
      }

      /* The choice made, and a chevron: a tap lists the others. */
      .pick {
        flex: 0 1 auto;
        min-width: 0;
        max-width: 62%;
        display: flex;
        align-items: center;
        gap: 4px;
        padding-right: 8px;
        color: var(--lf-muted);
      }

      .pick select {
        width: auto;
        min-width: 0;
        max-width: 100%;
        min-height: 44px;
        padding: 0 4px;
        color: inherit;
        background: none;
        text-align: right;
        text-align-last: right;
        text-overflow: ellipsis;
        cursor: pointer;
        -webkit-appearance: none;
        appearance: none;
      }

      .swatches {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }

      .swatches .chip {
        margin-right: 0;
      }

      .foot {
        margin: 10px 4px 0;
      }

      /* Lists of pages, tabs and alerts sit on a card too. */
      .rows {
        gap: 0;
        padding: 0 4px;
      }

      .page {
        flex-wrap: wrap;
        gap: 6px;
        padding-left: 0;
        padding-right: 0;
        border-radius: 0;
        transition: transform var(--lf-move) var(--lf-ease);
      }

      .page.pin {
        padding-left: 12px;
      }

      .settling .page {
        transition: none;
      }

      .page.dragging {
        border-radius: var(--lf-radius-s);
        border-top-color: transparent;
        background: var(--lf-sheet);
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
        line-height: 1;
        color: var(--lf-faint);
      }

      .swatch {
        flex: none;
        width: 36px;
        height: 36px;
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

      .page.hidden .name,
      .page.hidden input.title {
        opacity: 0.55;
      }

      /* A page's name, edited where it's listed. */
      .page input.title {
        min-height: 40px;
        margin-bottom: 2px;
        padding: 0 10px;
        font-weight: 500;
        background: var(--lf-control-row);
      }

      .add {
        margin-top: 12px;
      }

      input[type='color'] {
        flex: none;
        width: 36px;
        height: 36px;
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

      /* Last, so they win. A narrow sheet: the sections across the top instead. */
      @container (max-width: 600px) {
        .layout {
          grid-template-columns: minmax(0, 1fr);
          gap: 16px;
          min-height: 0;
        }

        .rail {
          position: static;
          flex-direction: row;
          gap: 8px;
          margin: 0 -24px;
          padding: 0 24px 2px;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .rail::-webkit-scrollbar {
          display: none;
        }

        .rail-item {
          flex: none;
          min-height: 44px;
          padding: 0 18px;
          border-radius: 999px;
          background: var(--lf-control);
        }

        .rail-item.on {
          background: var(--lf-surface-active);
        }

        .rail-icon,
        .rail-status {
          display: none;
        }

        .rail-name {
          font-weight: 500;
        }
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
