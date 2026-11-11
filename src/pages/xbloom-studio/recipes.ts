import { css, html, nothing } from 'lit';
import '../../confirm-button';
import { define } from '../../define';
import { formatNumber } from '../../history';
import { icon } from '../../icons';
import { controls, sectionLabel } from '../../theme';
import './editor';
import {
  BACK,
  BUSY,
  CUPS,
  StudioBase,
  grindOf,
  isTea,
  metricTiles,
  pourTimeline,
  pourTotal,
  ratioOf,
  recipeArt,
  recipeMetrics,
  rpmOf,
  studioStyles,
  tempLabel,
  xbAsk,
  xbDo,
  type Recipe,
} from './shared';

/**
 * The Recipes tab. My recipes: every recipe xBloom Studio keeps, as cards to
 * search and filter, each opening to its numbers and pours, with Brew this,
 * Edit, Duplicate, Delete, Archive, and writing it to one of the machine's
 * Easy slots. Community: xBloom's public recipe hub, searched and sorted,
 * each recipe opening to its details, with Import to add it to My recipes.
 */

type Kind = 'all' | 'coffee' | 'tea';
type Sort = 'date' | 'likes' | 'downloads';

/** A recipe from the community hub, as a search lists it. */
interface HubRecipe extends Recipe {
  share_url?: string;
  author?: string;
  likes?: number;
  official?: boolean;
  origin?: string[] | string;
  process?: string[] | string;
  roast?: string;
  flavor?: string[] | string;
  description?: string;
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []).filter((s) => s.trim());

export class LuxFrameXBloomRecipes extends StudioBase {
  static properties = {
    ...StudioBase.properties,
    recipes: { attribute: false },
    loadError: { attribute: false },
    _view: { state: true },
    _query: { state: true },
    _kind: { state: true },
    _open: { state: true },
    _editing: { state: true },
    _message: { state: true },
    _hub: { state: true },
  };

  /** Every recipe xBloom Studio keeps; undefined while loading. */
  declare recipes?: Recipe[];
  declare loadError?: string;
  declare _view: 'mine' | 'community';
  declare _query: string;
  declare _kind: Kind;
  /** The recipe open, by name. */
  declare _open?: string;
  /** The editor: a recipe to change or copy, or a new one. */
  declare _editing?: { recipe?: Recipe; copy?: boolean };
  declare _message?: string;
  declare _hub: {
    query: string;
    sort: Sort;
    kind?: 'coffee' | 'tea';
    results?: HubRecipe[];
    total?: number;
    page: number;
    loading?: boolean;
    error?: string;
    open?: HubRecipe;
    imported: string[];
  };

  private _messageTimer?: number;

  constructor() {
    super();
    this._view = 'mine';
    this._query = '';
    this._kind = 'all';
    this._hub = { query: '', sort: 'likes', page: 1, imported: [] };
  }

  /** Opens a recipe, as the Brew tab's "All recipes" asks. */
  openRecipe(name: string): void {
    this._view = 'mine';
    this._open = name;
  }

  private _say(message: string): void {
    this._message = message;
    window.clearTimeout(this._messageTimer);
    this._messageTimer = window.setTimeout(() => (this._message = undefined), 4000);
  }

  protected render() {
    if (this._editing) {
      return html`<luxframe-xbloom-editor .hass=${this.hass} .recipe=${this._editing.recipe} ?copy=${Boolean(this._editing.copy)}
        @close=${() => (this._editing = undefined)}
        @saved=${(e: CustomEvent<string>) => {
          this._editing = undefined;
          this._open = e.detail;
          this._say(`Saved “${e.detail}”.`);
          this._reload();
        }}></luxframe-xbloom-editor>`;
    }
    if (this._view === 'mine' && this._open) {
      const r = this.recipes?.find((x) => x.name === this._open);
      if (r) return html`${this._detail(r)}${this._toast()}`;
    }
    if (this._view === 'community' && this._hub.open) return html`${this._hubDetail(this._hub.open)}${this._toast()}`;
    return html`
      <div class="segmented" role="tablist" aria-label="Recipes">
        ${(['mine', 'community'] as const).map(
          (v) => html`<button role="tab" aria-selected=${this._view === v} class=${this._view === v ? 'active' : ''}
            @click=${() => (this._view = v)}>${v === 'mine' ? 'My recipes' : 'Community'}</button>`,
        )}
      </div>
      ${this._view === 'mine' ? this._mine() : this._community()}
      ${this._toast()}
    `;
  }

