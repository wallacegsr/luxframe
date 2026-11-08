import { LitElement, css, html, nothing } from 'lit';
import { conditionsMet } from './conditions';
import { define } from './define';
import { domainOf, isActive, isGuardedCover, openDetail, resolve, stateLabel, tapAction } from './entity';
import { stateIcon } from './icon';
import type { Badge, BadgeConfig, HassEntity, HomeAssistant, LuxFrameConfig, PageConfig } from './types';

/** Where a badge lives: the page's own list, the frame's list, or a room's `sensors`. */
export type BadgeScope = 'page' | 'frame' | 'fixed';

export interface BadgeItem {
  badge: BadgeConfig;
  scope: BadgeScope;
  /** Its place in that list. */
  index: number;
}

/** Domains a tap runs rather than opens. */
const RUNS = new Set(['scene', 'script', 'button', 'input_button']);

/** Domains `tap: toggle` makes sense for. Locks and guarded covers still open details. */
export const TOGGLEABLE = new Set(['light', 'switch', 'fan', 'input_boolean', 'automation', 'cover', 'lock']);

export function normalizeBadge(badge: Badge): BadgeConfig {
  return typeof badge === 'string' ? { entity: badge } : badge;
}

/** The short form when nothing but the entity is set. */
export function compactBadge(badge: BadgeConfig): Badge {
  const keys = Object.keys(badge).filter((k) => badge[k as keyof BadgeConfig] !== undefined);
  return keys.length === 1 && keys[0] === 'entity' && badge.entity ? badge.entity : badge;
}

/** Whether a tap runs something: an action, or a scene, script or button. */
export function badgeRuns(badge: BadgeConfig): boolean {
  return !!badge.action || (!!badge.entity && RUNS.has(domainOf(badge.entity)));
}

/** The pages with a title bar, where badges show. */
export function hasTitleBar(page: PageConfig): boolean {
  return ['grid', 'calendar', 'cameras', 'scenes', 'room'].includes(page.type);
}

/** A page's badges in order: a room's sensors, the page's own, then the frame's. */
export function badgeItems(page: PageConfig, config: LuxFrameConfig): BadgeItem[] {
  if (!hasTitleBar(page)) return [];
  const own = ('badges' in page && page.badges) || [];
  const sensors = page.type === 'room' ? (page.sensors ?? []) : [];
  return [
    ...sensors.map((entity, index) => ({ badge: { entity }, scope: 'fixed' as const, index })),
    ...own.map((b, index) => ({ badge: normalizeBadge(b), scope: 'page' as const, index })),
    ...(config.badges ?? []).map((b, index) => ({ badge: normalizeBadge(b), scope: 'frame' as const, index })),
  ];
}

/** "29 minutes ago", "in 2 hours": how Home Assistant's badges give a time. */
export function relativeTime(hass: HomeAssistant | undefined, iso: string | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return '';
  const seconds = (at - now) / 1000;
  const abs = Math.abs(seconds);
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    abs < 45
      ? [seconds, 'second']
      : abs < 45 * 60
        ? [seconds / 60, 'minute']
        : abs < 22 * 3600
          ? [seconds / 3600, 'hour']
          : abs < 26 * 86400
            ? [seconds / 86400, 'day']
            : abs < 320 * 86400
              ? [seconds / (30 * 86400), 'month']
              : [seconds / (365 * 86400), 'year'];
  try {
    return new Intl.RelativeTimeFormat(hass?.locale?.language, { numeric: 'auto' }).format(Math.round(value), unit);
  } catch {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(value), unit);
  }
}

/** A state that is a moment: an event's last firing, or a timestamp sensor. */
function isMoment(stateObj: HassEntity): boolean {
  return (
    (domainOf(stateObj.entity_id) === 'event' || stateObj.attributes.device_class === 'timestamp') &&
    Number.isFinite(Date.parse(stateObj.state))
  );
}

