import { dump, load } from 'js-yaml';
import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { define } from '../define';
import { domainOf, resolve } from '../entity';
import { MAX_ROWS, sizeFor, sizeOf, spanOf } from '../sizes';
import type { CardTileConfig, GridTileConfig, HomeAssistant, PhotoTileConfig, TileSize } from '../types';
import { normalizeTile, tileLabel } from './layout';
import './card-visual';
import './photo-settings';
import type { PhotoSettings } from './photo-settings';

/** What a tap on a device's tile does: open its controls, or work it like a switch. */
const SWITCHABLE = new Set(['light', 'switch', 'fan', 'input_boolean']);
import { editorStyles } from './sheet';

const FITS: Array<{ fit: NonNullable<CardTileConfig['fit']>; label: string; hint: string }> = [
  { fit: 'stretch', label: 'Stretch', hint: 'Fills the tile if the card can grow; shrinks to fit if it\u2019s taller.' },
  { fit: 'scroll', label: 'Scroll', hint: 'Fills the tile like Stretch, but a taller card keeps its size and scrolls.' },
  {
    fit: 'cover',
    label: 'Fill and crop',
    hint: 'Fills the tile. Picture cards crop the picture and keep their badges inside; other cards scale as a whole and lose their edges.',
  },
  { fit: 'contain', label: 'Fit inside', hint: 'Shows all of the card, centered, smaller if it\u2019s too tall.' },
];

const SIZES: Array<{ size: TileSize; label: string; w: number; h: number }> = [
  { size: 's', label: 'Small', w: 1, h: 1 },
  { size: 'w', label: 'Wide', w: 2, h: 1 },
  { size: 'm', label: 'Medium', w: 2, h: 2 },
  { size: 'l', label: 'Large', w: 4, h: 2 },
];

/**
 * One tile's settings: its size (a preset, or any width and height in grid
 * cells), its name, what it shows, where it sits, and removing it. Fires `change` with the new tile, `replace` to choose what it
 * shows, `move` with -1 or 1, and `remove`.
 */
