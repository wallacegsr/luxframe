import { css, html, nothing, svg } from 'lit';
import { entitiesInArea, fetchTodo, findArea, type TodoItem } from '../data';
import { define } from '../define';
import { domainOf, openDetail } from '../entity';
import { icon } from '../icons';
import { controls, glass, tileBase } from '../theme';
import { formatClock } from '../time';
import type { RoomTileConfig, SunTileConfig, TileSize, TodoTileConfig } from '../types';
import { goTo } from './goto';
import { SizedTile } from './sized';

const shared = [
  controls,
  css`
    .tile {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 6px;
      padding: 14px 16px;
      outline: none;
    }

    .tile:focus-visible {
      box-shadow: 0 0 0 3px var(--lf-accent);
    }

    .message {
      align-items: center;
      text-align: center;
    }

    button {
      background: none;
      padding: 0;
    }

    button:focus-visible {
      border-radius: 8px;
    }
  `,
];

// ---- Sunrise and sunset ---------------------------------------------------------

/**
 * When the sun next rises or sets, the nearer one large. On bigger tiles an
 * arc shows where the sun is in today's sky.
 */
export class LuxFrameSunTile extends SizedTile {
  declare config?: SunTileConfig;

  protected render() {
    const s = this.hass?.states[this.config?.entity ?? 'sun.sun'];
    if (!s?.attributes.next_rising || !s.attributes.next_setting) {
      return html`<div class="tile glass message muted">No sun entity</div>`;
    }
    const rising = new Date(s.attributes.next_rising);
    const setting = new Date(s.attributes.next_setting);
    const up = s.state === 'above_horizon';
    const [first, second] = up
      ? [{ label: 'Sunset', at: setting, icon: 'sunset' as const }, { label: 'Sunrise', at: rising, icon: 'sunrise' as const }]
      : [{ label: 'Sunrise', at: rising, icon: 'sunrise' as const }, { label: 'Sunset', at: setting, icon: 'sunset' as const }];

    // Today's rise was about a day before the next one.
    const now = Date.now();
    const rose = rising.getTime() - 86_400_000;
    const progress = up ? Math.min(1, Math.max(0, (now - rose) / (setting.getTime() - rose))) : undefined;
    const roomy = this.size === 'm' || this.size === 'l';

    return html`
      <div class="tile glass" role="img"
        aria-label="${first.label} at ${formatClock(this.hass, first.at)}, ${second.label.toLowerCase()} at ${formatClock(this.hass, second.at)}">
        ${roomy ? this._arc(progress) : nothing}
        <div class="next">
          ${icon(first.icon, roomy ? 34 : 26)}
          <span class="time">${formatClock(this.hass, first.at)}</span>
        </div>
        <div class="muted">${first.label} · ${second.label} ${formatClock(this.hass, second.at)}</div>
      </div>
    `;
  }

  private _arc(progress: number | undefined) {
    const angle = Math.PI * (1 - (progress ?? 0));
    const x = 50 + 40 * Math.cos(angle);
    const y = 46 - 40 * Math.sin(angle);
    return html`<svg class="arc" viewBox="0 0 100 50" aria-hidden="true">
      <path d="M10 46 A40 40 0 0 1 90 46" />
      <line x1="2" y1="46" x2="98" y2="46" />
      ${progress !== undefined ? svg`<circle cx=${x} cy=${y} r="5" />` : nothing}
    </svg>`;
  }

  static styles = [
    tileBase,
    glass,
    shared,
    css`
      .tile {
        align-items: center;
        text-align: center;
      }

      .next {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--lf-text);
      }

      .time {
        font-size: 32px;
        font-weight: 300;
        font-variant-numeric: tabular-nums;
      }

      :host([size='m']) .time,
      :host([size='l']) .time {
        font-size: 48px;
      }

      .muted {
        font-size: 15px;
      }

      .arc {
        width: min(80%, 220px);
        overflow: visible;
      }

      .arc path {
        fill: none;
        stroke: var(--lf-faint);
        stroke-width: 1.5;
        stroke-dasharray: 3 3;
      }

      .arc line {
        stroke: var(--lf-faint);
        stroke-width: 1;
      }

      .arc circle {
        fill: var(--lf-accent);
      }
    `,
  ];
}

