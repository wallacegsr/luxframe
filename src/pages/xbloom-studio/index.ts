import { css, html, nothing, type PropertyValues } from 'lit';
import { define } from '../../define';
import '../grid';
import { controls, pageStyles, sectionLabel } from '../../theme';
import type {
  GridPageConfig,
  GridTileConfig,
  TileSize,
  XBloomCardConfig,
  XBloomCardName,
  XBloomPageConfig,
} from '../../types';
import { record } from './brewlog';
import { CARD_NAMES } from './cards';
import './recipes';
import type { LuxFrameXBloomRecipes } from './recipes';
import './settings';
import { DOTS, RELOAD_EVENT, StudioBase, TAB_EVENT, xbAsk, type Recipe } from './shared';

export { studioEntities, type StudioEntities } from './shared';

/**
 * The xBloom page with the xBloom Studio integration (Alshekhi/xbloom-studio),
 * which has no panel of its own: built from its entities and services, in
 * four tabs. Brew: the machine now and the recipe to brew. Recipes: My
 * recipes and the community hub. Manual: the grinder, brewer and scale on
 * their own. Settings: connection, Easy slots, archived recipes, maintenance
 * and firmware.
 */

const TABS = ['brew', 'recipes', 'manual', 'settings'] as const;
type Tab = (typeof TABS)[number];
/** The tabs laid out as a grid of cards, each with its cards. */
type LaidOut = 'brew' | 'manual';
const CARDS: Record<LaidOut, XBloomCardName[]> = {
  brew: ['machine', 'recipe', 'graph', 'brew'],
  manual: ['grinder', 'pour', 'scale'],
};

/** The cards as they come, until moved or resized: three columns of two on a tablet held sideways. */
export const DEFAULT_LAYOUT: Record<LaidOut, XBloomCardConfig[]> = {
  brew: [
    { card: 'machine', size: '2x2' },
    { card: 'recipe', size: '2x2' },
    { card: 'graph', size: '2x1' },
    { card: 'brew', size: '2x1' },
  ],
  manual: [
    { card: 'grinder', size: '2x2' },
    { card: 'pour', size: '2x2' },
    { card: 'scale', size: '2x2' },
  ],
};

/** Grid tiles carry a card as this type, so the grid's own tiles never take them for theirs. */
type CardTile = { type: 'xbloom'; card: XBloomCardName; size?: XBloomCardConfig['size']; fit?: 'shrink' | 'scroll' };

/** A tab's cards as written, or the default; unknown and repeated cards left out. */
export function cardsOf(config: XBloomPageConfig | undefined, tab: LaidOut): XBloomCardConfig[] {
  const written = config?.[tab];
  if (!Array.isArray(written)) return DEFAULT_LAYOUT[tab];
  const seen = new Set<string>();
  return written.filter((c) => c && CARDS[tab].includes(c.card) && !seen.has(c.card) && seen.add(c.card));
}
const TAB_NAMES: Record<Tab, string> = { brew: 'Brew', recipes: 'Recipes', manual: 'Manual', settings: 'Settings' };

/** Machine Status problems, in words. */
const PROBLEMS: Record<string, string> = {
  no_water: 'The water tank is empty. Fill it to brew.',
  no_beans: 'The grinder is out of beans.',
  dose_water_error: 'The machine couldn’t dose the water. Check the tank and the water line.',
  gear_position_error: 'The grinder’s gear is out of place. Check the grinder.',
};

export class LuxFrameXBloomStudio extends StudioBase {
  static properties = {
    ...StudioBase.properties,
    tab: {},
    config: { attribute: false },
    editing: { type: Boolean, reflect: true },
    _tab: { state: true },
    _recipes: { state: true },
    _loadError: { state: true },
    _sheet: { state: true },
  };

  /** The tab to open on. */
  declare tab?: string;
  declare _tab: Tab;
  declare _recipes?: Recipe[];
  declare _loadError?: string;
  /** The page's config: the layout and size of the Brew and Manual tabs. */
  declare config?: XBloomPageConfig;
  declare editing: boolean;
  /** While editing: a card's options, by index, or the hidden cards to add back. */
  declare _sheet?: { index: number } | { add: true };