  private _toast() {
    return this._message ? html`<div class="toast glass" role="status">${this._message}</div>` : nothing;
  }

  // ── My recipes ─────────────────────────────────────────────────────────

  private _mine() {
    const q = this._query.trim().toLowerCase();
    const shown = (this.recipes ?? [])
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .filter((r) => this._kind === 'all' || (this._kind === 'tea') === isTea(r))
      .sort((a, b) => a.name.localeCompare(b.name));
    const picked = this._usable('select.recipe')?.state;
    return html`
      <div class="bar">
        <input class="field search" type="search" placeholder="Search recipes" aria-label="Search recipes" .value=${this._query}
          @input=${(e: Event) => (this._query = (e.target as HTMLInputElement).value)} />
        <div class="chips" role="radiogroup" aria-label="Kind">
          ${(['all', 'coffee', 'tea'] as const).map(
            (k) => html`<button class="chip ${this._kind === k ? 'on' : ''}" role="radio" aria-checked=${this._kind === k}
              @click=${() => (this._kind = k)}>${k === 'all' ? 'All' : k === 'coffee' ? 'Coffee' : 'Tea'}</button>`,
          )}
        </div>
        <button class="pill on new" @click=${() => (this._editing = {})}>${icon('plus', 20)} New recipe</button>
      </div>
      ${this.loadError
        ? html`<p class="error">${this.loadError}</p>`
        : !this.recipes
          ? html`<p class="note">Loading recipes…</p>`
          : !shown.length
            ? html`<p class="note">No recipes match.</p>`
            : html`<div class="grid">
                ${shown.map((r) => this._card(r, r.name === picked, () => (this._open = r.name)))}
              </div>`}
    `;
  }

