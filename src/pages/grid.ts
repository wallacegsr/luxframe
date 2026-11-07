import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { html as staticHtml, literal, type StaticValue } from 'lit/static-html.js';
import { define } from '../define';
import { normalizeTile, tileLabel } from '../editor/layout';
import { pageStyles } from '../theme';
import { MAX_ROWS, shapeOf, sizeFor, spanOf } from '../sizes';
import type { GridPageConfig, GridTileConfig, GridTileType, HomeAssistant, TileSize } from '../types';

/** Tile kinds that are a plain element taking hass, config and size. */
const TILE_TAGS: Partial<Record<GridTileType, StaticValue>> = {
  thermostat: literal`luxframe-thermostat-tile`,
  weather: literal`luxframe-weather-tile`,
  calendar: literal`luxframe-calendar-tile`,
  'now-playing': literal`luxframe-now-playing-tile`,
  camera: literal`luxframe-camera-tile`,
  photo: literal`luxframe-photo-tile`,
  sun: literal`luxframe-sun-tile`,
  todo: literal`luxframe-todo-tile`,
  room: literal`luxframe-room-tile`,
  card: literal`luxframe-card-tile`,
};

const HOLD_MS = 1000;
const MOVE_TOLERANCE = 10;

type Tiles = Array<GridTileConfig | string>;

interface Drag {
  pointerId: number;
  index: number;
  x: number;
  y: number;
  /** Where in the cell it was picked up. */
  grabX: number;
  grabY: number;
  active: boolean;
  tiles: Tiles;
  keys: number[];
}

interface Resize {
  pointerId: number;
  index: number;
  x: number;
  y: number;
  /** The cell's size in pixels when picked up. */
  width: number;
  height: number;
  /** One column or row plus the gap after it. */
  colPitch: number;
  rowPitch: number;
  gap: [number, number];
  columns: number;
  from: [number, number];
  w: number;
  h: number;
}

/**
 * A fixed grid of mixed-size tiles, `rows` × `columns` to a screen. Every row
 * is the same height, so a page of tiles fills the tablet edge to edge; tiles
 * beyond the last row scroll.
 *
 * Holding anywhere on the grid for a second fires `luxframe-edit-start`.
 * While `editing`, tiles wiggle and stop working: drag one to move it, drag
 * its corner handle to resize it a whole column or row at a time, tap it to
 * edit it (`luxframe-tile-edit`), or tap − to remove it. Changes go out as
 * `luxframe-tiles-change` with the new list; the frame owns the config.
 */
