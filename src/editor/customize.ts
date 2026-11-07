import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { resolve } from '../entity';
import type { GridPageConfig, HomeAssistant, LuxFrameConfig, PageConfig, QuickPanelConfig } from '../types';
import { pageLabel, suggestPages } from './layout';
import { editorStyles } from './sheet';

const THEMES: Array<{ value: NonNullable<LuxFrameConfig['theme']>; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'ha', label: 'HA theme' },
];

/**
 * The frame's settings while editing: the current grid page's title, columns
 * and rows; which pages show and in what order; suggested pages from Home
 * Assistant's areas; and the look (theme, wallpaper, tint). Fires `change`
 * with the whole new config, and `reset` to drop this tablet's own layout.
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

  constructor() {
    super();
    this.page = 0;
    this.local = false;
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

  private _setPage(index: number, changes: Partial<GridPageConfig> & { hidden?: boolean }): void {
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
      <input
        type="text"
        aria-label="Page title"
        placeholder="Title (optional)"
        .value=${page.title ?? ''}
        @change=${(e: Event) => this._setPage(this.page, { title: (e.target as HTMLInputElement).value.trim() })}
      />
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
    const suggestions = suggestPages(this.hass, pages);
    return html`
      <h3>Pages</h3>
      <ul class="list">
        ${pages.map(
          (page, i) => html`<li class="item page ${page.hidden ? 'hidden' : ''}">
            <span class="text">
              <span class="name">${pageLabel(page, i)}</span>
              <div class="sub">${page.hidden ? 'Hidden' : i === this.page ? 'Showing now' : ''}</div>
            </span>
            <button class="mini" aria-label="${page.hidden ? 'Show' : 'Hide'} ${pageLabel(page, i)}"
              ?disabled=${!page.hidden && shown <= 1}
              @click=${() => this._setPage(i, { hidden: !page.hidden })}>
              ${page.hidden ? 'Show' : 'Hide'}
            </button>
            <button class="mini" aria-label="Move ${pageLabel(page, i)} earlier" ?disabled=${i === 0}
              @click=${() => this._movePage(i, -1)}>↑</button>
            <button class="mini" aria-label="Move ${pageLabel(page, i)} later" ?disabled=${i === pages.length - 1}
              @click=${() => this._movePage(i, 1)}>↓</button>
            ${page.type === 'grid'
              ? html`<button class="mini" aria-label="Delete ${pageLabel(page, i)}"
                  ?disabled=${pages.length <= 1 || (!page.hidden && shown <= 1)}
                  @click=${() => this._removePage(i)}>✕</button>`
              : html`<span class="mini-space"></span>`}
          </li>`,
        )}
      </ul>
      <div class="row add">
        <button class="chip" @click=${() => this._setPages([...pages, { type: 'grid', tiles: [] }])}>
          Add a page
        </button>
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

      .page.hidden .name {
        opacity: 0.55;
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

      .mini-space {
        width: 44px;
      }

      .add {
        margin-top: 10px;
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