  private _portrait = window.matchMedia('(orientation: portrait)');
  private _onRotate = () => this.requestUpdate();

  /** The Recipe select's options when the recipes were last fetched. */
  private _fetchedFor?: string;
  private _loading = false;

  constructor() {
    super();
    this._tab = 'brew';
    this.editing = false;
    this.addEventListener(TAB_EVENT, (e) => {
      const tab = (e as CustomEvent<string>).detail as Tab;
      if (TABS.includes(tab)) this._show(tab);
    });
    this.addEventListener(RELOAD_EVENT, () => this._fetch());
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._portrait.addEventListener('change', this._onRotate);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._portrait.removeEventListener('change', this._onRotate);
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('tab') && TABS.includes(this.tab as Tab)) this._tab = this.tab as Tab;
    if (changed.has('editing') && !this.editing) this._sheet = undefined;
    if (changed.has('hass') && this.hass) {
      record(this.hass, this.entities);
      // xBloom Studio's Recipe select lists every recipe by name, so a change
      // there means recipes were added, renamed or removed.
      const options = JSON.stringify(this._state('select.recipe')?.attributes.options ?? []);
      if (options !== this._fetchedFor) {
        this._fetchedFor = options;
        this._fetch();
      }
    }
  }

  private _show(tab: Tab): void {
    this._tab = tab;
    this.scrollIntoView?.({ block: 'start' });
  }

  private async _fetch(): Promise<void> {
    if (this._loading) return;
    this._loading = true;
    try {
      const result = await xbAsk<{ recipes?: Recipe[] }>(this.hass, 'list_recipes');
      this._recipes = (result?.recipes ?? []).filter((r) => r && typeof r.name === 'string');
      this._loadError = undefined;
    } catch (err) {
      this._loadError = `Recipes didn’t load: ${err instanceof Error ? err.message : err}`;
    } finally {
      this._loading = false;
    }
  }

  /** The page's heading; none when it's set empty. */
  private get _title(): string {
    return (this.config?.title ?? 'xBloom').trim();
  }

  /** How big everything is drawn; 1 is normal. */
  private get _scale(): number {
    const s = Number(this.config?.scale);
    return Number.isFinite(s) && s > 0 ? Math.min(2, Math.max(0.5, s)) : 1;
  }

  protected render() {
    const laidOut = this._tab === 'brew' || this._tab === 'manual';
    this.toggleAttribute('laid-out', laidOut);
    return html`
      <div class="top" style="zoom: ${this._scale}">
      <div class="head">
        ${this._title ? html`<h1>${this._title}</h1>` : nothing}
        ${this._presence()}
      </div>
      <nav class="tabs" role="tablist" aria-label="xBloom" data-no-swipe>
        ${TABS.map(
          (t) => html`<button role="tab" class="chip ${this._tab === t ? 'on' : ''}" aria-selected=${this._tab === t}
            @click=${() => {
              if (t === 'recipes' && this._tab === 'recipes') {
                this.renderRoot.querySelector<LuxFrameXBloomRecipes>('luxframe-xbloom-recipes')?.openRecipe('');
              }
              this._show(t);
            }}>${DOTS[t]}${TAB_NAMES[t]}</button>`,
        )}
      </nav>
      ${this._problem()}
      </div>
      ${laidOut ? this._grid(this._tab as LaidOut) : html`<div class="scaled" style="zoom: ${this._scale}">${this._page()}</div>`}
      ${this._renderSheet()}
    `;
  }

  // ── The Brew and Manual tabs: cards on a grid ──────────────────────────

  private _grid(tab: LaidOut) {
    const cards = cardsOf(this.config, tab);
    const portrait = this._portrait.matches;
    const columns = Math.max(1, Math.round(portrait ? (this.config?.portrait_columns ?? 2) : (this.config?.columns ?? 6)));
    const rows = Math.max(1, Math.round(this.config?.rows ?? 2));
    const grid: GridPageConfig = {
      type: 'grid',
      columns,
      rows,
      portrait_rows: this.config?.portrait_rows ?? rows + 2,
      tiles: cards.map((c) => ({ type: 'xbloom', card: c.card, size: c.size ?? '2x1', fit: c.fit }) as unknown as GridTileConfig),
    };
    const hidden = CARDS[tab].filter((name) => !cards.some((c) => c.card === name));
    return html`<luxframe-grid
      bare
      .hass=${this.hass}
      .config=${grid}
      ?editing=${this.editing}
      .addable=${hidden.length > 0}
      .renderer=${(tile: GridTileConfig, _shape: TileSize) => {
        const t = tile as unknown as CardTile;
        return html`<luxframe-xbloom-card .hass=${this.hass} .entities=${this.entities} card=${t.card}
          .fit=${t.fit ?? 'shrink'} .scale=${this._scale}></luxframe-xbloom-card>`;
      }}
      .labeler=${(tile: GridTileConfig) => CARD_NAMES[(tile as unknown as CardTile).card] ?? 'Card'}
      @luxframe-tiles-change=${(e: CustomEvent<{ tiles: unknown[] }>) => {
        e.stopPropagation();
        this._setCards(
          tab,
          (e.detail.tiles as CardTile[]).map((t) => ({ card: t.card, size: t.size, ...(t.fit === 'scroll' ? { fit: 'scroll' as const } : {}) })),
        );
      }}
      @luxframe-tile-edit=${(e: CustomEvent<{ index: number }>) => {
        e.stopPropagation();
        this._sheet = { index: e.detail.index };
      }}
      @luxframe-add-tile=${(e: Event) => {
        e.stopPropagation();
        this._sheet = { add: true };
      }}
    ></luxframe-grid>`;
  }

  /** Hands the frame a tab's new cards, to keep in the draft until Done. */
  private _setCards(tab: LaidOut, cards: XBloomCardConfig[]): void {
    this.dispatchEvent(
      new CustomEvent('luxframe-xbloom-change', { detail: { [tab]: cards }, bubbles: true, composed: true }),
    );
  }

  /** While editing: one card's fit and whether it shows, or the hidden cards to add back. */
  private _renderSheet() {
    const sheet = this._sheet;
    const tab = this._tab;
    if (!sheet || !this.editing || (tab !== 'brew' && tab !== 'manual')) return nothing;
    const cards = cardsOf(this.config, tab);
    const close = () => (this._sheet = undefined);
    if ('add' in sheet) {
      const hidden = CARDS[tab].filter((name) => !cards.some((c) => c.card === name));
      return html`<div class="sheet glass" role="dialog" aria-label="Add a card">
        <div class="sheet-head"><h3>Add a card</h3><button class="chip" @click=${close}>Done</button></div>
        ${hidden.length
          ? html`<div class="chips wrap">
              ${hidden.map(
                (name) => html`<button class="chip" @click=${() => {
                  const back = DEFAULT_LAYOUT[tab].find((c) => c.card === name) ?? { card: name, size: '2x1' as const };
                  this._setCards(tab, [...cards, back]);
                  close();
                }}>${CARD_NAMES[name]}</button>`,
              )}
            </div>`
          : html`<p class="muted">Every card is on the page.</p>`}
      </div>`;
    }
    const card = cards[sheet.index];
    if (!card) return nothing;
    const set = (patch: Partial<XBloomCardConfig>) => {
      const next = cards.map((c, i) => (i === sheet.index ? { ...c, ...patch } : c));
      if (patch.fit === 'shrink') delete next[sheet.index].fit;
      this._setCards(tab, next);
    };
    const fit = card.fit ?? 'shrink';
    return html`<div class="sheet glass" role="dialog" aria-label=${CARD_NAMES[card.card]}>
      <div class="sheet-head"><h3>${CARD_NAMES[card.card]}</h3><button class="chip" @click=${close}>Done</button></div>
      <p class="muted">Drag a card to move it, or its corner to resize it.</p>
      <h4>When it doesn’t fit</h4>
      <div class="chips wrap" role="radiogroup" aria-label="When it doesn’t fit">
        ${(
          [
            ['shrink', 'Shrink to fit'],
            ['scroll', 'Scroll'],
          ] as const
        ).map(
          ([v, label]) => html`<button class="chip ${fit === v ? 'on' : ''}" role="radio" aria-checked=${fit === v}
            @click=${() => set({ fit: v })}>${label}</button>`,
        )}
      </div>
      <div class="sheet-foot">
        <button class="chip" @click=${() => {
          this._setCards(tab, cards.filter((_, i) => i !== sheet.index));
          close();
        }}>Hide this card</button>
      </div>
    </div>`;
  }

  private _page() {
    switch (this._tab) {
      case 'recipes':
        return html`<luxframe-xbloom-recipes .hass=${this.hass} .entities=${this.entities} .recipes=${this._recipes}
          .loadError=${this._loadError}></luxframe-xbloom-recipes>`;
      case 'settings':
        return html`<luxframe-xbloom-settings .hass=${this.hass} .entities=${this.entities}
          .recipes=${this._recipes}></luxframe-xbloom-settings>`;
      default:
        return nothing;
    }
  }

  /** In range or not, and the connection switch. */
  private _presence() {
    const range = this._state('binary_sensor.in_range');
    const connect = this._state('switch.connect');
    const near = range?.state === 'on';
    return html`
      <div class="presence">
        ${range
          ? html`<span class="dot ${near ? 'near' : ''}"></span>
              <span class="muted">${near ? 'In range' : 'Out of range'}</span>`
          : nothing}
        ${connect
          ? html`<button class="chip ${connect.state === 'on' ? 'on' : ''}" aria-pressed=${connect.state === 'on'}
              ?disabled=${connect.state === 'unavailable'} @click=${() => this._toggle('switch.connect')}>
              ${connect.state === 'on' ? 'Connected' : 'Connect'}
            </button>`
          : nothing}
      </div>
    `;
  }

  private _problem() {
    const machine = this._usable('sensor.machine_status');
    if (!machine || machine.state === 'ok') return nothing;
    const text = PROBLEMS[machine.state] ?? this._label(machine, machine.state);
    return html`<div class="banner" role="alert">${text}</div>`;
  }

  static styles = [
    pageStyles,
    controls,
    sectionLabel,
    css`
      :host {
        display: block;
        padding-bottom: 64px;
      }

      /* The Brew and Manual tabs fill the screen; their grid scrolls on its own. */
      :host([laid-out]) {
        display: flex;
        flex-direction: column;
        padding-bottom: 0;
        overflow: hidden;
      }

      :host([laid-out]) luxframe-grid {
        flex: 1;
        min-height: 0;
      }

      .sheet {
        position: fixed;
        left: 50%;
        bottom: 24px;
        z-index: 5;
        box-sizing: border-box;
        width: min(460px, calc(100% - 32px));
        transform: translateX(-50%);
        padding: 18px 20px 20px;
        border-radius: var(--lf-radius);
        box-shadow: 0 18px 40px rgb(0 0 0 / 35%);
      }

      .sheet-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }

      .sheet h3 {
        margin: 0;
      }

      .sheet h4 {
        margin: 16px 0 10px;
      }

      .sheet p {
        margin: 0;
        font-size: 15px;
      }

      .sheet .chips {
        display: flex;
        gap: 8px;
      }

      .sheet .chips.wrap {
        flex-wrap: wrap;
      }

      .sheet-foot {
        margin-top: 18px;
      }

      .head {
        align-items: center;
      }

      .presence {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-left: auto;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--lf-faint);
      }

      .dot.near {
        background: var(--lf-success);
      }

      .tabs {
        display: flex;
        gap: 8px;
        margin-bottom: var(--lf-gap);
        overflow-x: auto;
        scrollbar-width: none;
      }

      .tabs .chip {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding-inline: 18px;
      }

      .tabs .dots {
        width: 16px;
        height: 16px;
        opacity: 0.75;
      }

      .tabs .chip.on .dots {
        opacity: 1;
      }

      .banner {
        margin-bottom: var(--lf-gap);
        padding: 14px 18px;
        border-radius: var(--lf-radius-s);
        color: #fff;
        background: color-mix(in srgb, var(--lf-danger) 82%, transparent);
        font-weight: 500;
      }
    `,
  ];
}

define('luxframe-xbloom-studio', LuxFrameXBloomStudio);
