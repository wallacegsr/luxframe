import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { pageStyles } from '../theme';
import type { GridPageConfig, GridTileConfig, HomeAssistant, TileSize } from '../types';

/** Columns × rows each size covers, before clamping to the grid's width. */
const SPANS: Record<TileSize, [number, number]> = {
  s: [1, 1],
  w: [2, 1],
  m: [2, 2],
  l: [4, 2],
};

const DEFAULT_SIZE: Record<NonNullable<GridTileConfig['type']>, TileSize> = {
  entity: 's',
  thermostat: 'm',
  weather: 's',
  clock: 's',
  'analog-clock': 's',
};

export function normalizeTile(tile: GridTileConfig | string): GridTileConfig {
  return typeof tile === 'string' ? { type: 'entity', entity: tile } : tile;
}

/**
 * A fixed grid of mixed-size tiles, `rows` × `columns` to a screen. Every row
 * is the same height, so a page of tiles fills the tablet edge to edge; tiles
 * beyond the last row scroll.
 */
export class LuxFrameGrid extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare config?: GridPageConfig;

  private _portrait = window.matchMedia('(orientation: portrait)');
  private _onRotate = () => this.requestUpdate();

  connectedCallback(): void {
    super.connectedCallback();
    this._portrait.addEventListener('change', this._onRotate);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._portrait.removeEventListener('change', this._onRotate);
  }

  private _renderTile(tile: GridTileConfig, size: TileSize) {
    switch (tile.type ?? 'entity') {
      case 'thermostat':
        return html`<luxframe-thermostat-tile .hass=${this.hass} .config=${tile} size=${size}>
        </luxframe-thermostat-tile>`;
      case 'weather':
        return html`<luxframe-weather-tile .hass=${this.hass} .config=${tile} size=${size}>
        </luxframe-weather-tile>`;
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

  protected render() {
    if (!this.config) return nothing;
    const columns = Math.max(1, this.config.columns ?? 4);
    const landscapeRows = this.config.rows ?? 3;
    // A tablet stood upright has room for more rows; without them every tile
    // would stretch tall.
    const rows = Math.max(
      1,
      this._portrait.matches ? (this.config.portrait_rows ?? landscapeRows + 2) : landscapeRows,
    );

    return html`
      ${this.config.title ? html`<div class="head"><h1>${this.config.title}</h1></div>` : nothing}
      <div class="cells" style="--columns: ${columns}; --rows: ${rows}">
        ${(this.config.tiles ?? []).map((raw) => {
          const tile = normalizeTile(raw);
          const size = tile.size ?? DEFAULT_SIZE[tile.type ?? 'entity'] ?? 's';
          const [spanX, spanY] = SPANS[size] ?? SPANS.s;
          return html`
            <div class="cell" style="grid-column: span ${Math.min(spanX, columns)}; grid-row: span ${spanY}">
              ${this._renderTile(tile, size)}
            </div>
          `;
        })}
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

      .head {
        margin-bottom: 20px;
      }

      .cells {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
        grid-auto-rows: calc((100% - (var(--rows) - 1) * var(--lf-gap)) / var(--rows));
        grid-auto-flow: row dense;
        gap: var(--lf-gap);
      }

      .cell {
        min-width: 0;
        min-height: 0;
      }

      .cell > * {
        height: 100%;
      }
    `,
  ];
}

define('luxframe-grid', LuxFrameGrid);
