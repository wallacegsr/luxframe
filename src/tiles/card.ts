import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { define } from '../define';
import { glass, tileBase } from '../theme';
import type { CardTileConfig, HomeAssistant, TileSize } from '../types';

interface CardElement extends HTMLElement {
  hass?: HomeAssistant;
  layout?: string;
  setConfig?(config: Record<string, unknown>): void;
}

/** Home Assistant's picture cards, which crop their picture to an `aspect_ratio`. */
const PICTURE_CARDS = new Set(['picture', 'picture-entity', 'picture-glance', 'picture-elements']);

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
 * leaves the card as it looks elsewhere.
 *
 * `fit` decides how the card meets the tile. Stretched, it fills the tile when
 * it can grow, and one taller than the tile shrinks to fit; `scroll` keeps it
 * full size and scrolls it instead. A card that keeps its own shape,
 * such as a picture with badges over it, can instead be laid out at the
 * tile's width and scaled as a whole: `cover` fills the tile and trims the
 * overflow, `contain` shows all of it, centered. Scaling everything together
 * keeps badges on the picture where they belong.
 *
 * Home Assistant's picture cards fill better another way: given the tile's
 * shape as their `aspect_ratio`, they crop the picture alone, and badges,
 * placed as a share of the card, stay inside it. So `cover` does that for
 * them, unless the card sets its own `aspect_ratio`.
 */
export class LuxFrameCardTile extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    size: { reflect: true },
    _element: { state: true },
    _problem: { state: true },
    _shrunk: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: CardTileConfig;
  declare size: TileSize;
  declare _element?: CardElement;
  declare _problem?: string;
  /** A stretched card taller than its tile, scaled down to fit it. */
  declare _shrunk: boolean;

  /** The card config the current element was built from, as JSON. */
  private _built?: string;

  /** Watches the tile and the card, to keep a scaled card fitted. */
  private _observer?: ResizeObserver;
  private _observed?: CardElement;
  /** The tile's shape (height ÷ width) last given to a picture card. */
  private _shape?: number;

  constructor() {
    super();
    this.size = 'm';
    this._shrunk = false;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._observer?.disconnect();
    this._observer = undefined;
    this._observed = undefined;
  }

  private get _fit(): 'stretch' | 'scroll' | 'cover' | 'contain' {
    const fit = this.config?.fit;
    return fit === 'cover' || fit === 'contain' || fit === 'scroll' ? fit : 'stretch';
  }

  /** Laid out to fill the tile, as in a sections view, rather than at its own height. */
  private get _fills(): boolean {
    return this._fit === 'stretch' || this._fit === 'scroll';
  }

  /** Scaled as a whole: cover and contain always, stretch once it's too tall. */
  private get _scaled(): boolean {
    return !this._fills || (this._fit === 'stretch' && this._shrunk);
  }

  /** A picture card in `cover` crops its picture to the tile instead of being scaled. */
  private get _cropsPicture(): boolean {
    const card = this.config?.card;
    return (
      this._fit === 'cover' &&
      PICTURE_CARDS.has(String(card?.type)) &&
      (card?.aspect_ratio === undefined || card.aspect_ratio === null || card.aspect_ratio === '')
    );
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('config')) void this._build();
    if (changed.has('hass') && this._element) this._element.hass = this.hass;
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has('config') && this._fit !== 'stretch') this._shrunk = false;
    const element = this._fit === 'scroll' ? undefined : this._element;
    if (element === this._observed) {
      // Between cover and contain the card stays; only its scale changes.
      if (element && (changed.has('config') || changed.has('_shrunk'))) this._place();
      return;
    }
    this._observer?.disconnect();
    this._unplace(this._observed);
    this._observed = element;
    if (!element) return;
    const box = this.renderRoot.querySelector('.card');
    this._observer ??= new ResizeObserver(() => this._place());
    if (box) this._observer.observe(box);
    this._observer.observe(element);
    // The observer reports on the next frame; place it now if it's drawn.
    this._place();
  }

  private _unplace(element: CardElement | undefined): void {
    if (!element) return;
    element.style.width = '';
    element.style.transform = '';
  }

  /**
   * Lays a scaled card out at the tile's width, then scales and centers it.
   * A stretched card is only watched: once it runs past the bottom of the
   * tile it's shrunk like `contain`, and it fills again when it would fit.
   */
  private _place(): void {
    const element = this._observed;
    const box = this.renderRoot.querySelector('.card') as HTMLElement | null;
    if (!element || !box) return;
    const width = box.clientWidth;
    const height = box.clientHeight;
    if (this._fit === 'stretch' && !this._shrunk) {
      if (height && element.offsetHeight > height + 1) this._shrunk = true;
      return;
    }
    if (element.style.width !== `${width}px`) element.style.width = `${width}px`;
    if (width && height) this._shapePicture(element, height / width);
    // The card's own height at that width; a transform doesn't change it.
    const natural = element.offsetHeight;
    if (!width || !height || !natural) return;
    if (this._fit === 'stretch' && natural <= height) {
      this._unplace(element);
      this._shrunk = false;
      return;
    }
    const ratio = height / natural;
    const scale = this._fit === 'cover' ? Math.max(1, ratio) : Math.min(1, ratio);
    const x = (width - width * scale) / 2;
    const y = (height - natural * scale) / 2;
    element.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  /**
   * Gives a picture card the tile's shape, or takes it back when it's no
   * longer cropping. Only a real change (half a percent) reconfigures it.
   */
  private _shapePicture(element: CardElement, shape: number): void {
    const card = this.config?.card;
    if (!card || !element.setConfig) return;
    if (!this._cropsPicture) {
      if (this._shape !== undefined) element.setConfig(card);
      this._shape = undefined;
      return;
    }
    if (this._shape !== undefined && Math.abs(shape - this._shape) < 0.005) return;
    this._shape = shape;
    element.setConfig({ ...card, aspect_ratio: `${(shape * 100).toFixed(2)}%` });
  }

  private async _build(): Promise<void> {
    const card = this.config?.card;
    const stretch = this._fills;
    // A scaled card is laid out as it is on other dashboards, at its own
    // height, so it's built afresh when that changes.
    const key = JSON.stringify([card ?? null, stretch]);
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
    this._shape = undefined;
    this._shrunk = false;
    element.hass = this.hass;
    // Cards that know Home Assistant's sections grid fill their cell in it.
    if (stretch) element.layout = 'grid';
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
    // A card in its own look draws its shadows and glows past the tile, as
    // on a dashboard. Scrolling and cover's trimming still need the edge.
    const free = !glassy && this._fit !== 'scroll' && this._fit !== 'cover';
    return html`<div class="tile ${glassy ? 'glass themed' : ''} ${free ? 'free' : ''}">
      <div class="card ${this._scaled ? 'scaled' : ''}">${this._element ?? nothing}</div>
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

      /*
       * With "fit: scroll", a card taller than its tile scrolls up and down,
       * and stops at its ends rather than scrolling the page. A sideways swipe isn't the
       * card's: it goes on to turn the page, as it does on LuxFrame's tiles.
       */
      .card {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: auto contain;
        scrollbar-width: none;
      }

      .card > * {
        flex: 1 0 auto;
        display: block;
      }

      .card.scaled {
        position: relative;
        overflow: hidden;
      }

      .card.scaled > * {
        position: absolute;
        top: 0;
        left: 0;
        transform-origin: 0 0;
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

      .tile.free,
      .tile.free .card {
        overflow: visible;
      }
    `,
  ];
}

define('luxframe-card-tile', LuxFrameCardTile);
