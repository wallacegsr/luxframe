import { LitElement, css, html, nothing } from 'lit';
import { define } from './define';
import {
  domainOf,
  isActive,
  isMomentary,
  levelOf,
  openDetail,
  resolve,
  setLevel,
  stateLabel,
  tapAction,
} from './entity';
import { stateIcon } from './icon';
import { Pending } from './pending';
import { glass, tileBase } from './theme';
import type { EntityRef, HassEntity, HomeAssistant, TileSize } from './types';

const HOLD_MS = 1000;
const MOVE_TOLERANCE = 10;

type Region = 'icon' | 'body';

/**
 * One entity as a glass tile: icon centered over the name and its area.
 *   - tap the icon: toggle it (scenes and scripts run from anywhere on the tile)
 *   - tap anywhere else: open its detail view
 *   - drag up or down on a light, shade or fan: set its level
 *   - hold: fires `luxframe-hold`; a grid page starts editing, otherwise details
 * A sideways swipe is left to the frame, which turns the page.
 */
export class LuxFrameTile extends LitElement {
  static properties = {
    hass: { attribute: false },
    entity: { attribute: false },
    size: { reflect: true },
    subtitle: {},
    _flash: { state: true },
  };

  declare hass?: HomeAssistant;
  declare entity?: EntityRef;
  declare size: TileSize;
  /** `area` (grid pages) or `state` (room pages, where the area is the page). */
  declare subtitle: 'area' | 'state';
  declare _flash: boolean;

  private _press?: {
    x: number;
    y: number;
    region: Region;
    startLevel: number | null;
    level: number;
    height: number;
    dragging: boolean;
    held: boolean;
    timer: number;
  };
  /** The level being dragged to, then held until the device reports it. */
  private _level = new Pending<number>(this);

  constructor() {
    super();
    this.size = 's';
    this.subtitle = 'area';
    this._flash = false;
  }

  private get _stateObj(): HassEntity | undefined {
    return this.entity ? resolve(this.hass, this.entity).stateObj : undefined;
  }

  private _down(e: PointerEvent): void {
    if (e.button !== 0) return;
    const icon = this.renderRoot.querySelector('.icon');
    const tile = e.currentTarget as HTMLElement;
    const press = {
      x: e.clientX,
      y: e.clientY,
      region: (icon && e.composedPath().includes(icon) ? 'icon' : 'body') as Region,
      startLevel: levelOf(this._stateObj),
      level: 0,
      height: tile.getBoundingClientRect().height,
      dragging: false,
      held: false,
      timer: 0,
    };
    press.timer = window.setTimeout(() => {
      press.held = true;
      // A grid page claims the hold to start editing; elsewhere it opens details.
      const hold = new CustomEvent('luxframe-hold', { bubbles: true, composed: true, cancelable: true });
      if (this.dispatchEvent(hold)) this._detail();
    }, HOLD_MS);
    this._press = press;
  }

