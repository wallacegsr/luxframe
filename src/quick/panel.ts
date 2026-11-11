import { LitElement, css, html, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { define } from '../define';
import { renderEntityView } from '../detail/detail';
import { domainOf, isActive } from '../entity';
import { icon } from '../icons';
import { pickPlayer } from '../media';
import '../now-playing';
import { MIN_BRIGHTNESS } from '../screen';
import { controls } from '../theme';
import { renderTile } from '../tiles/render';
import type { HomeAssistant, QuickDockConfig, QuickPanelConfig, TileSize } from '../types';
import { dockEntity, dockIcon, dockKind, dockLabel, dockOf, dockShows, normalizeDock } from './dock';

const CLOSE_DISTANCE = 80;
const CLOSE_MS = 200;
export const MAX_PINNED = 8;
/** A swipe that starts on one of these drags or types there, not the panel away. */
const DRAGS_OWN = 'input, select, textarea, [role="slider"], luxframe-slider, [data-no-swipe]';
/** Past this, a move says which way it's going. */
const SWIPE_SLOP = 6;
const RESIZE_MS = 240;
const TILE_HEIGHT = 300;
const PRESETS = new Set(['s', 'w', 'm', 'l']);

interface Entry {
  item: QuickDockConfig;
  /** Its place in the dock as written. */
  index: number;
}

/**
 * The panel pulled down from the top edge. Its dock, a row of icons, opens
 * one thing at a time on the stage under it: what's playing, a device's
 * controls, a Home Assistant card or a LuxFrame tile. Beside it (under it,
 * upright) are the screen's brightness, pinned tiles and Ask. With one
 * thing in the dock there's no row of icons: it just shows.
 *
 * The panel is as tall as what it shows, and grows and shrinks smoothly as
 * that changes. Too tall for the screen, it scrolls; swiping up once it's
 * scrolled to the end puts it away.
 *
 * The frame drives the pull with `offset` (px still hidden above the top) and
 * sets `offset` to 0 once open. Swiping it away, tapping below it or Escape
 * fires `close`. Also fires `brightness` (detail: 10–100) and `ask`.
 */
export class LuxFrameQuickPanel extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    brightness: { type: Number },
    assist: { type: Boolean },
    offset: { type: Number },
    _dy: { state: true },
    _closing: { state: true },
    _drop: { state: true },
    _picked: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: QuickPanelConfig;
  declare brightness: number;
  declare assist: boolean;
  /** How far the panel still sits above its open position, while being pulled. */
  declare offset: number;
  declare _dy: number;
  declare _closing: boolean;
  /** Opened by a tap rather than pulled: it drops in by itself. */
  declare _drop: boolean;
  /** The dock item tapped open (its index), or null once put away. */
  declare _picked?: number | null;

  /** A swipe that may put the panel away; `active` once it's doing so. */
  private _swipe?: { x: number; y: number; id?: number; active: boolean };
  /** A swipe just put the panel away or snapped it back: the click it ends in isn't a tap. */
  private _swallowClick = false;
  private _resizer?: ResizeObserver;
  /** The panel's height last seen, to grow or shrink from. */
  private _height = 0;

  constructor() {
    super();
    this.brightness = 100;
    this.assist = true;
    this.offset = 0;
    this._dy = 0;
    this._closing = false;
    this._drop = false;
  }

  protected willUpdate(): void {
    if (!this.hasUpdated) this._drop = this.offset === 0;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', this._onKey);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('keydown', this._onKey);
    this._resizer?.disconnect();
    this._resizer = undefined;
  }

  protected firstUpdated(): void {
    const content = this.renderRoot.querySelector('.content');
    if (!content) return;
    this._resizer = new ResizeObserver(() => this._resized());
    this._resizer.observe(content);
  }

  close(): void {
    if (this._closing) return;
    this._closing = true;
    window.setTimeout(() => this.dispatchEvent(new CustomEvent('close')), CLOSE_MS);
  }

  private get _panel(): HTMLElement | null {
    return this.renderRoot.querySelector('.panel');
  }

  private _onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close();
    }
  };

  // ---- Growing and shrinking ------------------------------------------------

  /** Eases the panel from its last height to its new one. */
  private _resized(): void {
    const panel = this._panel;
    if (!panel) return;
    const height = panel.offsetHeight;
    const from = this._height;
    this._height = height;
    if (!from || Math.abs(height - from) < 2 || this.offset > 0 || this._swipe?.active) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    panel.animate([{ height: `${from}px` }, { height: `${height}px` }], {
      duration: RESIZE_MS,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
  }

  // ---- Putting it away ------------------------------------------------------
  //
  // Swiping up anywhere puts the panel away, on a tile or the dock as much as
  // on the glass, and on the dimmed strip below it too, the way pulling down
  // anywhere on a page brings it out. A slider or a field keeps its own
  // drags, and anything with more to show below (the panel, or a list in it)
  // scrolls first: only once it's at the end does the next swipe up put the
  // panel away. A sideways swipe is left to the dock. Touch scrolls
  // natively; a mouse drags.

  /** Whether a finger moving up there would scroll or drag something instead. */
  private _ownsSwipe(e: Event): boolean {
    const panel = this._panel;
    for (const el of e.composedPath()) {
      if (el === this) break;
      if (!(el instanceof Element)) continue;
      if (el === panel) return !this._atEnd();
      if (el.classList.contains('backdrop')) return false;
      // Taps there open something, but a swipe still puts the panel away.
      if (el.matches('[data-swipe]')) return false;
      if (el.matches(DRAGS_OWN)) return true;
      const style = getComputedStyle(el);
      const action = style.touchAction;
      if (action === 'none' || (action !== 'auto' && !/pan-y|pan-up|manipulation/.test(action))) return true;
      if (/auto|scroll/.test(style.overflowY) && el.scrollTop + el.clientHeight < el.scrollHeight - 2) return true;
    }
    return false;
  }

  /** Scrolled to the end, or with nothing to scroll. */
  private _atEnd(): boolean {
    const panel = this._panel;
    return !panel || panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2;
  }

  /** Follows a move; true once it's a swipe up that moves the panel. */
  private _follow(swipe: { x: number; y: number; active: boolean }, x: number, y: number): boolean {
    const dx = x - swipe.x;
    const dy = y - swipe.y;
    if (!swipe.active) {
      // Down scrolls the panel back up, and sideways is the dock's.
      if (dy > SWIPE_SLOP || Math.abs(dx) > Math.max(SWIPE_SLOP, -dy)) {
        this._swipe = undefined;
        return false;
      }
      if (dy > -SWIPE_SLOP) return false;
      swipe.active = true;
    }
    this._dy = Math.min(0, dy);
    return true;
  }

  private _touchStart = {
    passive: true,
    handleEvent: (e: TouchEvent): void => {
      this._swipe = undefined;
      if (e.touches.length !== 1 || this._ownsSwipe(e)) return;
      this._swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, active: false };
    },
  };

  private _touchMove = {
    passive: false,
    handleEvent: (e: TouchEvent): void => {
      const swipe = this._swipe;
      if (!swipe || e.touches.length !== 1) return;
      if (this._follow(swipe, e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault();
    },
  };

  private _touchEnd = (): void => this._release();

  private _down(e: PointerEvent): void {
    if (e.pointerType === 'touch' || e.button !== 0 || this._ownsSwipe(e)) return;
    this._swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
  }

  private _move(e: PointerEvent): void {
    const swipe = this._swipe;
    if (!swipe || swipe.id !== e.pointerId) return;
    const was = swipe.active;
    if (this._follow(swipe, e.clientX, e.clientY) && !was) {
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Pointer already gone.
      }
    }
  }

  private _up(e: PointerEvent): void {
    if (this._swipe?.id === e.pointerId) this._release();
  }

  private _release(): void {
    const swipe = this._swipe;
    this._swipe = undefined;
    if (!swipe?.active) return;
    this._swallowClick = true;
    window.setTimeout(() => (this._swallowClick = false));
    if (this._dy < -CLOSE_DISTANCE) this.close();
    else this._dy = 0;
  }

  private _onClick = {
    capture: true,
    handleEvent: (e: Event): void => {
      if (!this._swallowClick) return;
      this._swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  // ---- The dock and its stage -----------------------------------------------

  /** The dock items showing now, in order. */
  private _entries(): Entry[] {
    return dockOf(this.config)
      .map((raw, index) => ({ item: normalizeDock(raw), index }))
      .filter(({ item }) => dockKind(item) && dockShows(item, this.hass));
  }

  /** On the stage: the item tapped, else the first set to open first, else the first. */
  private _current(entries: Entry[]): Entry | undefined {
    if (entries.length === 1) return entries[0];
    if (this._picked === null) return undefined;
    return entries.find((e) => e.index === this._picked) ?? entries.find((e) => e.item.open) ?? entries[0];
  }

  private _pick(index: number, open: boolean): void {
    this._picked = open ? null : index;
  }

  /** The speaker a dock item shows: what's playing, or a speaker of its own. */
  private _player(item: QuickDockConfig) {
    const kind = dockKind(item);
    if (kind === 'media') return pickPlayer(this.hass, this.config?.media_player);
    if (kind === 'entity' && domainOf(item.entity!) === 'media_player') return this.hass?.states[item.entity!];
    return undefined;
  }

  /** What's playing's artwork, for a speaker's icon. */
  private _artwork(item: QuickDockConfig): string | undefined {
    const player = this._player(item);
    const playing = player?.state === 'playing' || player?.state === 'paused';
    return playing ? (player?.attributes.entity_picture as string | undefined) : undefined;
  }

  private _renderDock(entries: Entry[], current: Entry | undefined) {
    return html`<nav class="dock" aria-label="Quick panel">
      ${entries.map(({ item, index }) => {
        const on = current?.index === index;
        const label = dockLabel(this.hass, item);
        const art = this._artwork(item);
        const entity = dockEntity(item);
        const lit = !!entity && isActive(this.hass?.states[entity]);
        return html`<button
          class="dock-item ${on ? 'on' : ''}"
          aria-pressed=${on}
          aria-label=${label}
          @click=${() => this._pick(index, on)}
        >
          <span class="dock-icon ${art ? 'art' : ''} ${lit ? 'lit' : ''}"
            style=${art ? `background-image: url("${art}")` : ''}>
            ${art ? nothing : dockIcon(this.hass, item, label)}
          </span>
          <span class="dock-label">${label}</span>
        </button>`;
      })}
    </nav>`;
  }

  private _renderStage(item: QuickDockConfig) {
    switch (dockKind(item)) {
      case 'media':
        return html`<luxframe-now-playing class="card media" .hass=${this.hass} .entity=${this.config?.media_player}>
        </luxframe-now-playing>`;
      case 'entity':
        // A speaker shows what it's playing; a tap there opens it in full.
        if (domainOf(item.entity!) === 'media_player') {
          return html`<luxframe-now-playing class="card media" .hass=${this.hass} .entity=${item.entity}>
          </luxframe-now-playing>`;
        }
        return html`<div class="card view">
          ${renderEntityView(this.hass, this.hass?.states[item.entity!])}
        </div>`;
      case 'card':
        return html`<luxframe-stage-card class="card bare" .hass=${this.hass} .card=${item.card}
          ?glass=${item.glass !== false}></luxframe-stage-card>`;
      case 'tile': {
        const tile = item.tile!;
        const size = (PRESETS.has(String(tile.size)) ? tile.size : 'w') as TileSize;
        const height = Number(item.height) > 0 ? Number(item.height) : TILE_HEIGHT;
        return html`<div class="tile-box" style="height: ${height}px">${renderTile(this.hass, tile, size)}</div>`;
      }
      default:
        return nothing;
    }
  }

  private _renderSide() {
    const pinned = (this.config?.pinned ?? []).slice(0, MAX_PINNED);
    const brightness = this.config?.brightness !== false;
    if (!brightness && !pinned.length && !this.assist) return nothing;
    const level = this.brightness;
    return html`
      <div class="side">
        ${brightness
          ? html`<div class="card">
              <div class="labelled">
                ${icon('sun', 22)}
                <luxframe-slider
                  filled
                  label="Screen brightness"
                  .min=${MIN_BRIGHTNESS}
                  .value=${level}
                  .valueText=${`${level}%`}
                  @input=${(e: CustomEvent<number>) => this._fire('brightness', e.detail)}
                  @change=${(e: CustomEvent<number>) => this._fire('brightness', e.detail)}
                ></luxframe-slider>
              </div>
            </div>`
          : nothing}
        ${pinned.length
          ? html`<div class="pinned" style="--columns: ${Math.min(pinned.length, 4)}">
              ${pinned.map(
                (entity) => html`<luxframe-tile .hass=${this.hass} .entity=${entity} subtitle="state">
                </luxframe-tile>`,
              )}
            </div>`
          : nothing}
        ${this.assist
          ? html`<button class="pill ask" @click=${() => this._fire('ask')}>
              ${icon('ask', 22)} Ask Home Assistant
            </button>`
          : nothing}
      </div>
    `;
  }

  private _fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  protected render() {
    const dragging = this.offset > 0 || this._swipe?.active;
    const style = this._closing
      ? 'transform: translateY(-100%)'
      : `transform: translateY(${-this.offset + this._dy}px)`;
    const entries = this._entries();
    const current = this._current(entries);
    const side = this._renderSide();
    const main = entries.length
      ? html`<div class="main">
          ${entries.length > 1 ? this._renderDock(entries, current) : nothing}
          ${current
            ? keyed(
                current.index,
                html`<div class="stage" role="region" aria-label=${dockLabel(this.hass, current.item)}>
                  ${this._renderStage(current.item)}
                </div>`,
              )
            : nothing}
        </div>`
      : nothing;
    const columns = entries.length && side !== nothing ? 'two' : '';
    return html`
      <div
        class="backdrop ${this._closing ? 'closing' : ''}"
        @pointerdown=${this._down}
        @pointermove=${this._move}
        @pointerup=${this._up}
        @pointercancel=${this._up}
        @touchstart=${this._touchStart}
        @touchmove=${this._touchMove}
        @touchend=${this._touchEnd}
        @touchcancel=${this._touchEnd}
        @click=${this.close}
      ></div>
      <section
        class="panel ${dragging ? 'dragging' : ''} ${this._drop ? 'drop' : ''}"
        style=${style}
        role="dialog"
        aria-label="Quick controls"
        @pointerdown=${this._down}
        @pointermove=${this._move}
        @pointerup=${this._up}
        @pointercancel=${this._up}
        @touchstart=${this._touchStart}
        @touchmove=${this._touchMove}
        @touchend=${this._touchEnd}
        @touchcancel=${this._touchEnd}
        @click=${this._onClick}
      >
        <div class="content ${columns}">${main} ${side}</div>
        <button class="grabber" aria-label="Close quick controls" @click=${this.close}></button>
      </section>
    `;
  }

  static styles = [
    controls,
    css`
    :host {
      position: absolute;
      inset: 0;
      z-index: 8;
      color: var(--lf-text);
      font-family: var(--lf-font);
    }

    .backdrop {
      position: absolute;
      inset: 0;
      touch-action: none;
      background: rgb(0 0 0 / 22%);
      animation: fade var(--lf-move) ease-out;
      transition: opacity var(--lf-move);
    }

    .backdrop.closing {
      opacity: 0;
    }

    /*
     * As tall as what it shows, up to most of the screen, leaving a strip
     * below to tap it away; past that it scrolls. Touch scrolls it natively,
     * up and down only, and never the page behind.
     */
    .panel {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      max-height: 92%;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      padding: var(--lf-pad) var(--lf-pad) 10px;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: none;
      border-radius: 0 0 calc(var(--lf-radius) + 10px) calc(var(--lf-radius) + 10px);
      background: var(--lf-sheet);
      -webkit-backdrop-filter: var(--lf-blur-strong);
      backdrop-filter: var(--lf-blur-strong);
      box-shadow: 0 20px 50px rgb(0 0 0 / 30%);
      transition: transform var(--lf-move) var(--lf-ease);
      touch-action: pan-y;
    }

    .panel::-webkit-scrollbar {
      display: none;
    }

    .panel.dragging {
      transition: none;
    }

    .panel.drop {
      animation: drop var(--lf-move) var(--lf-ease);
    }

    @keyframes drop {
      from {
        transform: translateY(-100%);
      }
    }

    .content {
      flex: none;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
      gap: var(--lf-gap);
    }

    @media (orientation: landscape) {
      .content.two {
        grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
      }
    }

    .main {
      display: flex;
      flex-direction: column;
      gap: var(--lf-gap);
      min-width: 0;
    }

    /* The dock: glass icons with their names under them. */
    .dock {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
    }

    .dock-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      width: 76px;
      padding: 0;
      background: none;
    }

    .dock-icon {
      position: relative;
      display: grid;
      place-items: center;
      width: 60px;
      height: 60px;
      border-radius: var(--lf-radius-icon);
      color: var(--lf-text);
      background: var(--lf-control) center / cover no-repeat;
      --mdc-icon-size: 28px;
      transition:
        background-color var(--lf-move),
        color var(--lf-move),
        transform var(--lf-fast);
    }

    .dock-icon.lit {
      color: var(--lf-accent);
    }

    .dock-item.on .dock-icon {
      background-color: var(--lf-surface-active);
      color: var(--lf-text-active);
    }

    /* Artwork fills the media icon; picked, a ring says so. */
    .dock-item.on .dock-icon.art {
      box-shadow: 0 0 0 3px var(--lf-surface-active);
    }

    .dock-item:active .dock-icon {
      transform: scale(0.96);
    }

    .glyph {
      font-size: 22px;
      font-weight: 600;
    }

    .dock-label {
      max-width: 100%;
      overflow: hidden;
      font-size: 13px;
      color: var(--lf-muted);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dock-item.on .dock-label {
      color: var(--lf-text);
    }

    .stage {
      min-width: 0;
      animation: stage-in var(--lf-move) var(--lf-ease);
    }

    @keyframes stage-in {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 18px;
      border-radius: var(--lf-radius);
      background: var(--lf-control-row);
    }

    /* A Home Assistant card brings its own padding. */
    .card.bare {
      display: block;
      padding: 0;
      overflow: hidden;
    }

    /* A device's controls, as in its details, smaller. */
    .card.view {
      align-items: center;
      padding: 22px 18px;
      --lf-detail-big-height: min(28vh, 240px);
      --lf-detail-big-width: 104px;
      --lf-detail-temp-size: clamp(64px, 7vw, 96px);
    }

    .tile-box {
      display: block;
    }

    .labelled {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--lf-muted);
    }

    .labelled luxframe-slider {
      flex: 1;
      --slider-fill: var(--lf-surface-active);
    }

    .side {
      display: flex;
      flex-direction: column;
      gap: var(--lf-gap);
      min-width: 0;
    }

    .pinned {
      display: grid;
      grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
      gap: var(--lf-gap);
    }

    .pinned luxframe-tile {
      --mdc-icon-size: 28px;
    }

    .ask {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-width: 0;
    }

    .grabber {
      flex: none;
      align-self: center;
      width: 64px;
      height: 22px;
      margin-top: 8px;
      padding: 0;
      background: none;
      position: relative;
    }

    .grabber::after {
      content: '';
      position: absolute;
      left: 10px;
      right: 10px;
      top: 8px;
      height: 5px;
      border-radius: 3px;
      background: var(--lf-faint);
    }

    @keyframes fade {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .panel,
      .backdrop,
      .stage {
        transition: none;
        animation: none;
      }
    }
  `,
  ];
}

define('luxframe-quick-panel', LuxFrameQuickPanel);
