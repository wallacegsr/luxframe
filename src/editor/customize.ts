import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { resolve } from '../entity';
import type { GridPageConfig, HomeAssistant, LuxFrameConfig, PageConfig, QuickPanelConfig } from '../types';
import { PAGE_KINDS, TITLE_DEFAULTS, kindLabel, pageLabel, suggestPages } from './layout';
import { editorStyles } from './sheet';

const THEMES: Array<{ value: NonNullable<LuxFrameConfig['theme']>; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'ha', label: 'HA theme' },
];

/**
 * The frame's settings while editing: the current grid page's columns and
 * rows; the pages, with their names, which show and in what order; suggested
 * pages from Home Assistant's areas; and the look (theme, wallpaper, tint).
 * Fires `change` with the whole new config, `show-page` with a page just
 * added, and `reset` to drop this tablet's own layout.
 */
export class LuxFrameCustomize extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    page: { type: Number },
    local: { type: Boolean },
  };

  declare hass?: HomeAssistant;
  declare config?: LuxFrameConfig;
  /** The page being looked at, as an index into `config.pages`. */
  declare page: number;
  /** True when this tablet is showing its own saved layout. */
  declare local: boolean;

  /** A page just added whose name field wants the focus once it's drawn. */
  private _focusTitle?: number;

  constructor() {
    super();
    this.page = 0;
    this.local = false;
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

  private _setPage(index: number, changes: Partial<GridPageConfig> & { hidden?: boolean; home?: boolean }): void {
    const pages = [...this.config!.pages];
    const next: Record<string, unknown> = { ...pages[index], ...changes };
    for (const [key, value] of Object.entries(changes)) if (value === undefined || value === '' || value === false) delete next[key];
    pages[index] = next as unknown as PageConfig;
    this._setPages(pages);
  }

  private _movePage(index: number, by: number): void {
    const pages = [...this.config!.pages];
    const [page] = pages.splice(index, 1);
    pages.splice(index + by, 0, page);
    this._setPages(pages);
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

  private _stepper(label: string, value: number, min: number, max: number, set: (v: number) => void) {
    return html`
      <div class="setting">
        <span>${label}</span>
        <div class="stepper" role="group" aria-label=${label}>
          <button aria-label="Fewer ${label.toLowerCase()}" ?disabled=${value <= min} @click=${() => set(value - 1)}>−</button>
          <output>${value}</output>
          <button aria-label="More ${label.toLowerCase()}" ?disabled=${value >= max} @click=${() => set(value + 1)}>+</button>
        </div>
      </div>
    `;
  }

  private _renderThisPage() {
    const page = this.config!.pages[this.page];
    if (page?.type !== 'grid') return nothing;
    const rows = page.rows ?? 3;
    return html`
      <h3>This page</h3>
      <div class="settings">
        ${this._stepper('Columns', page.columns ?? 4, 1, 8, (columns) => this._setPage(this.page, { columns }))}
        ${this._stepper('Rows', rows, 1, 8, (v) => this._setPage(this.page, { rows: v }))}
        ${this._stepper('Rows upright', page.portrait_rows ?? rows + 2, 1, 10, (v) =>
          this._setPage(this.page, { portrait_rows: v }),
        )}
      </div>
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
    return html`
      <h3>Pages</h3>
      <ul class="list">
        ${pages.map((page, i) => {
          const home = i === homeIndex;
          const status = [
            page.hidden ? 'Hidden' : i === this.page ? 'Showing now' : '',
            home ? 'Start page' : '',
          ]
            .filter(Boolean)
            .join(' · ');
          const fallback = TITLE_DEFAULTS[page.type];
          return html`<li class="item page ${page.hidden ? 'hidden' : ''}">
            <span class="text">
              ${fallback === undefined
                ? html`<span class="name">${pageLabel(page, i)}</span>
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
            <button class="mini home ${home ? 'on' : ''}" aria-pressed=${home}
              aria-label="Start on ${pageLabel(page, i)}" title="Start page"
              ?disabled=${!!page.hidden}
              @click=${() => this._setHome(i)}>⌂</button>
            <button class="mini" aria-label="${page.hidden ? 'Show' : 'Hide'} ${pageLabel(page, i)}"
              ?disabled=${!page.hidden && shown <= 1}
              @click=${() => this._setPage(i, { hidden: !page.hidden, ...(page.hidden ? {} : { home: undefined }) })}>
              ${page.hidden ? 'Show' : 'Hide'}
            </button>
            <button class="mini" aria-label="Move ${pageLabel(page, i)} earlier" ?disabled=${i === 0}
              @click=${() => this._movePage(i, -1)}>↑</button>
            <button class="mini" aria-label="Move ${pageLabel(page, i)} later" ?disabled=${i === pages.length - 1}
              @click=${() => this._movePage(i, 1)}>↓</button>
            ${page.type !== 'room' && page.type !== 'scenes'
              ? html`<button class="mini" aria-label="Delete ${pageLabel(page, i)}"
                  ?disabled=${pages.length <= 1 || (!page.hidden && shown <= 1)}
                  @click=${() => this._removePage(i)}>✕</button>`
              : html`<span class="mini-space"></span>`}
          </li>`;
        })}
      </ul>
      <div class="row add" role="group" aria-label="Add a page">
        <span class="label">Add a page</span>
        ${PAGE_KINDS.filter((k) => k.blank).map(
          (k) => html`<button class="chip" @click=${() => this._addPage(k.blank!)}>
            + ${k.type === 'grid' ? 'Blank page' : k.label}
          </button>`,
        )}
      </div>
      <div class="row add">
        <button
          class="chip"
          ?disabled=${!suggestions.length}
          @click=${() => this._setPages([...pages, ...suggestions])}
        >
          ${suggestions.length
            ? `Add ${suggestions.length} ${suggestions.length === 1 ? 'room' : 'rooms'} from Home Assistant`
            : 'Every room has a page'}
        </button>
      </div>
    `;
  }

  private _setQuick(changes: Partial<QuickPanelConfig>): void {
    const next: Record<string, unknown> = { ...(this.config!.quick_panel || {}), ...changes };
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || (Array.isArray(value) && !value.length)) delete next[key];
    }
    this._set({ quick_panel: Object.keys(next).length ? (next as QuickPanelConfig) : undefined });
  }

  private _renderQuick() {
    const quick = this.config!.quick_panel;
    if (quick === false) return nothing;
    const pinned = quick?.pinned ?? [];
    const players = Object.keys(this.hass?.states ?? {}).filter((id) => id.startsWith('media_player.'));
    return html`
      <h3>Quick panel</h3>
      <p class="muted">Pull down from the top edge. Up to four pinned tiles.</p>
      <ul class="list">
        ${pinned.map(
          (id, i) => html`<li class="item page">
            <span class="text"><span class="name">${resolve(this.hass, id).name}</span></span>
            <button class="mini" aria-label="Unpin ${resolve(this.hass, id).name}"
              @click=${() => this._setQuick({ pinned: pinned.filter((_, n) => n !== i) })}>✕</button>
          </li>`,
        )}
      </ul>
      <div class="row add">
        <button class="chip" ?disabled=${pinned.length >= 4}
          @click=${() => this.dispatchEvent(new CustomEvent('pin'))}>Pin a device</button>
      </div>
      ${players.length
        ? html`<div class="row players" role="group" aria-label="Speaker">
            <span>Speaker</span>
            <button class="chip ${quick?.media_player ? '' : 'on'}" aria-pressed=${!quick?.media_player}
              @click=${() => this._setQuick({ media_player: undefined })}>Whatever's playing</button>
            ${players.map(
              (id) => html`<button class="chip ${quick?.media_player === id ? 'on' : ''}"
                aria-pressed=${quick?.media_player === id}
                @click=${() => this._setQuick({ media_player: id })}>
                ${this.hass?.states[id]?.attributes.friendly_name ?? resolve(this.hass, id).name}
              </button>`,
            )}
          </div>`
        : nothing}
    `;
  }

  private _renderLook() {
    const config = this.config!;
    const theme = config.theme ?? 'auto';
    return html`
      <h3>Look</h3>
      <div class="row" role="group" aria-label="Theme">
        ${THEMES.map(
          (t) => html`<button class="chip ${theme === t.value ? 'on' : ''}" aria-pressed=${theme === t.value}
            @click=${() => this._set({ theme: t.value === 'auto' ? undefined : t.value })}>${t.label}</button>`,
        )}
      </div>
      <label class="field">
        Wallpaper: an image under /local/ or any CSS background
        <input
          type="text"
          placeholder="/local/wallpaper.jpg"
          .value=${config.background ?? ''}
          @change=${(e: Event) => this._set({ background: toBackground((e.target as HTMLInputElement).value) })}
        />
      </label>
      <div class="row tint">
        <span>Glass tint</span>
        <button class="chip ${config.tint ? '' : 'on'}" aria-pressed=${!config.tint}
          @click=${() => this._set({ tint: undefined })}>From wallpaper</button>
        <input
          type="color"
          aria-label="Tint color"
          .value=${/^#[0-9a-f]{6}$/i.test(config.tint ?? '') ? config.tint! : '#a77d58'}
          @change=${(e: Event) => this._set({ tint: (e.target as HTMLInputElement).value })}
        />
      </div>
      ${this.local
        ? html`<h3>This tablet</h3>
            <p class="muted">This tablet shows its own saved layout, not the dashboard's.</p>
            <button class="chip" @click=${() => this.dispatchEvent(new CustomEvent('reset'))}>
              Use the dashboard's layout
            </button>`
        : nothing}
    `;
  }

  protected render() {
    if (!this.config) return nothing;
    return html`${this._renderThisPage()} ${this._renderPages()} ${this._renderQuick()} ${this._renderLook()}`;
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
        font-size: 17px;
      }

      .page {
        gap: 6px;
        padding-right: 0;
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
        background: rgb(255 255 255 / 8%);
      }

      .mini {
        flex: none;
        min-width: 44px;
        height: 40px;
        padding: 0 12px;
        border-radius: 999px;
        font-size: 15px;
        background: rgb(255 255 255 / 12%);
      }

      .mini.home.on {
        background: var(--lf-accent);
        color: #1c1c1e;
      }

      .mini-space {
        width: 44px;
      }

      .add {
        margin-top: 10px;
      }

      .add .label {
        width: 100%;
        font-size: 15px;
        color: var(--lf-muted);
      }

      .field {
        margin-top: 14px;
      }

      .tint {
        margin-top: 14px;
        font-size: 17px;
      }

      .tint span {
        flex: 1;
      }

      .players {
        margin-top: 14px;
        font-size: 17px;
      }

      .players span {
        width: 100%;
      }

      input[type='color'] {
        width: 52px;
        height: 44px;
        padding: 0;
        border: 0;
        border-radius: 12px;
        background: none;
        cursor: pointer;
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