  private _move(e: PointerEvent): void {
    const press = this._press;
    if (!press) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;

    if (!press.dragging) {
      if (Math.hypot(dx, dy) <= MOVE_TOLERANCE) return;
      window.clearTimeout(press.timer);
      if (press.startLevel === null || press.held || Math.abs(dy) < Math.abs(dx)) {
        this._press = undefined;
        return;
      }
      press.dragging = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    // A full-height drag sweeps the whole range.
    const level = press.startLevel! - (dy / press.height) * 100;
    press.level = Math.round(Math.max(0, Math.min(100, level)));
    this._level.hold(press.level);
  }

  private _up(): void {
    const press = this._press;
    if (!press) return;
    window.clearTimeout(press.timer);
    this._press = undefined;

    if (press.dragging) {
      const stateObj = this._stateObj;
      if (this.hass && stateObj) {
        setLevel(this.hass, stateObj, press.level);
        this._level.release(press.level);
      } else {
        this._level.clear();
      }
      return;
    }
    if (!press.held) this._tap(press.region);
  }

  private _cancel(): void {
    if (this._press) window.clearTimeout(this._press.timer);
    if (this._press?.dragging) {
      this._level.clear();
      this.requestUpdate();
    }
    this._press = undefined;
  }

  private _tap(region: Region): void {
    const stateObj = this._stateObj;
    if (region === 'body' && !isMomentary(stateObj)) return this._detail();
    if (!this.hass || !tapAction(this.hass, stateObj)) return this._detail();
    this._level.clear();
    this._flash = true;
    window.setTimeout(() => (this._flash = false), 350);
  }

  private _detail(): void {
    if (this.entity) openDetail(this, resolve(this.hass, this.entity).id);
  }

  private _key(region: Region, e: KeyboardEvent): void {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    this._tap(region);
  }

  protected render() {
    if (!this.entity) return nothing;
    const { name, icon, area, stateObj } = resolve(this.hass, this.entity);
    const shownLevel = this._level.get(levelOf(stateObj) ?? undefined);
    const level = shownLevel ?? levelOf(stateObj);
    const active = shownLevel !== undefined ? shownLevel > 0 : isActive(stateObj);
    const momentary = isMomentary(stateObj);
    const dragging = this._level.holding;

    let sub: string;
    if (dragging) sub = `${level}%`;
    else if (this.subtitle === 'state' || !area) sub = stateLabel(this.hass, stateObj);
    else sub = active && level !== null && level > 0 && level < 100 ? `${area} · ${level}%` : area;

    const spinning = stateObj && domainOf(stateObj.entity_id) === 'fan' && active;
    const spin = spinning ? `--spin: ${(3 - 2.4 * ((level ?? 100) / 100)).toFixed(2)}s` : '';
    const iconTemplate = stateIcon(this.hass, stateObj, icon, name);
    const status = stateLabel(this.hass, stateObj);

    return html`
      <div
        class="tile glass ${active ? 'active' : ''} ${this._flash ? 'flash' : ''} ${stateObj
          ? ''
          : 'missing'}"
        style="touch-action: ${levelOf(stateObj) === null ? 'pan-x pan-y' : 'pan-x'}"
        role="group"
        aria-label="${name}, ${status}"
        @pointerdown=${this._down}
        @pointermove=${this._move}
        @pointerup=${this._up}
        @pointercancel=${this._cancel}
        @lostpointercapture=${this._up}
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        ${dragging ? html`<div class="fill" style="height: ${level}%"></div>` : nothing}
        <div
          class="icon ${spinning ? 'spin' : ''}"
          style=${spin}
          role="button"
          tabindex="0"
          aria-label="${momentary ? 'Run' : 'Toggle'} ${name}"
          @keydown=${(e: KeyboardEvent) => this._key('icon', e)}
        >
          ${iconTemplate}
        </div>
        <div
          class="label"
          role="button"
          tabindex="0"
          aria-label="${name} details"
          @keydown=${(e: KeyboardEvent) => this._key('body', e)}
        >
          <div class="name">${name}</div>
          <div class="sub muted">${sub}</div>
        </div>
      </div>
    `;
  }

  static styles = [
    tileBase,
    glass,
    css`
      .tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 120px;
        padding: 14px 12px;
        text-align: center;
        cursor: pointer;
        user-select: none;
        transition: background 220ms, color 220ms, transform 120ms;
      }

      .tile.flash {
        transform: scale(0.96);
      }

      .tile.missing {
        opacity: 0.5;
      }

      .fill {
        position: absolute;
        inset: auto 0 0 0;
        background: color-mix(in srgb, var(--lf-accent) 30%, transparent);
        pointer-events: none;
      }

      .icon {
        position: relative;
        display: grid;
        place-items: center;
        width: 52px;
        height: 52px;
        margin: -6px;
        border-radius: 50%;
        color: var(--lf-text);
        outline: none;
        --mdc-icon-size: 34px;
        --state-icon-color: currentColor;
      }

      .active .icon {
        color: var(--lf-accent);
        --state-icon-color: var(--lf-accent);
      }

      .icon:active {
        background: color-mix(in srgb, currentColor 14%, transparent);
      }

      .icon.spin > * {
        animation: spin var(--spin, 2s) linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .glyph {
        font-size: 24px;
        font-weight: 600;
      }

      .label {
        position: relative;
        max-width: 100%;
        outline: none;
        border-radius: 8px;
      }

      .icon:focus-visible,
      .label:focus-visible {
        box-shadow: 0 0 0 3px var(--lf-accent);
      }

      .name {
        font-size: 16px;
        font-weight: 600;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .sub {
        margin-top: 2px;
        font-size: 14px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      :host([size='m']) .icon,
      :host([size='l']) .icon {
        width: 72px;
        height: 72px;
        --mdc-icon-size: 48px;
      }

      :host([size='m']) .name,
      :host([size='l']) .name {
        font-size: 20px;
      }

      @media (prefers-reduced-motion: reduce) {
        .icon.spin > * {
          animation: none;
        }
      }
    `,
  ];
}

define('luxframe-tile', LuxFrameTile);
