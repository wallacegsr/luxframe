import { css, html, nothing, type PropertyValues } from 'lit';
import { define } from '../../define';
import { icon } from '../../icons';
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
import { RELOAD_EVENT, StudioBase, TAB_EVENT, xbAsk, type Recipe } from './shared';

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
/** What the machine says is wrong: a few words for the chip, and the whole of it for a tap. */
const PROBLEMS: Record<string, [short: string, full: string]> = {
  no_water: ['Water tank empty', 'The machine says its water tank is empty.'],
  no_beans: ['Out of beans', 'The grinder is out of beans.'],
  dose_water_error: ['Water didn’t dose', 'The machine couldn’t dose the water. Check the tank and the water line.'],
  gear_position_error: ['Grinder gear', 'The grinder’s gear is out of place. Check the grinder.'],
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
    _told: { state: true },
    _link: { state: true },
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

  /** The problem whose whole sentence is showing, under its chip. */
  declare _told?: string;

  /** The connection chip's popover is open. */
  declare _link: boolean;

  private _portrait = window.matchMedia('(orientation: portrait)');
  private _onRotate = () => this.requestUpdate();

  /** The Recipe select's options when the recipes were last fetched. */
  private _fetchedFor?: string;
  private _loading = false;

  constructor() {
    super();
    this._tab = 'brew';
    this.editing = false;
    this._link = false;
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
        <div class="lead">
          ${this._title ? html`<h1>${this._title}</h1>` : nothing}
          <nav class="tabs" role="tablist" aria-label="xBloom" data-no-swipe>
            ${TABS.filter((t) => t !== 'settings').map(
              (t) => html`<button role="tab" class=${this._tab === t ? 'on' : ''} aria-selected=${this._tab === t}
                @click=${() => {
                  if (t === 'recipes' && this._tab === 'recipes') {
                    this.renderRoot.querySelector<LuxFrameXBloomRecipes>('luxframe-xbloom-recipes')?.openRecipe('');
                  }
                  this._show(t);
                }}>${TAB_NAMES[t]}</button>`,
            )}
          </nav>
        </div>
        ${this._problem()}
        <div class="presence" data-no-swipe>
          ${this._presence()}
          <button class="round small ${this._tab === 'settings' ? 'on' : ''}" role="tab" aria-label="Settings"
            aria-selected=${this._tab === 'settings'} @click=${() => this._show('settings')}>${icon('gear', 22)}</button>
        </div>
      </div>
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
          .fit=${t.fit ?? 'shrink'} .scale=${this._scale} .beansLoaded=${this.config?.beans_loaded}
          ?glow=${this.config?.glow !== false}></luxframe-xbloom-card>`;
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
        <div class="sheet-head"><h3>Add a card</h3><button class="round small" aria-label="Close" @click=${close}>✕</button></div>
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
      <div class="sheet-head"><h3>${CARD_NAMES[card.card]}</h3><button class="round small" aria-label="Close" @click=${close}>✕</button></div>
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

  /**
   * The connection, as one chip: connected, in range and ready to connect, or
   * out of range. Connecting takes a tap. Disconnecting is behind a popover,
   * so a stray tap on what reads as a status doesn't drop the machine.
   */
  private _presence() {
    const range = this._state('binary_sensor.in_range');
    const connect = this._state('switch.connect');
    if (!range && !connect) return nothing;
    const near = range ? range.state === 'on' : undefined;
    const on = connect?.state === 'on';
    const label = on ? 'Connected' : near === false ? 'Out of range' : connect ? 'Connect' : 'In range';
    const dot = html`<span class="dot ${on ? 'on' : near ? 'near' : ''}"></span>`;
    // Nothing to connect with: it only tells.
    if (!connect) return html`<span class="chip link still">${dot}${label}</span>`;
    // In range and not connected: the chip is the button.
    const direct = !on && near !== false;
    const open = this._link && !direct;
    const act = () => {
      this._link = false;
      this._toggle('switch.connect');
    };
    return html`<span class="linked">
      <button class="chip link" aria-expanded=${direct ? nothing : open} ?disabled=${connect.state === 'unavailable'}
        @click=${() => (direct ? act() : (this._link = !open))}>${dot}${label}</button>
      ${open
        ? html`<div class="shade" @click=${() => (this._link = false)}></div>
            <div class="told menu" role="dialog" aria-label="Connection">
              <p>${on
                ? near === false ? 'Connected, though the machine reads as out of range.' : 'The machine is in range and connected.'
                : 'The machine isn’t in range. Connecting may not work.'}</p>
              <button class="pill ${on ? 'risky' : ''}" @click=${act}>${on ? 'Disconnect' : 'Try to connect'}</button>
            </div>`
        : nothing}
    </span>`;
  }

  /**
   * What the machine says is wrong, as a chip in the middle of the heading,
   * clear of the connection on its right: it tells, and stops nothing, since
   * the machine is sometimes wrong. A tap says the rest.
   */
  private _problem() {
    const machine = this._usable('sensor.machine_status');
    if (!machine || machine.state === 'ok') return nothing;
    // Fed from a water line, the machine still reports its empty tank.
    const source = this._usable('select.water_source')?.state;
    if (machine.state === 'no_water' && source && !/tank/i.test(source)) return nothing;
    const known = PROBLEMS[machine.state];
    const short = known?.[0] ?? this._label(machine, machine.state);
    const full = known?.[1] ?? short;
    const open = !!full && this._told === machine.state;
    return html`<span class="problem">
      <button class="chip warn" role="status" aria-label=${short} aria-expanded=${open} ?disabled=${!full}
        @click=${() => (this._told = open ? undefined : machine.state)}>
        <span class="bang" aria-hidden="true">!</span><span class="word">${short}</span>
      </button>
      ${open ? html`<span class="told" role="note" @click=${() => (this._told = undefined)}>${full}</span>` : nothing}
    </span>`;
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
        /* In the middle, where every other editor sheet opens. */
        left: 50%;
        top: 50%;
        z-index: 5;
        box-sizing: border-box;
        width: min(460px, calc(100% - 32px));
        transform: translate(-50%, -50%);
        padding: 18px 20px 20px;
        border-radius: var(--lf-radius);
        box-shadow: 0 18px 40px rgb(0 0 0 / 35%);
      }

      /* The darker glass every editor sheet sits on. */
      .sheet.glass {
        background: var(--lf-sheet);
        -webkit-backdrop-filter: var(--lf-blur-strong);
        backdrop-filter: var(--lf-blur-strong);
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

      /* One row over the cards: where you are on the left, the machine on the right. */
      .head {
        align-items: center;
        gap: 10px 16px;
        min-height: 0;
        margin-bottom: var(--lf-gap);
      }

      /* Narrow: the title has a line of its own, and the rest is one row under it. */
      .lead {
        display: contents;
      }

      .head h1 {
        flex-basis: 100%;
      }

      .presence {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-left: auto;
      }

      .linked {
        position: relative;
        display: inline-flex;
      }

      .chip.link {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }

      .dot {
        flex: none;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--lf-faint);
      }

      /* In range and waiting: a ring. Connected: filled. */
      .dot.near {
        background: none;
        box-shadow: inset 0 0 0 2px var(--lf-success);
      }

      .dot.on {
        background: var(--lf-success);
      }

      /* The three tabs as one control. */
      .tabs {
        flex: none;
        display: inline-flex;
        padding: 4px;
        border-radius: 999px;
        background: var(--lf-control);
      }

      .tabs button {
        min-height: 36px;
        padding: 0 18px;
        border-radius: 999px;
        font-size: 16px;
        font-weight: 600;
        background: none;
        transition:
          background-color var(--lf-move),
          color var(--lf-move);
      }

      .tabs button.on {
        color: var(--lf-text-active);
        background: var(--lf-surface-active);
      }

      /* A tap anywhere else closes the popover. */
      .shade {
        position: fixed;
        inset: 0;
        z-index: 3;
      }

      .told.menu {
        left: auto;
        right: 0;
        transform: none;
        display: grid;
        gap: 12px;
      }

      .told.menu p {
        margin: 0;
      }

      .told.menu .pill {
        min-height: 44px;
      }

      .told.menu .pill.risky {
        color: #fff;
        background: color-mix(in srgb, var(--lf-danger) 62%, rgb(40 20 20));
      }

      /* Between the title and the connection, where there's room for it. */
      .problem {
        position: relative;
        display: inline-flex;
        margin-inline: auto;
      }

      /* On a wide screen, the middle of the page whatever is either side. */
      @media (min-width: 960px) {
        .head {
          display: grid;
          /* The middle of the page while both sides leave it room; else as near as they let it. */
          grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr);
        }

        .lead {
          grid-column: 1;
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .head h1 {
          flex-basis: auto;
        }

        .problem {
          grid-column: 2;
          margin-inline: 0;
        }

        .presence {
          grid-column: 3;
          justify-self: end;
        }
      }

      /* Readable on light glass and dark: white on a red deep enough for it. */
      .chip.warn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: #fff;
        background: color-mix(in srgb, var(--lf-danger) 62%, rgb(40 20 20));
      }

      /* Narrow: the mark alone keeps everything on one row; a tap still says what's wrong. */
      @media (max-width: 720px) {
        .chip.warn {
          padding-inline: 12px;
        }

        .chip.warn .word {
          display: none;
        }
      }

      .chip.warn:disabled {
        opacity: 1;
      }

      .bang {
        display: grid;
        place-items: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        font-size: 14px;
        font-weight: 700;
        color: color-mix(in srgb, var(--lf-danger) 62%, rgb(40 20 20));
        background: #fff;
      }

      /* The whole sentence, over the page rather than in it: nothing moves. */
      .told {
        position: absolute;
        top: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%);
        z-index: 4;
        box-sizing: border-box;
        width: max-content;
        max-width: min(320px, 80vw);
        padding: 12px 16px;
        border-radius: var(--lf-radius-s);
        font-size: 15px;
        line-height: 1.35;
        color: var(--lf-text);
        background: var(--lf-sheet);
        -webkit-backdrop-filter: var(--lf-blur-strong);
        backdrop-filter: var(--lf-blur-strong);
        box-shadow: 0 10px 28px rgb(0 0 0 / 30%);
      }
    `,
  ];
}

define('luxframe-xbloom-studio', LuxFrameXBloomStudio);
