import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { conditionsMet, tileConditions } from '../conditions';
import { define } from '../define';
import { tileLabel } from '../editor/layout';
import { resolve } from '../entity';
import { stateIcon } from '../icon';
import { icon, type IconName } from '../icons';
import { cardHelpers, cardName, haThemed, type CardElement } from '../tiles/card';
import type {
  GridTileConfig,
  GridTileType,
  HomeAssistant,
  QuickDockConfig,
  QuickDockItem,
  QuickPanelConfig,
} from '../types';

// The quick panel's dock: icons along its top, each opening its own view on
// the stage under them. An item is `media`, an entity (its controls), a Home
// Assistant card or a LuxFrame tile.

export type DockKind = 'media' | 'entity' | 'card' | 'tile';

/** The short forms written out: `media`, or an entity id. */
export function normalizeDock(item: QuickDockItem): QuickDockConfig {
  if (typeof item !== 'string') return item ?? {};
  return item === 'media' ? { type: 'media' } : { entity: item };
}

/** Back to the short form when nothing else is set. */
export function compactDock(item: QuickDockConfig): QuickDockItem {
  const keys = Object.keys(item).filter((k) => item[k as keyof QuickDockConfig] !== undefined);
  if (keys.length === 1 && item.type === 'media') return 'media';
  if (keys.length === 1 && item.entity) return item.entity;
  return item;
}

/** What it opens; undefined when it doesn't say. */
export function dockKind(item: QuickDockConfig): DockKind | undefined {
  if (item.type === 'media') return 'media';
  if (item.card && typeof item.card === 'object') return 'card';
  if (item.tile && typeof item.tile === 'object') return 'tile';
  if (typeof item.entity === 'string' && item.entity) return 'entity';
  return undefined;
}

/**
 * A choice from the tile picker, as a dock item: a device opens its
 * controls, a card stays a card, and anything else is the LuxFrame tile.
 */
export function toDockItem(picked: GridTileConfig | string): QuickDockItem | undefined {
  if (typeof picked === 'string') return picked;
  const kind = picked.type ?? 'entity';
  if (kind === 'entity' || kind === 'thermostat') {
    return 'entity' in picked && typeof picked.entity === 'string' ? picked.entity : undefined;
  }
  if (kind === 'card' && 'card' in picked) {
    return picked.glass === false ? { card: picked.card ?? {}, glass: false } : { card: picked.card ?? {} };
  }
  return { tile: picked };
}

/** The dock as written, or media alone. */
export function dockOf(config: QuickPanelConfig | undefined): QuickDockItem[] {
  return Array.isArray(config?.dock) ? config.dock : ['media'];
}

/** Whether its visibility conditions are met: its own, else its card's or tile's. */
export function dockShows(item: QuickDockConfig, hass: HomeAssistant | undefined): boolean {
  const conditions =
    item.visibility ?? (item.card?.visibility as unknown) ?? (item.tile ? tileConditions(item.tile) : undefined);
  return conditionsMet(conditions, hass);
}

/** What the dock calls it. */
export function dockLabel(hass: HomeAssistant | undefined, item: QuickDockConfig): string {
  if (item.name) return item.name;
  switch (dockKind(item)) {
    case 'media':
      return 'Media';
    case 'entity':
      return resolve(hass, item.entity!).name;
    case 'card': {
      const card = item.card!;
      for (const key of ['title', 'name'] as const) {
        if (typeof card[key] === 'string' && card[key]) return card[key] as string;
      }
      if (typeof card.entity === 'string') return resolve(hass, card.entity).name;
      return typeof card.type === 'string' ? cardName(card).replace(/ card$/i, '') : 'Card';
    }
    case 'tile':
      return tileLabel(hass, item.tile!);
    default:
      return 'Item';
  }
}

/** Icons for LuxFrame's own tiles, when the item doesn't name one. */
const TILE_ICONS: Partial<Record<GridTileType, IconName>> = {
  thermostat: 'flame',
  weather: 'sun',
  clock: 'clock',
  'analog-clock': 'clock',
  calendar: 'calendar',
  'now-playing': 'speaker',
  camera: 'camera',
  photo: 'photo',
  sun: 'sunrise',
  todo: 'list',
  room: 'room',
};

/** The icon in the dock: the item's own, its entity's, or one for its kind. */
export function dockIcon(hass: HomeAssistant | undefined, item: QuickDockConfig, label: string) {
  if (item.icon) {
    return customElements.get('ha-icon')
      ? html`<ha-icon .icon=${item.icon}></ha-icon>`
      : html`<span class="glyph">${label.charAt(0)}</span>`;
  }
  switch (dockKind(item)) {
    case 'media':
      return icon('speaker', 26);
    case 'entity':
      return stateIcon(hass, hass?.states[item.entity!], undefined, label);
    case 'card': {
      const card = item.card!;
      const entity = typeof card.entity === 'string' ? card.entity : undefined;
      const own = typeof card.icon === 'string' ? card.icon : undefined;
      if (entity) return stateIcon(hass, hass?.states[entity], own, label);
      if (own && customElements.get('ha-icon')) return html`<ha-icon .icon=${own}></ha-icon>`;
      return icon('grid', 26);
    }
    case 'tile': {
      const tile = item.tile!;
      const kind = tile.type ?? 'entity';
      const named = TILE_ICONS[kind];
      if (named) return icon(named, 26);
      const entity = 'entity' in tile && typeof tile.entity === 'string' ? tile.entity : undefined;
      if (entity) return stateIcon(hass, hass?.states[entity], undefined, label);
      return icon('grid', 26);
    }
    default:
      return icon('grid', 26);
  }
}

/** The entity whose state lights the icon, if any. */
export function dockEntity(item: QuickDockConfig): string | undefined {
  if (item.entity) return item.entity;
  if (typeof item.card?.entity === 'string') return item.card.entity;
  if (item.tile && 'entity' in item.tile && typeof item.tile.entity === 'string') return item.tile.entity;
  return undefined;
}

/**
 * A Home Assistant card on the quick panel's stage, at its own height, as on
 * a dashboard that stacks cards. In LuxFrame's glass unless `glass` is off.
 */
export class LuxFrameStageCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    card: { attribute: false },
    glass: { type: Boolean },
    _element: { state: true },
    _problem: { state: true },
  };

  declare hass?: HomeAssistant;
  declare card?: Record<string, unknown>;
  declare glass: boolean;
  declare _element?: CardElement;
  declare _problem?: string;

  /** The card config the current element was built from, as JSON. */
  private _built?: string;

  constructor() {
    super();
    this.glass = true;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('card')) void this._build();
    if (changed.has('hass') && this._element) this._element.hass = this.hass;
  }

  private async _build(): Promise<void> {
    const card = this.card;
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
    // A custom card whose code hasn't loaded yet asks to be rebuilt once it has.
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
    return html`<div class="box ${this.glass ? 'themed' : ''}">
      ${this._problem ? html`<div class="empty">${this._problem}</div>` : (this._element ?? nothing)}
    </div>`;
  }

  static styles = [
    haThemed,
    css`
      :host {
        display: block;
      }

      .box > * {
        display: block;
      }

      .box:not(.themed) {
        --ha-card-border-radius: var(--lf-radius);
      }

      .empty {
        padding: 24px;
        text-align: center;
        color: var(--lf-muted);
      }
    `,
  ];
}

define('luxframe-stage-card', LuxFrameStageCard);