  private _card(r: Recipe, picked: boolean, open: () => void, extra: unknown = nothing) {
    const tea = isTea(r);
    const ratio = ratioOf(r);
    const water = pourTotal(r);
    return html`<button class="recipe-card glass ${picked ? 'picked' : ''}" @click=${open}>
      ${recipeArt(this.hass, r, 'art-card')}
      <div class="rc-body">
        <div class="rc-top">
          <span class="badge ${tea ? 'tea' : ''}">${CUPS[Number(r.cup_type)] ?? 'Recipe'}</span>
          ${picked ? html`<span class="badge">Selected</span>` : nothing}
        </div>
        <div class="rc-name serif">${r.name}</div>
        <div class="rc-specs">
          ${!tea && ratio ? html`<span>1:${formatNumber(this.hass, ratio, '0.5')}</span>` : nothing}
          ${water ? html`<span>${formatNumber(this.hass, water, '0')} ml</span>` : nothing}
          ${r.pours?.[0]?.temperature_c != null ? html`<span>${tempLabel(this.hass, r.pours[0].temperature_c)}</span>` : nothing}
          ${!tea && grindOf(r) != null ? html`<span>#${grindOf(r)}</span>` : nothing}
        </div>
        ${extra}
      </div>
    </button>`;
  }

  private _detail(r: Recipe) {
    const status = this._state('sensor.brew_status')?.state ?? '';
    const busy = BUSY.includes(status);
    const tea = isTea(r);
    return html`
      <button class="link" @click=${() => (this._open = undefined)}>${BACK} Recipes</button>
      <div class="cols">
        <section class="panel glass">
          ${recipeArt(this.hass, r, 'art-hero')}
          <div class="detail-head">
            <span class="badge ${tea ? 'tea' : ''}">${CUPS[Number(r.cup_type)] ?? 'Recipe'}</span>
            <h1 class="serif">${r.name}</h1>
            ${r.source ? html`<span class="muted">From ${r.source}</span>` : nothing}
          </div>
          ${metricTiles(recipeMetrics(this.hass, r))}
          ${!tea && rpmOf(r) != null ? html`<div class="kv gap"><span>Grinder speed</span><span>${rpmOf(r)} rpm</span></div>` : nothing}
        </section>
        <section class="panel glass">
          <h2>Pours</h2>
          ${pourTimeline(this.hass, r)}
        </section>
      </div>
      ${busy ? html`<p class="note">Finish or cancel the brew under way first.</p>` : nothing}
      <div class="actions">
        <button class="pill on" ?disabled=${busy} @click=${() => this._brew(r)}>${icon('play', 22)} Brew this</button>
        <button class="pill glass" @click=${() => (this._editing = { recipe: r })}>Edit</button>
        <button class="pill glass" @click=${() => (this._editing = { recipe: r, copy: true })}>Duplicate</button>
        <luxframe-confirm-button quiet label="Archive" confirm-label="Tap again to archive"
          @confirm=${() => this._archive(r)}></luxframe-confirm-button>
        <luxframe-confirm-button quiet label="Delete" confirm-label="Tap again to delete"
          @confirm=${() => this._delete(r)}></luxframe-confirm-button>
      </div>
      ${tea ? nothing : this._slots({ recipe_name: r.name }, busy)}
    `;
  }

  /** Easy slots A, B and C: the machine's own buttons for a favorite recipe. */
  private _slots(source: Record<string, string>, busy: boolean) {
    return html`
      <section class="panel glass gap">
        <h3>Write to an Easy slot</h3>
        <p class="note">Puts this recipe on one of the machine’s own buttons, for brewing without Home Assistant.</p>
        <div class="chips wrap">
          ${['A', 'B', 'C'].map(
            (slot) => html`<button class="chip" ?disabled=${busy} @click=${async () => {
              this._say(`Writing to slot ${slot}…`);
              try {
                await xbDo(this.hass, 'write_slot', { slot, ...source });
                this._say(`Written to slot ${slot}.`);
              } catch (err) {
                this._say(`Slot ${slot} wasn’t written: ${err instanceof Error ? err.message : err}`);
              }
            }}>Slot ${slot}</button>`,
          )}
        </div>
      </section>
    `;
  }

  /** Picks the recipe on the Brew tab, which gets it ready on the machine. */
  private _brew(r: Recipe): void {
    const select = this._state('select.recipe');
    const options: string[] = select?.attributes.options ?? [];
    const option = options.find((o) => o === r.name) ?? options.find((o) => o.startsWith(r.name));
    if (!select || !option) {
      this._say('That recipe isn’t in the Recipe list yet. Refresh recipes under Settings.');
      return;
    }
    this._choose(select, option);
    this._open = undefined;
    this._go('brew');
  }

  private async _delete(r: Recipe): Promise<void> {
    const result = await xbAsk<{ ok: boolean }>(this.hass, 'delete_recipe', { name: r.name });
    if (result && !result.ok) {
      this._say(`“${r.name}” wasn’t deleted.`);
      return;
    }
    this._open = undefined;
    this._say(`Deleted “${r.name}”.`);
    this._reload();
  }

  private async _archive(r: Recipe): Promise<void> {
    try {
      await xbAsk(this.hass, 'archive_recipe', { name: r.name });
      this._open = undefined;
      this._say(`Archived “${r.name}”. Restore it under Settings.`);
      this._reload();
    } catch (err) {
      this._say(`“${r.name}” wasn’t archived: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Community ──────────────────────────────────────────────────────────

  private async _search(page = 1): Promise<void> {
    const hub = this._hub;
    this._hub = { ...hub, loading: true, error: undefined, page };
    try {
      const data: Record<string, unknown> = { sort: hub.sort, page, page_size: 20 };
      if (hub.query.trim()) data.keyword = hub.query.trim();
      if (hub.kind) data.kind = hub.kind;
      const result = await xbAsk<{ ok: boolean; error?: string; recipes?: HubRecipe[]; total?: number }>(
        this.hass, 'search_community', data,
      );
      if (!result?.ok) throw new Error(result?.error ?? 'The community hub didn’t answer.');
      const found = result.recipes ?? [];
      this._hub = {
        ...this._hub,
        loading: false,
        results: page > 1 ? [...(this._hub.results ?? []), ...found] : found,
        total: result.total,
      };
    } catch (err) {
      this._hub = { ...this._hub, loading: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async _openHub(item: HubRecipe): Promise<void> {
    this._hub = { ...this._hub, open: item };
    if (item.id == null) return;
    try {
      const result = await xbAsk<{ ok: boolean; recipe?: HubRecipe }>(this.hass, 'get_community_recipe', { recipe_id: Number(item.id) });
      if (result?.ok && result.recipe && this._hub.open === item) {
        this._hub = { ...this._hub, open: { ...item, ...result.recipe } };
      }
    } catch {
      // The search's summary stays on screen.
    }
  }

  private async _import(item: HubRecipe): Promise<void> {
    if (!item.share_url) return;
    this._say('Importing…');
    try {
      const result = await xbAsk<{ ok?: boolean; name?: string; error?: string }>(this.hass, 'save_shared_recipe', { share_url: item.share_url });
      if (result && result.ok === false) throw new Error(result.error ?? 'not imported');
      this._hub = { ...this._hub, imported: [...this._hub.imported, item.share_url] };
      this._say(`Imported “${result?.name ?? item.name}” into My recipes.`);
      this._reload();
    } catch (err) {
      this._say(`Not imported: ${err instanceof Error ? err.message : err}`);
    }
  }

  private _community() {
    const hub = this._hub;
    const sorts: Array<[Sort, string]> = [['likes', 'Most liked'], ['downloads', 'Most downloaded'], ['date', 'Newest']];
    return html`
      <form class="bar" @submit=${(e: Event) => {
        e.preventDefault();
        this._search();
      }}>
        <input class="field search" type="search" placeholder="Search the xBloom community" aria-label="Search the xBloom community"
          .value=${hub.query} @input=${(e: Event) => (this._hub = { ...hub, query: (e.target as HTMLInputElement).value })} />
        <button class="pill on" type="submit" ?disabled=${hub.loading}>Search</button>
      </form>
      <div class="filters">
        <div class="chips" role="radiogroup" aria-label="Sort">
          ${sorts.map(
            ([v, label]) => html`<button class="chip ${hub.sort === v ? 'on' : ''}" role="radio" aria-checked=${hub.sort === v}
              @click=${() => {
                this._hub = { ...hub, sort: v };
                this._search();
              }}>${label}</button>`,
          )}
        </div>
        <div class="chips" role="radiogroup" aria-label="Kind">
          ${([undefined, 'coffee', 'tea'] as const).map(
            (k) => html`<button class="chip ${hub.kind === k ? 'on' : ''}" role="radio" aria-checked=${hub.kind === k}
              @click=${() => {
                this._hub = { ...hub, kind: k };
                this._search();
              }}>${k === undefined ? 'All' : k === 'coffee' ? 'Coffee' : 'Tea'}</button>`,
          )}
        </div>
      </div>
      <p class="note">Recipes others shared on xBloom’s hub. Import one to keep a copy in My recipes; no xBloom account needed.</p>
      ${hub.error ? html`<p class="error">${hub.error}</p>` : nothing}
      ${hub.results === undefined && !hub.loading
        ? html`<div class="actions"><button class="pill glass" @click=${() => this._search()}>Show popular recipes</button></div>`
        : nothing}
      ${hub.results?.length === 0 ? html`<p class="note">No recipes found.</p>` : nothing}
      ${hub.results?.length
        ? html`
            ${hub.total != null ? html`<p class="note">${hub.total} recipes</p>` : nothing}
            <div class="grid">
              ${hub.results.map((item) =>
                this._card(item, false, () => this._openHub(item), html`<div class="rc-specs">
                  ${item.author ? html`<span>by ${item.author}</span>` : nothing}
                  ${item.likes != null ? html`<span>♥ ${item.likes}</span>` : nothing}
                  ${item.official ? html`<span class="badge">Official</span>` : nothing}
                </div>`),
              )}
            </div>
            ${hub.total != null && hub.results.length < hub.total
              ? html`<div class="actions"><button class="pill glass" ?disabled=${hub.loading} @click=${() => this._search(hub.page + 1)}>Load more</button></div>`
              : nothing}`
        : nothing}
      ${hub.loading ? html`<p class="note">Searching…</p>` : nothing}
    `;
  }

  private _hubDetail(item: HubRecipe) {
    const tags = [...list(item.origin), ...list(item.process), ...list(item.roast), ...list(item.flavor)];
    const imported = item.share_url ? this._hub.imported.includes(item.share_url) : false;
    const busy = BUSY.includes(this._state('sensor.brew_status')?.state ?? '');
    return html`
      <button class="link" @click=${() => (this._hub = { ...this._hub, open: undefined })}>${BACK} Community</button>
      <div class="cols">
        <section class="panel glass">
          ${recipeArt(this.hass, item, 'art-hero')}
          <div class="detail-head">
            <div class="rc-top">
              ${item.official ? html`<span class="badge">Official</span>` : html`<span class="badge">Community</span>`}
              ${item.likes != null ? html`<span class="muted">♥ ${item.likes}</span>` : nothing}
            </div>
            <h1 class="serif">${item.name}</h1>
            ${item.author ? html`<span class="muted">by ${item.author}</span>` : nothing}
          </div>
          ${tags.length ? html`<div class="tags">${tags.map((t) => html`<span>${t}</span>`)}</div>` : nothing}
          ${item.description ? html`<p class="description">${item.description}</p>` : nothing}
          ${item.dose_g != null ? metricTiles(recipeMetrics(this.hass, item)) : nothing}
        </section>
        ${item.pours?.length ? html`<section class="panel glass"><h2>Pours</h2>${pourTimeline(this.hass, item)}</section>` : nothing}
      </div>
      <div class="actions">
        <button class="pill on" ?disabled=${!item.share_url || imported} @click=${() => this._import(item)}>
          ${imported ? 'Imported' : 'Import'}
        </button>
      </div>
      ${item.share_url ? this._slots({ share_url: item.share_url }, busy) : nothing}
    `;
  }

  static styles = [
    controls,
    sectionLabel,
    studioStyles,
    css`
      luxframe-confirm-button {
        --luxframe-confirm-min-width: 140px;
      }

      .segmented {
        display: inline-flex;
        gap: 4px;
        margin-bottom: var(--lf-gap);
        padding: 4px;
        border-radius: 999px;
        background: var(--lf-control);
      }

      .segmented button {
        min-height: 40px;
        padding: 0 18px;
        border-radius: 999px;
        background: none;
        font-size: 16px;
        font-weight: 500;
      }

      .segmented button.active {
        color: var(--lf-text-active);
        background: var(--lf-surface-active);
      }

      .bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }

      .search {
        flex: 1 1 260px;
        width: auto;
      }

      .new {
        margin-left: auto;
      }

      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 24px;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: var(--lf-gap);
        margin-top: var(--lf-gap);
      }

      .recipe-card {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 0;
        border-radius: var(--lf-radius);
        text-align: left;
        transition: transform var(--lf-fast);
      }

      .recipe-card:active {
        transform: scale(0.98);
      }

      .recipe-card.picked {
        outline: 2px solid var(--luxframe-xbloom-gold, #e8cd8f);
        outline-offset: -2px;
      }

      .rc-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px 16px 16px;
      }

      .rc-top {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }

      .rc-name {
        font-size: 20px;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }

      .rc-specs {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 12px;
        color: var(--lf-muted);
        font-size: 14px;
        font-variant-numeric: tabular-nums;
      }

      .detail-head {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        margin-top: 16px;
      }

      .detail-head h1 {
        margin: 0;
        font-size: clamp(26px, 3.4vw, 34px);
        font-weight: 400;
      }

      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 14px;
      }

      .tags span {
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--lf-control);
        color: var(--lf-muted);
        font-size: 13px;
      }

      .description {
        margin: 14px 0 0;
        color: var(--lf-muted);
        white-space: pre-line;
      }

      .toast {
        position: sticky;
        bottom: 72px;
        width: fit-content;
        max-width: 90%;
        margin: 16px auto 0;
        padding: 12px 20px;
        border-radius: 999px;
        font-size: 16px;
      }
    `,
  ];
}

define('luxframe-xbloom-recipes', LuxFrameXBloomRecipes);
