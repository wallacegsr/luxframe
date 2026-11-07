import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { define } from '../define';
import { glass, tileBase } from '../theme';
import type { CardTileConfig, HomeAssistant, TileSize } from '../types';

interface CardElement extends HTMLElement {
  hass?: HomeAssistant;
  layout?: string;
}

interface CardHelpers {
  createCardElement(config: Record<string, unknown>): CardElement;
}

declare global {
  interface Window {
    /** Home Assistant's own card factory, there on every dashboard. */
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

let helpers: Promise<CardHelpers> | undefined;

function cardHelpers(): Promise<CardHelpers> | undefined {
  if (!window.loadCardHelpers) return undefined;
  return (helpers ??= window.loadCardHelpers());
}

/** "custom:clock-weather-card" → "Clock weather card"; "thermostat" → "Thermostat card". */
export function cardName(card: Record<string, unknown> | undefined): string {
  const type = typeof card?.type === 'string' ? card.type.replace(/^custom:/, '') : '';
  if (!type) return 'Home Assistant card';
  const words = type.replace(/[-_]+/g, ' ').trim();
  const name = words.charAt(0).toUpperCase() + words.slice(1);
  return /\bcard$/i.test(name) ? name : `${name} card`;
}

/**
 * Any Home Assistant card in a tile, built by Home Assistant itself, so custom
 * cards from HACS work too. By default the card's own background gives way to
 * LuxFrame's glass and its text takes LuxFrame's colors; `glass: false`
 * leaves the card as it looks elsewhere. A card taller than its tile scrolls.
 */
export class LuxFrameCardTile extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    size: { reflect: true },
    _element: { state: true },
    _problem: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: CardTileConfig;
  declare size: TileSize;
  declare _element?: CardElement;
  declare _problem?: string;

  /** The card config the current element was built from, as JSON. */
  private _built?: string;

  constructor() {
    super();
    this.size = 'm';
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('config')) void this._build();
    if (changed.has('hass') && this._element) this._element.hass = this.hass;
  }

  private async _build(): Promise<void> {
    const card = this.config?.card;
    const key = JSON.stringify(card ?? null);
    if (key === this._built) return;
    this._built = key;

    if (!card || typeof card.type !== 'string') {
      this._element = undefined;
      this._problem = 'No card yet';
      return;
    }
    const loading = cardHelpers();
    if (!loading) {
      this._element = undefined;
      this._problem = 'Home Assistant cards show inside Home Assistant';
      return;
    }
    const element = (await loading).createCardElement(card);
    if (this._built !== key) return;
    element.hass = this.hass;
    // Cards that know Home Assistant's sections grid fill their cell in it.
    element.layout = 'grid';
    // A custom card whose code hasn't loaded yet comes back as a stand-in that
    // asks to be rebuilt once it has.
    element.addEventListener(
      'll-rebuild',
      (e) => {
        e.stopPropagation();
        this._built = undefined;
        void this._build();
      },
      { once: true },
    );
    this._problem = undefined;
    this._element = element;
  }

  protected render() {
    if (!this.config) return nothing;
    if (this._problem) return html`<div class="tile glass empty muted">${this._problem}</div>`;
    const glassy = this.config.glass !== false;
    return html`<div class="tile ${glassy ? 'glass themed' : ''}">
      <div class="card">${this._element ?? nothing}</div>
    </div>`;
  }

  static styles = [
    tileBase,
    glass,
    css`
      .empty {
        display: grid;
        place-items: center;
        padding: 12px;
        text-align: center;
      }

      .card {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: none;
      }

      .card > * {
        flex: 1 0 auto;
        display: block;
      }

      /*
       * Home Assistant's cards read these from their surroundings. The card
       * goes clear so the glass shows through; menus that open from a card
       * get a solid surface in LuxFrame's colors so they stay readable.
       */
      .themed {
        --ha-card-background: transparent;
        --ha-card-border-width: 0;
        --ha-card-box-shadow: none;
        --ha-card-backdrop-filter: none;
        --ha-card-border-radius: var(--lf-radius);
        --primary-text-color: var(--lf-text);
        --secondary-text-color: var(--lf-muted);
        --card-background-color: var(--lf-sheet);
        --mdc-theme-surface: var(--lf-sheet);
        --divider-color: color-mix(in srgb, var(--lf-text) 14%, transparent);
      }

      .tile:not(.themed) {
        --ha-card-border-radius: var(--lf-radius);
      }
    `,
  ];
}

define('luxframe-card-tile', LuxFrameCardTile);