export class LuxFrameGrid extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    editing: { type: Boolean, reflect: true },
    _drag: { state: true },
    _resize: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: GridPageConfig;
  declare editing: boolean;
  declare _drag?: Drag;
  declare _resize?: Resize;

  private _portrait = window.matchMedia('(orientation: portrait)');
  private _onRotate = () => this.requestUpdate();
  private _hold?: { x: number; y: number; timer: number };

  constructor() {
    super();
    this.editing = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._portrait.addEventListener('change', this._onRotate);
    // A tile's own long press belongs to editing here, not to its details.
    this.addEventListener('luxframe-hold', this._claimHold);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._portrait.removeEventListener('change', this._onRotate);
    this.removeEventListener('luxframe-hold', this._claimHold);
    this._cancelHold();
  }

  private _claimHold = (e: Event): void => {
    e.preventDefault();
    this._startEditing();
  };

  private _startEditing(): void {
    this._cancelHold();
    if (this.editing) return;
    this._emit('luxframe-edit-start', {});
  }

  private _emit(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  // ---- Holding to start editing -------------------------------------------

  private _holdDown(e: PointerEvent): void {
    if (this.editing || e.button !== 0) return;
    this._cancelHold();
    this._hold = {
      x: e.clientX,
      y: e.clientY,
      timer: window.setTimeout(() => this._startEditing(), HOLD_MS),
    };
  }

  private _holdMove(e: PointerEvent): void {
    const hold = this._hold;
    if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > MOVE_TOLERANCE) this._cancelHold();
  }

  private _cancelHold(): void {
    if (this._hold) window.clearTimeout(this._hold.timer);
    this._hold = undefined;
  }

  // ---- Moving tiles while editing -----------------------------------------

  private _dragDown(index: number, e: PointerEvent): void {
    if (e.button !== 0 || this._drag) return;
    const cell = (e.currentTarget as HTMLElement).closest('.cell') as HTMLElement;
    const rect = cell.getBoundingClientRect();
    const tiles = [...(this.config?.tiles ?? [])];
    this._drag = {
      pointerId: e.pointerId,
      index,
      x: e.clientX,
      y: e.clientY,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      active: false,
      tiles,
      keys: tiles.map((_, i) => i),
    };
  }

  private _dragMove(e: PointerEvent): void {
    const drag = this._drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) <= MOVE_TOLERANCE) return;
      drag.active = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone; the drag ends on its own.
      }
    }
    drag.x = e.clientX;
    drag.y = e.clientY;

    // Whatever cell is under the finger, the dragged tile takes its place.
    const root = this.renderRoot as ShadowRoot;
    const target = root
      .elementsFromPoint(e.clientX, e.clientY)
      .find((el) => el instanceof HTMLElement && el.matches('.cell[data-index]:not(.dragging)')) as
      | HTMLElement
      | undefined;
    const to = target ? Number(target.dataset.index) : drag.index;
    if (to !== drag.index && Number.isFinite(to)) {
      const [tile] = drag.tiles.splice(drag.index, 1);
      const [key] = drag.keys.splice(drag.index, 1);
      drag.tiles.splice(to, 0, tile);
      drag.keys.splice(to, 0, key);
      drag.index = to;
    }
    this.requestUpdate();
  }

  private _dragUp(e: PointerEvent): void {
    const drag = this._drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    this._drag = undefined;
    if (drag.active) {
      if (drag.keys.some((key, i) => key !== i)) this._emit('luxframe-tiles-change', { tiles: drag.tiles });
    } else {
      this._emit('luxframe-tile-edit', { index: drag.index });
    }
  }

  private _dragCancel(): void {
    this._drag = undefined;
  }

  // ---- Resizing tiles while editing ---------------------------------------

  private _resizeDown(index: number, e: PointerEvent): void {
    e.stopPropagation();
    if (e.button !== 0 || this._drag || this._resize || !this.config) return;
    const grid = this.renderRoot.querySelector('.cells') as HTMLElement | null;
    const cell = (e.currentTarget as HTMLElement).closest('.cell') as HTMLElement | null;
    if (!grid || !cell) return;
    const columns = this._columns();
    const [w, h] = spanOf(normalizeTile(this.config.tiles[index]), columns);
    const style = getComputedStyle(grid);
    const gapX = parseFloat(style.columnGap) || 0;
    const gapY = parseFloat(style.rowGap) || 0;
    const rect = cell.getBoundingClientRect();
    this._resize = {
      pointerId: e.pointerId,
      index,
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      colPitch: (rect.width - (w - 1) * gapX) / w + gapX,
      rowPitch: (rect.height - (h - 1) * gapY) / h + gapY,
      gap: [gapX, gapY],
      columns,
      from: [w, h],
      w,
      h,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone; the resize ends on its own.
    }
  }

  private _resizeMove(e: PointerEvent): void {
    const r = this._resize;
    if (!r || e.pointerId !== r.pointerId) return;
    // n cells and the n − 1 gaps between them are n pitches less one gap.
    const fit = (size: number, gap: number, pitch: number, max: number) =>
      Math.min(max, Math.max(1, Math.round((size + gap) / pitch)));
    const w = fit(r.width + e.clientX - r.x, r.gap[0], r.colPitch, r.columns);
    const h = fit(r.height + e.clientY - r.y, r.gap[1], r.rowPitch, MAX_ROWS);
    if (w !== r.w || h !== r.h) this._resize = { ...r, w, h };
  }

  private _resizeUp(e: PointerEvent): void {
    const r = this._resize;
    if (!r || e.pointerId !== r.pointerId) return;
    this._resize = undefined;
    if (!this.config || (r.w === r.from[0] && r.h === r.from[1])) return;
    const tiles = [...this.config.tiles];
    tiles[r.index] = { ...normalizeTile(tiles[r.index]), size: sizeFor(r.w, r.h) };
    this._emit('luxframe-tiles-change', { tiles });
  }

  private _resizeCancel(): void {
    this._resize = undefined;
  }

  private _remove(index: number, e: Event): void {
    e.stopPropagation();
    const tiles = [...(this.config?.tiles ?? [])];
    tiles.splice(index, 1);
    this._emit('luxframe-tiles-change', { tiles });
  }

  private _key(index: number, e: KeyboardEvent): void {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    this._emit('luxframe-tile-edit', { index });
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has('editing') && !this.editing) {
      this._drag = undefined;
      this._resize = undefined;
    }
    const drag = this._drag?.active ? this._drag : undefined;
    const grid = this.renderRoot.querySelector('.cells') as HTMLElement | null;
    if (!grid) return;
    const box = grid.getBoundingClientRect();
    for (const cell of grid.querySelectorAll<HTMLElement>('.cell[data-index]')) {
      if (drag && cell.classList.contains('dragging')) {
        // Keep the lifted tile under the finger, wherever its slot now is.
        const x = drag.x - drag.grabX - box.left - cell.offsetLeft;
        const y = drag.y - drag.grabY - box.top - cell.offsetTop;
        cell.style.transform = `translate(${x}px, ${y}px) scale(1.04)`;
      } else if (cell.style.transform) {
        cell.style.removeProperty('transform');
      }
    }
  }

  // ---- Rendering -----------------------------------------------------------

  private _renderTile(tile: GridTileConfig, size: TileSize) {
    const tag = TILE_TAGS[tile.type ?? 'entity'];
    if (tag) return staticHtml`<${tag} .hass=${this.hass} .config=${tile} size=${size}></${tag}>`;
    switch (tile.type ?? 'entity') {
      case 'clock':
        return html`<luxframe-clock-tile .hass=${this.hass} size=${size}></luxframe-clock-tile>`;
      case 'analog-clock':
        return html`<luxframe-analog-clock-tile .hass=${this.hass} size=${size}>
        </luxframe-analog-clock-tile>`;
      default: {
        const { entity, name, icon } = tile as { entity: string; name?: string; icon?: string };
        return html`<luxframe-tile .hass=${this.hass} .entity=${{ entity, name, icon }} size=${size}>
        </luxframe-tile>`;
      }
    }
  }

  private _columns(): number {
    return Math.max(1, this.config?.columns ?? 4);
  }

  private _renderEditControls(index: number, label: string, span: [number, number]) {
    const resizing = this._resize?.index === index;
    return html`
      <div
        class="shield"
        role="button"
        tabindex="0"
        aria-label="Edit ${label}. Drag to move."
        @pointerdown=${(e: PointerEvent) => this._dragDown(index, e)}
        @pointermove=${this._dragMove}
        @pointerup=${this._dragUp}
        @pointercancel=${this._dragCancel}
        @keydown=${(e: KeyboardEvent) => this._key(index, e)}
        @contextmenu=${(e: Event) => e.preventDefault()}
      ></div>
      <button
        class="remove"
        aria-label="Remove ${label}"
        @pointerdown=${(e: Event) => e.stopPropagation()}
        @click=${(e: Event) => this._remove(index, e)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M6 12h12" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        </svg>
      </button>
      <div
        class="resize"
        role="presentation"
        title="Drag to resize"
        @pointerdown=${(e: PointerEvent) => this._resizeDown(index, e)}
        @pointermove=${this._resizeMove}
        @pointerup=${this._resizeUp}
        @pointercancel=${this._resizeCancel}
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M9 19h10V9M19 19L9 9" fill="none" stroke="currentColor" stroke-width="2.6"
            stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      ${resizing ? html`<div class="dims" aria-live="polite">${span[0]} × ${span[1]}</div>` : nothing}
    `;
  }

  protected render() {
    if (!this.config) return nothing;
    const columns = this._columns();
    const landscapeRows = this.config.rows ?? 3;
    // A tablet stood upright has room for more rows; without them every tile
    // would stretch tall.
    const rows = Math.max(
      1,
      this._portrait.matches ? (this.config.portrait_rows ?? landscapeRows + 2) : landscapeRows,
    );
    const drag = this._drag;
    const resize = this._resize;
    const tiles = drag?.tiles ?? this.config.tiles ?? [];
    const keys = drag?.keys ?? tiles.map((_, i) => i);
    const items = tiles.map((raw, index) => ({ raw, index, key: keys[index] }));

    return html`
      ${this.config.title ? html`<div class="head"><h1>${this.config.title}</h1></div>` : nothing}
      <div
        class="cells"
        style="--columns: ${columns}; --rows: ${rows}"
        @pointerdown=${this._holdDown}
        @pointermove=${this._holdMove}
        @pointerup=${this._cancelHold}
        @pointercancel=${this._cancelHold}
        @hass-more-info=${this._cancelHold}
        @hass-action=${this._cancelHold}
      >
        ${repeat(
          items,
          (item) => item.key,
          ({ raw, index }) => {
            const tile = normalizeTile(raw);
            const resizing = resize?.index === index;
            const span: [number, number] = resizing ? [resize.w, resize.h] : spanOf(tile, columns);
            const shape = resizing ? shapeOf({ ...tile, size: sizeFor(...span) }, ...span) : shapeOf(tile, ...span);
            const lifted = drag?.active && drag.index === index;
            return html`
              <div
                class="cell ${lifted ? 'dragging' : ''} ${resizing ? 'resizing' : ''}"
                data-index=${index}
                style="grid-column: span ${span[0]}; grid-row: span ${span[1]}; --i: ${index}"
              >
                ${this._renderTile(tile, shape)}
                ${this.editing ? this._renderEditControls(index, tileLabel(this.hass, tile), span) : nothing}
              </div>
            `;
          },
        )}
        ${this.editing
          ? html`<button class="cell add" aria-label="Add a tile"
              @click=${() => this._emit('luxframe-add-tile', {})}>
              <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
              </svg>
            </button>`
          : nothing}
      </div>
    `;
  }

  static styles = [
    pageStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        /* Keep the last row clear of the page dots. */
        padding-bottom: max(var(--lf-pad), 48px);
      }

      :host([editing]) {
        /* Room for the edit bar above the tiles. */
        padding-top: max(var(--lf-pad), 84px);
      }

      .head {
        margin-bottom: 20px;
      }

      .cells {
        position: relative;
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
        grid-auto-rows: calc((100% - (var(--rows) - 1) * var(--lf-gap)) / var(--rows));
        grid-auto-flow: row dense;
        gap: var(--lf-gap);
      }

      .cell {
        position: relative;
        min-width: 0;
        min-height: 0;
      }

      .cell > :first-child {
        height: 100%;
      }

      :host([editing]) .cell[data-index] {
        animation: wiggle 260ms ease-in-out infinite alternate;
        animation-delay: calc(var(--i) * -97ms);
      }

      .cell.dragging {
        z-index: 2;
        animation: none !important;
        filter: drop-shadow(0 18px 30px rgb(0 0 0 / 30%));
      }

      .cell.resizing {
        z-index: 2;
        animation: none !important;
        outline: 2px dashed var(--lf-text);
        outline-offset: 3px;
        border-radius: var(--lf-radius);
      }

      .shield {
        position: absolute;
        inset: 0;
        z-index: 1;
        border-radius: var(--lf-radius);
        cursor: grab;
        touch-action: none;
        outline: none;
      }

      .shield:focus-visible {
        box-shadow: 0 0 0 3px var(--lf-accent);
      }

      .dragging .shield {
        cursor: grabbing;
      }

      .remove {
        position: absolute;
        top: -8px;
        left: -8px;
        z-index: 1;
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        color: #1c1b1a;
        background: rgb(255 255 255 / 92%);
        box-shadow: 0 2px 6px rgb(0 0 0 / 25%);
        cursor: pointer;
      }

      .dragging .remove,
      .dragging .resize {
        display: none;
      }

      /* Bottom-right, where a corner is dragged out in most apps. */
      .resize {
        position: absolute;
        right: -8px;
        bottom: -8px;
        z-index: 1;
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        color: #1c1b1a;
        background: rgb(255 255 255 / 92%);
        box-shadow: 0 2px 6px rgb(0 0 0 / 25%);
        cursor: nwse-resize;
        touch-action: none;
      }

      /* A bigger target for a finger than the badge shows. */
      .resize::before {
        content: '';
        position: absolute;
        inset: -10px;
      }

      .dims {
        position: absolute;
        top: 50%;
        left: 50%;
        z-index: 1;
        transform: translate(-50%, -50%);
        padding: 8px 16px;
        border-radius: 999px;
        color: #1c1b1a;
        background: rgb(255 255 255 / 92%);
        font: 600 20px/1 var(--lf-font);
        font-variant-numeric: tabular-nums;
        pointer-events: none;
      }

      .add {
        display: grid;
        place-items: center;
        min-height: 0;
        border: 2px dashed var(--lf-faint);
        border-radius: var(--lf-radius);
        color: var(--lf-text);
        background: transparent;
        font: inherit;
        cursor: pointer;
      }

      .add:focus-visible,
      .remove:focus-visible {
        outline: 3px solid var(--lf-accent);
        outline-offset: 2px;
      }

      @keyframes wiggle {
        from {
          transform: rotate(-0.7deg);
        }
        to {
          transform: rotate(0.7deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        :host([editing]) .cell[data-index] {
          animation: none;
          outline: 2px dashed var(--lf-faint);
          outline-offset: 3px;
          border-radius: var(--lf-radius);
        }
      }
    `,
  ];
}

define('luxframe-grid', LuxFrameGrid);