export class LuxFrameTileEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    tile: { attribute: false },
    first: { type: Boolean },
    last: { type: Boolean },
    columns: { type: Number },
    _yaml: { state: true },
    _error: { state: true },
    _mode: { state: true },
    _noVisual: { state: true },
  };

  declare hass?: HomeAssistant;
  declare tile?: GridTileConfig | string;
  declare first: boolean;
  declare last: boolean;
  /** The grid's width in columns, the widest a tile can be. */
  declare columns: number;
  /** A card tile's YAML while it's being edited, before Apply. */
  declare _yaml?: string;
  declare _error?: string;
  /** A card tile edited with the card's own editor, or as YAML. */
  declare _mode: 'visual' | 'yaml';
  /** Why the card's visual editor can't be used, once it's known. */
  declare _noVisual?: string;
  /** The card type `_noVisual` is about. */
  private _cardType?: string;

  constructor() {
    super();
    this.first = false;
    this.last = false;
    this.columns = 4;
    this._mode = 'visual';
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('tile')) {
      this._yaml = undefined;
      this._error = undefined;
      const tile = this.tile && typeof this.tile === 'object' && this.tile.type === 'card' ? this.tile : undefined;
      const type = typeof tile?.card?.type === 'string' ? tile.card.type : undefined;
      if (type !== this._cardType) {
        // A new card: its own editor, if it has one; a blank one is pasted.
        this._cardType = type;
        this._noVisual = undefined;
        this._mode = type ? 'visual' : 'yaml';
      }
    }
  }

  private _applyCard(): void {
    if (this._yaml === undefined) return;
    let card: unknown;
    try {
      card = load(this._yaml);
    } catch (e) {
      const reason = (e as { reason?: string }).reason;
      this._error = `That isn\u2019t valid YAML${reason ? ` (${reason})` : ''}`;
      return;
    }
    if (!card || typeof card !== 'object' || Array.isArray(card) || typeof (card as { type?: unknown }).type !== 'string') {
      this._error = 'A card needs a type, such as \u201ctype: thermostat\u201d';
      return;
    }
    this._set({ card });
  }

  private _renderCard(tile: CardTileConfig) {
    const text = this._yaml ?? (tile.card?.type ? dump(tile.card, { lineWidth: -1 }) : '');
    const visual = this._mode === 'visual' && !this._noVisual && !!tile.card?.type;
    return html`
      <h3>Card</h3>
      <div class="row" role="group" aria-label="Edit the card">
        <button class="chip ${visual ? 'on' : ''}" aria-pressed=${visual}
          ?disabled=${!!this._noVisual || !tile.card?.type}
          @click=${() => (this._mode = 'visual')}>Visual editor</button>
        <button class="chip ${visual ? '' : 'on'}" aria-pressed=${!visual}
          @click=${() => (this._mode = 'yaml')}>YAML</button>
      </div>
      ${visual
        ? html`<luxframe-card-visual
            .hass=${this.hass}
            .card=${tile.card}
            @change=${(e: CustomEvent<{ card: Record<string, unknown> }>) => this._set({ card: e.detail.card })}
            @unavailable=${(e: CustomEvent<{ message: string }>) => (this._noVisual = e.detail.message)}
          ></luxframe-card-visual>`
        : this._renderYaml(text)}
      ${this._noVisual ? html`<p class="hint muted">${this._noVisual}</p>` : nothing}
      ${this._renderFitAndLook(tile)}
    `;
  }

  private _renderYaml(text: string) {
    return html`
      <textarea
        aria-label="Card YAML"
        spellcheck="false"
        autocapitalize="off"
        placeholder=${'type: thermostat\nentity: climate.living_room'}
        .value=${text}
        @input=${(e: Event) => {
          this._yaml = (e.target as HTMLTextAreaElement).value;
          this._error = undefined;
        }}
      ></textarea>
      <p class="hint muted">
        Paste a card from Home Assistant: open the card's editor there and choose Show code editor.
      </p>
      ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
      <div class="row">
        <button class="chip on" ?disabled=${this._yaml === undefined} @click=${this._applyCard}>Apply</button>
      </div>
    `;
  }

  private _renderFitAndLook(tile: CardTileConfig) {
    const glassy = tile.glass !== false;
    const fit = tile.fit ?? 'stretch';
    return html`
      <h3>Fit</h3>
      <div class="row" role="group" aria-label="Fit">
        ${FITS.map(
          (f) => html`<button
            class="chip ${fit === f.fit ? 'on' : ''}"
            aria-pressed=${fit === f.fit}
            @click=${() => this._set({ fit: f.fit === 'stretch' ? undefined : f.fit })}
          >
            ${f.label}
          </button>`,
        )}
      </div>
      <p class="hint muted">${FITS.find((f) => f.fit === fit)?.hint}</p>

      <h3>Background</h3>
      <div class="row" role="group" aria-label="Background">
        <button class="chip ${glassy ? 'on' : ''}" aria-pressed=${glassy} @click=${() => this._set({ glass: undefined })}>
          Glass
        </button>
        <button class="chip ${glassy ? '' : 'on'}" aria-pressed=${!glassy} @click=${() => this._set({ glass: false })}>
          The card's own
        </button>
      </div>
    `;
  }

  private _fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /** Sets fields on the tile; a plain entity tile stays a bare id when it can. */
  private _set(changes: Partial<Record<string, unknown>>): void {
    const next: Record<string, unknown> = { ...normalizeTile(this.tile!), ...changes };
    for (const [key, value] of Object.entries(next)) if (value === undefined || value === '') delete next[key];
    const keys = Object.keys(next).filter((k) => k !== 'type');
    const plain = (next.type ?? 'entity') === 'entity' && keys.length === 1 && keys[0] === 'entity';
    this._fire('change', { tile: plain ? (next.entity as string) : (next as unknown as GridTileConfig) });
  }

  private _stepper(label: string, value: number, max: number, set: (v: number) => void) {
    return html`<div class="setting">
      <span>${label}</span>
      <div class="stepper" role="group" aria-label=${label}>
        <button aria-label="Less ${label.toLowerCase()}" ?disabled=${value <= 1} @click=${() => set(value - 1)}>−</button>
        <output>${value}</output>
        <button aria-label="More ${label.toLowerCase()}" ?disabled=${value >= max} @click=${() => set(value + 1)}>+</button>
      </div>
    </div>`;
  }

  protected render() {
    if (!this.tile) return nothing;
    const tile = normalizeTile(this.tile);
    const size = sizeOf(tile);
    const [w, h] = spanOf(tile, this.columns);
    const kind = tile.type ?? 'entity';
    const named = kind === 'entity' || kind === 'switch' || kind === 'thermostat';
    const entity = 'entity' in tile ? tile.entity : undefined;
    const switchable = (kind === 'entity' || kind === 'switch') && !!entity && SWITCHABLE.has(domainOf(entity));
    const fallbackName = entity ? resolve(this.hass, entity).name : '';

    return html`
      <h3>Size</h3>
      <div class="row" role="group" aria-label="Size">
        ${SIZES.map(
          (s) => html`<button
            class="chip size ${size === s.size ? 'on' : ''}"
            aria-pressed=${size === s.size}
            @click=${() => this._set({ size: s.size })}
          >
            <span class="shape" style="--w: ${s.w}; --h: ${s.h}" aria-hidden="true"></span>
            ${s.label}
          </button>`,
        )}
      </div>
      <div class="settings">
        ${this._stepper('Width', w, Math.max(1, this.columns), (v) => this._set({ size: sizeFor(v, h) }))}
        ${this._stepper('Height', h, MAX_ROWS, (v) => this._set({ size: sizeFor(w, v) }))}
      </div>

      ${named
        ? html`<h3>Name</h3>
            <input
              type="text"
              aria-label="Name"
              placeholder=${fallbackName}
              .value=${'name' in tile ? (tile.name ?? '') : ''}
              @change=${(e: Event) => this._set({ name: (e.target as HTMLInputElement).value.trim() })}
            />`
        : nothing}

      ${switchable
        ? html`<h3>A tap</h3>
            <div class="row" role="group" aria-label="A tap">
              <button class="chip ${kind === 'entity' ? 'on' : ''}" aria-pressed=${kind === 'entity'}
                @click=${() => this._set({ type: undefined })}>Opens its controls</button>
              <button class="chip ${kind === 'switch' ? 'on' : ''}" aria-pressed=${kind === 'switch'}
                @click=${() => this._set({ type: 'switch' })}>Turns it on and off</button>
            </div>
            <p class="muted hint">
              ${kind === 'switch'
                ? 'Anywhere on the tile. Drag up or down to dim; a dimmed light shows its level.'
                : 'Tap the icon to turn it on and off. Drag up or down to dim.'}
            </p>`
        : nothing}

      ${kind === 'card' ? this._renderCard(tile as CardTileConfig) : nothing}

      ${kind === 'photo'
        ? html`<luxframe-photo-settings
            .hass=${this.hass}
            .value=${tile as PhotoTileConfig}
            @change=${(e: CustomEvent<PhotoSettings>) => this._set({ ...e.detail })}
          ></luxframe-photo-settings>`
        : nothing}

      <h3>Shows</h3>
      <div class="row">
        <span class="shows">${entity ? fallbackName : tileLabel(this.hass, tile)}</span>
        <button class="chip" @click=${() => this._fire('replace')}>Change…</button>
      </div>

      <h3>Position</h3>
      <div class="row">
        <button class="chip" ?disabled=${this.first} @click=${() => this._fire('move', -1)}>Move earlier</button>
        <button class="chip" ?disabled=${this.last} @click=${() => this._fire('move', 1)}>Move later</button>
      </div>

      <div class="row end">
        <button class="chip danger" @click=${() => this._fire('remove')}>Remove tile</button>
      </div>
    `;
  }

  static styles = [
    editorStyles,
    css`
      .size {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }

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

      .shape {
        width: calc(var(--w) * 7px);
        height: calc(var(--h) * 7px);
        border-radius: 3px;
        border: 2px solid currentColor;
      }

      .shows {
        flex: 1;
        min-width: 0;
        font-size: 17px;
      }

      .end {
        margin-top: 24px;
      }

      textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 180px;
        padding: 12px 14px;
        border: 0;
        border-radius: 14px;
        background: rgb(127 127 127 / 16%);
        color: inherit;
        font: 14px/1.5 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        resize: vertical;
        tab-size: 2;
      }

      .hint {
        margin: 8px 0 0;
        font-size: 15px;
      }

      .error {
        margin: 8px 0 0;
        color: #ff6961;
        font-size: 15px;
      }
    `,
  ];
}

define('luxframe-tile-editor', LuxFrameTileEditor);