/**
 * The state part of a badge, from `state_content`: the state, when it last
 * changed or updated, or attributes, joined with " · ".
 */
export function badgeState(
  hass: HomeAssistant | undefined,
  stateObj: HassEntity,
  content: string | string[] | undefined,
): string {
  const parts = Array.isArray(content) ? content : [content ?? 'state'];
  return parts
    .map((part) => {
      if (part === 'state') return shortState(hass, stateObj);
      if (part === 'last_changed' || part === 'last_updated') {
        return relativeTime(hass, stateObj[part] ?? stateObj.last_changed);
      }
      const value = stateObj.attributes[part];
      if (value === undefined || value === null || value === '') return '';
      return hass?.formatEntityAttributeValue?.(stateObj, part) ?? String(value);
    })
    .filter(Boolean)
    .join(' · ');
}

/**
 * "21.4 °C" → "21°", "1234.5 W" → "1235 W", an event's time → "29 minutes
 * ago"; anything else as Home Assistant words it.
 */
export function shortState(hass: HomeAssistant | undefined, stateObj: HassEntity): string {
  if (isMoment(stateObj)) return relativeTime(hass, stateObj.state);
  const unit = stateObj.attributes.unit_of_measurement as string | undefined;
  const n = Number(stateObj.state);
  if (unit && stateObj.state.trim() !== '' && Number.isFinite(n)) {
    const rounded = Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
    const text = rounded.toLocaleString(hass?.locale?.language);
    if (unit === '°C' || unit === '°F') return `${text}°`;
    if (unit === '%') return `${text}%`;
    return `${text} ${unit}`;
  }
  return stateLabel(hass, stateObj);
}

/** Holding a badge this long starts editing, as holding a tile does. */
const HOLD_MS = 1000;
const HOLD_TOLERANCE = 10;
const DONE_MS = 1200;
/** How often times like "29 minutes ago" move on. */
const TICK_MS = 30_000;

/**
 * The badges in a page's title bar. A tap opens an entity's details, toggles
 * it, or runs a scene, script, button or action; holding opens Home
 * Assistant's own dialog. While editing, a tap asks to edit the badge, and
 * `+ Badge` asks to add one. Fires `luxframe-badge-edit` ({scope, index}) and
 * `luxframe-badge-add`.
 */
export class LuxFrameBadges extends LitElement {
  static properties = {
    hass: { attribute: false },
    items: { attribute: false },
    editing: { type: Boolean, reflect: true },
    _done: { state: true },
    _now: { state: true },
  };

  declare hass?: HomeAssistant;
  declare items: BadgeItem[];
  declare editing: boolean;
  /** The badge that just ran, flashing "Done". */
  declare _done?: BadgeItem;
  /** Re-renders now and then, so times like "29 minutes ago" stay true. */
  declare _now: number;
  private _tick?: number;

  private _holdTimer?: number;
  private _holdAt?: { x: number; y: number };
  private _held = false;
  private _doneTimer?: number;