// ---- To-do lists ---------------------------------------------------------------------

const TODO_SHOWN: Record<TileSize, number> = { s: 0, w: 2, m: 5, l: 6 };

/**
 * A to-do list's open items, ticked off with a tap on the circle. A small
 * tile shows how many are left.
 */
export class LuxFrameTodoTile extends SizedTile {
  static properties = { ...SizedTile.properties, _items: { state: true } };

  declare config?: TodoTileConfig;
  declare _items?: TodoItem[];

  private _seen = '';

  protected willUpdate(): void {
    // The entity's state is the open count; it changes whenever the list does.
    const s = this.config ? this.hass?.states[this.config.entity] : undefined;
    const key = s ? `${s.entity_id}|${s.state}|${s.last_changed ?? ''}` : '';
    if (key && key !== this._seen) {
      this._seen = key;
      fetchTodo(this.hass, s!.entity_id)
        .then((items) => (this._items = items))
        .catch(() => (this._items = []));
    }
  }

  private _complete(item: TodoItem, e: Event): void {
    e.stopPropagation();
    this._items = this._items?.filter((i) => i.uid !== item.uid);
    this.hass?.callService('todo', 'update_item', {
      entity_id: this.config!.entity,
      item: item.uid,
      status: 'completed',
    });
  }

  protected render() {
    const s = this.config ? this.hass?.states[this.config.entity] : undefined;
    if (!s) return html`<div class="tile glass message muted">No to-do list</div>`;
    const open = (this._items ?? []).filter((i) => i.status === 'needs_action');
    const count = this._items ? open.length : Number(s.state) || 0;
    const shown = open.slice(0, TODO_SHOWN[this.size] ?? 0);
    const name = s.attributes.friendly_name ?? s.entity_id;

    return html`
      <div class="tile glass ${this.size === 's' ? 'message' : ''}" role="button" tabindex="0"
        @click=${() => openDetail(this, s.entity_id)}>
        <div class="head">
          ${icon('list', 22)}
          <span class="name">${name}</span>
          ${this.size === 's' ? nothing : html`<span class="muted count">${count}</span>`}
        </div>
        ${this.size === 's'
          ? html`<div class="big">${count}</div><div class="muted">${count === 1 ? 'item' : 'items'} left</div>`
          : shown.length
            ? html`<ul>
                ${shown.map(
                  (item) => html`<li>
                    <button class="check" aria-label="Mark ${item.summary} done"
                      @click=${(e: Event) => this._complete(item, e)}>${icon('circle', 24)}</button>
                    <span class="summary">${item.summary}</span>
                  </li>`,
                )}
                ${open.length > shown.length
                  ? html`<li class="muted more">${open.length - shown.length} more</li>`
                  : nothing}
              </ul>`
            : html`<div class="muted">${this._items ? 'All done' : ''}</div>`}
      </div>
    `;
  }

  static styles = [
    tileBase,
    glass,
    shared,
    css`
      .tile {
        justify-content: flex-start;
        cursor: pointer;
      }

      .tile.message {
        justify-content: center;
      }

      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .name {
        flex: 1;
        min-width: 0;
        font-size: 17px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .message .name {
        flex: none;
      }

      .big {
        font-size: 44px;
        font-weight: 300;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }

      ul {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin: 4px 0 0;
        padding: 0;
        list-style: none;
      }

      :host([size='w']) ul {
        flex-direction: row;
        gap: 14px;
      }

      li {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        min-height: 44px;
      }

      .check {
        flex: none;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        margin: -6px -6px -6px -10px;
        color: var(--lf-muted);
      }

      .summary {
        min-width: 0;
        font-size: 17px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .more {
        padding-left: 32px;
        font-size: 15px;
      }
    `,
  ];
}

