import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { resolve } from '../entity';
import { sizeOf } from '../pages/grid';
import type { GridTileConfig, HomeAssistant, TileSize } from '../types';
import { normalizeTile, tileLabel } from './layout';
import { editorStyles } from './sheet';

const SIZES: Array<{ size: TileSize; label: string; w: number; h: number }> = [
  { size: 's', label: 'Small', w: 1, h: 1 },
  { size: 'w', label: 'Wide', w: 2, h: 1 },
  { size: 'm', label: 'Medium', w: 2, h: 2 },
  { size: 'l', label: 'Large', w: 4, h: 2 },
];

/**
 * One tile's settings: its size, its name, what it shows, where it sits, and
 * removing it. Fires `change` with the new tile, `replace` to choose what it
 * shows, `move` with -1 or 1, and `remove`.
 */
export class LuxFrameTileEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    tile: { attribute: false },
    first: { type: Boolean },
    last: { type: Boolean },
  };

  declare hass?: HomeAssistant;
  declare tile?: GridTileConfig | string;
  declare first: boolean;
  declare last: boolean;

  constructor() {
    super();
    this.first = false;
    this.last = false;
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

  protected render() {
    if (!this.tile) return nothing;
    const tile = normalizeTile(this.tile);
    const size = sizeOf(tile);
    const kind = tile.type ?? 'entity';
    const named = kind === 'entity' || kind === 'thermostat';
    const entity = 'entity' in tile ? tile.entity : undefined;
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
    `,
  ];
}

define('luxframe-tile-editor', LuxFrameTileEditor);