  constructor() {
    super();
    this.items = [];
    this.editing = false;
    this._now = Date.now();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._tick = window.setInterval(() => (this._now = Date.now()), TICK_MS);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._tick);
    window.clearTimeout(this._holdTimer);
    window.clearTimeout(this._doneTimer);
  }

  private _fire(name: string, detail: unknown = {}): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _down(e: PointerEvent): void {
    // The badge keeps its hold to itself, so the release isn't also a tap.
    e.stopPropagation();
    this._held = false;
    window.clearTimeout(this._holdTimer);
    if (this.editing || e.button !== 0) return;
    this._holdAt = { x: e.clientX, y: e.clientY };
    this._holdTimer = window.setTimeout(() => {
      this._held = true;
      this._fire('luxframe-edit-start');
    }, HOLD_MS);
  }

  private _move(e: PointerEvent): void {
    const at = this._holdAt;
    if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > HOLD_TOLERANCE) this._up();
  }

  private _up(): void {
    window.clearTimeout(this._holdTimer);
    this._holdAt = undefined;
  }

  private _tap(item: BadgeItem): void {
    if (this._held) {
      this._held = false;
      return;
    }
    if (this.editing) {
      if (item.scope !== 'fixed') this._fire('luxframe-badge-edit', { scope: item.scope, index: item.index });
      return;
    }
    const { badge } = item;
    const hass = this.hass;
    const stateObj = badge.entity ? hass?.states[badge.entity] : undefined;
    if (!hass) return;

    if (badge.action) {
      const [domain, service] = badge.action.split('.');
      if (!domain || !service) return;
      const data = { ...(badge.data ?? {}) };
      if (badge.entity && data.entity_id === undefined) data.entity_id = badge.entity;
      hass.callService(domain, service, data);
      return this._flash(item);
    }
    if (!badge.entity) return;
    const domain = domainOf(badge.entity);
    if (domain === 'button' || domain === 'input_button') {
      hass.callService(domain, 'press', { entity_id: badge.entity });
      return this._flash(item);
    }
    if (domain === 'scene' || domain === 'script') {
      tapAction(hass, stateObj);
      return this._flash(item);
    }
    const guarded = domain === 'lock' || (stateObj && isGuardedCover(stateObj));
    if (badge.tap === 'toggle' && !guarded && tapAction(hass, stateObj)) return;
    openDetail(this, badge.entity);
  }

  private _flash(item: BadgeItem): void {
    window.clearTimeout(this._doneTimer);
    this._done = item;
    this._doneTimer = window.setTimeout(() => (this._done = undefined), DONE_MS);
  }

  private _renderBadge(item: BadgeItem, shows: boolean) {
    const { badge } = item;
    const hass = this.hass;
    const stateObj = badge.entity ? hass?.states[badge.entity] : undefined;
    const runs = badgeRuns(badge);
    const name = badge.name ?? (badge.entity ? resolve(hass, badge.entity).name : badge.action ?? '');
    const done = this._done?.scope === item.scope && this._done.index === item.index;
    const state = done
      ? 'Done'
      : runs
        ? undefined
        : stateObj
          ? badgeState(hass, stateObj, badge.state_content)
          : 'Not found';
    // What shows, as Home Assistant's badges choose it. Unset, a badge shows
    // its own name before the state, or the state alone.
    const showState = !runs && badge.show_state !== false;
    const showName = runs || (badge.show_name ?? (!!badge.name || !showState));
    const showIcon = badge.show_icon !== false;
    const stacked = showState && badge.show_name === true;
    const label = runs
      ? name
      : [showName ? name : '', showState ? state : '']
          .filter(Boolean)
          .join(' ');
    const active = !runs && isActive(stateObj);
    const iconHtml = !showIcon
      ? nothing
      : badge.icon && !stateObj && customElements.get('ha-icon')
        ? html`<ha-icon .icon=${badge.icon}></ha-icon>`
        : stateIcon(hass, stateObj, badge.icon, name || '?');
    const text =
      runs && done
        ? html`<span class="label">Done</span>`
        : stacked
          ? html`<span class="label stack"><span class="name">${name}</span><span>${state}</span></span>`
          : label
            ? html`<span class="label">${label}</span>`
            : nothing;
    return html`<button
      class="badge ${active ? 'on' : ''} ${runs ? 'runs' : ''} ${done ? 'done' : ''} ${shows ? '' : 'unmet'}
        ${text === nothing ? 'bare' : ''} ${showIcon ? '' : 'no-icon'}"
      aria-label=${runs ? `${name}${done ? ', done' : ''}` : `${name}: ${state}`}
      @pointerdown=${this._down}
      @pointermove=${this._move}
      @pointerup=${this._up}
      @pointercancel=${this._up}
      @pointerleave=${this._up}
      @contextmenu=${(e: Event) => e.preventDefault()}
      @click=${() => this._tap(item)}
    >
      ${showIcon ? html`<span class="icon">${iconHtml}</span>` : nothing} ${text}
    </button>`;
  }

  protected render() {
    const items = this.items.map((item) => ({ item, shows: conditionsMet(item.badge.visibility, this.hass) }));
    const shown = this.editing ? items : items.filter((i) => i.shows);
    if (!shown.length && !this.editing) return nothing;
    return html`
      ${shown.map(({ item, shows }) => this._renderBadge(item, shows))}
      ${this.editing
        ? html`<button class="badge add" @click=${() => this._fire('luxframe-badge-add')}>+ Badge</button>`
        : nothing}
    `;
  }

  static styles = css`
    /*
     * Right-aligned unless the page or frame says otherwise (badge_align),
     * through --lf-badges-*: left follows the title, center sits mid-page.
     * They stay on one line, as Home Assistant's do; when there are more than
     * fit, the line scrolls sideways.
     */
    :host {
      display: flex;
      flex-wrap: nowrap;
      flex: 1 1 0;
      min-width: 0;
      align-items: center;
      justify-content: var(--lf-badges-justify, safe flex-end);
      gap: 8px;
      margin-left: var(--lf-badges-margin, auto);
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-x: auto;
      scrollbar-width: none;
      align-self: center;
      position: var(--lf-badges-position, static);
      top: 50%;
      left: 50%;
      translate: var(--lf-badges-translate, none);
      max-width: 100%;
    }

    /* Stood upright, the title takes the line and the badges go under it. */
    @media (orientation: portrait) {
      :host {
        flex-basis: 100%;
        justify-content: var(--lf-badges-upright, flex-start);
        margin-left: 0;
        position: static;
        translate: none;
      }
    }

    :host::-webkit-scrollbar {
      display: none;
    }

    .badge {
      flex: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 38px;
      padding: var(--lf-badge-pad, 0 14px 0 10px);
      border: 0;
      border-radius: 999px;
      background: var(--lf-badge-bg, color-mix(in srgb, var(--lf-text) 8%, transparent));
      color: var(--lf-text);
      font: 500 16px var(--lf-font);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.2s;
    }

    .badge:active {
      background: var(--lf-badge-press, color-mix(in srgb, var(--lf-text) 16%, transparent));
    }

    .badge:not(.add):active {
      opacity: 0.7;
    }

    /* Icon only, or words only: even padding all round. */
    .badge.bare {
      padding: var(--lf-badge-pad-bare, 0 9px);
    }

    .badge.no-icon {
      padding: var(--lf-badge-pad-text, 0 14px);
    }

    /* The name over the state, as Home Assistant's badges have it. */
    .stack {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1.15;
    }

    .stack .name {
      color: var(--lf-muted);
      font-size: 12px;
    }

    .icon {
      display: inline-flex;
      color: var(--lf-muted);
      --mdc-icon-size: 20px;
    }

    .glyph {
      display: inline-grid;
      place-items: center;
      width: 20px;
      height: 20px;
      font-size: 13px;
      font-weight: 600;
    }

    .on {
      background: var(--lf-badge-on-bg, color-mix(in srgb, var(--lf-accent) 24%, transparent));
      color: var(--lf-badge-on-color, var(--lf-text));
    }

    .on .icon,
    .runs .icon {
      color: var(--lf-accent);
    }

    .done {
      background: var(--lf-badge-done-bg, color-mix(in srgb, #30d158 28%, transparent));
    }

    .done .label {
      color: var(--lf-badge-done-color, inherit);
    }

    .unmet {
      opacity: 0.4;
    }

    .add {
      padding: 0 14px;
      border: 1.5px dashed color-mix(in srgb, var(--lf-text) 35%, transparent);
      background: transparent;
    }
  `;
}

define('luxframe-badges', LuxFrameBadges);