// ---- Rooms -------------------------------------------------------------------------------

/**
 * One area at a glance: its temperature and how many lights are on. The icon
 * switches the room's lights (off if any are on, otherwise on); the rest goes
 * to the room's page, if there's one with its name.
 */
export class LuxFrameRoomTile extends SizedTile {
  declare config?: RoomTileConfig;

  private _lights(areaId: string) {
    return entitiesInArea(this.hass, areaId).filter((s) => domainOf(s.entity_id) === 'light');
  }

  private _toggle(areaId: string, e: Event): void {
    e.stopPropagation();
    const lights = this._lights(areaId);
    const on = lights.filter((s) => s.state === 'on');
    const target = on.length ? on : lights;
    if (!target.length) return;
    this.hass?.callService('light', on.length ? 'turn_off' : 'turn_on', {
      entity_id: target.map((s) => s.entity_id),
    });
  }

  protected render() {
    const area = this.config ? findArea(this.hass, this.config.area) : undefined;
    if (!area) return html`<div class="tile glass message muted">No room “${this.config?.area ?? ''}”</div>`;
    const entities = entitiesInArea(this.hass, area.area_id);
    const lights = entities.filter((s) => domainOf(s.entity_id) === 'light');
    const on = lights.filter((s) => s.state === 'on').length;
    const temp = entities.find(
      (s) => domainOf(s.entity_id) === 'sensor' && s.attributes.device_class === 'temperature' && !isNaN(Number(s.state)),
    );
    const parts = [
      temp ? `${Math.round(Number(temp.state) * 10) / 10}${temp.attributes.unit_of_measurement ?? '°'}` : undefined,
      lights.length ? (on ? `${on} ${on === 1 ? 'light' : 'lights'} on` : 'Lights off') : undefined,
    ].filter(Boolean);

    return html`
      <div class="tile glass ${on ? 'active' : ''}" role="button" tabindex="0" aria-label="${area.name}"
        @click=${() => goTo(this, { title: area.name })}>
        <button class="icon" aria-label="${on ? 'Turn off' : 'Turn on'} the ${area.name} lights"
          ?disabled=${!lights.length} @click=${(e: Event) => this._toggle(area.area_id, e)}>
          ${icon(lights.length ? 'bulb' : 'room', 30)}
        </button>
        <div class="name">${area.name}</div>
        <div class="muted">${parts.join(' · ')}</div>
      </div>
    `;
  }

  static styles = [
    tileBase,
    glass,
    shared,
    css`
      .tile {
        align-items: center;
        text-align: center;
        gap: 8px;
        cursor: pointer;
        transition:
          background var(--lf-move),
          color var(--lf-move);
      }

      .icon {
        display: grid;
        place-items: center;
        width: 52px;
        height: 52px;
        margin: -6px;
        border-radius: 50%;
        transition: transform var(--lf-fast);
      }

      .icon:active:not(:disabled) {
        transform: scale(0.96);
      }

      .icon:disabled {
        cursor: inherit;
        opacity: 1;
      }

      .active .icon {
        color: var(--lf-color-light);
      }

      .name {
        font-size: 17px;
        font-weight: 600;
      }

      .muted {
        font-size: 15px;
        font-variant-numeric: tabular-nums;
      }

      /* tile_style: corner, as Apple's Home app lays its tiles out. */
      @container style(--lf-tile-style: corner) {
        .tile {
          align-items: flex-start;
          justify-content: space-between;
          text-align: left;
        }

        .icon {
          margin: -4px 0 0 -4px;
          background: var(--lf-control);
        }

        .active .icon {
          background: color-mix(in srgb, var(--lf-color-light) 18%, transparent);
        }

        .name {
          margin-top: auto;
        }
      }
    `,
  ];
}

define('luxframe-sun-tile', LuxFrameSunTile);
define('luxframe-todo-tile', LuxFrameTodoTile);
define('luxframe-room-tile', LuxFrameRoomTile);
