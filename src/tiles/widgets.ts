import { css, html, nothing, type PropertyValues } from 'lit';
import '../chart';
import { alarmLook } from '../detail/alarm';
import { numberRange, optionLabel, selectOption, setNumber } from '../detail/helpers';
import { avatar, avatarStyles, whereLabel } from '../detail/person';
import { measureColor } from '../detail/sensor';
import { formatDuration, ringStyles, timerLeft, timerRing } from '../detail/timer';
import { batteryOf, isCleaning, startOrPause } from '../detail/vacuum';
import { define } from '../define';
import { energySensors, flowDiagram, flowStyles, formatPower, readFlow } from '../energy';
import { changedAgo, domainOf, openDetail, openView, resolve, stateLabel } from '../entity';
import { fetchSeries, formatNumber, isNumeric, type Point } from '../history';
import { stateIcon } from '../icon';
import { icon } from '../icons';
import { Pending } from '../pending';
import '../slider';
import { controls, glass, tileBase } from '../theme';
import type {
  AlarmTileConfig,
  ButtonTileConfig,
  EnergyTileConfig,
  HassEntity,
  NumberTileConfig,
  PeopleTileConfig,
  SelectTileConfig,
  SensorTileConfig,
  TimerTileConfig,
  VacuumTileConfig,
} from '../types';
import { SizedTile } from './sized';

/**
 * The look the widget tiles share with the entity tile: an icon over a name
 * and a line of state, centered, or in the corners with `tile_style: corner`.
 */
const widgetStyles = [
  tileBase,
  glass,
  controls,
  css`
    .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px 12px;
      text-align: center;
      cursor: pointer;
      outline: none;
      user-select: none;
      transition:
        background var(--lf-move),
        color var(--lf-move),
        transform var(--lf-fast);
    }

    .tile:focus-visible {
      box-shadow: 0 0 0 3px var(--lf-accent);
    }

    .tile.missing {
      cursor: default;
      opacity: 0.5;
    }

    .icon {
      position: relative;
      flex: none;
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      margin: -6px;
      padding: 0;
      border-radius: 50%;
      color: var(--icon-color, var(--lf-text));
      background: none;
      --mdc-icon-size: 34px;
      --state-icon-color: currentColor;
    }

    button.icon:active:not(:disabled) {
      background: color-mix(in srgb, currentColor 14%, transparent);
    }

    .words {
      position: relative;
      max-width: 100%;
      min-width: 0;
    }

    .name {
      font-size: 17px;
      font-weight: 600;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sub {
      margin-top: 2px;
      font-size: 15px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .glyph {
      font-size: 24px;
      font-weight: 600;
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

    @container style(--lf-tile-style: corner) {
      .tile {
        align-items: flex-start;
        justify-content: space-between;
        text-align: left;
        padding: 14px 16px;
      }

      .icon {
        margin: -4px 0 0 -4px;
        background: var(--lf-control);
      }

      .words {
        width: 100%;
      }
    }
  `,
];

const missing = (what: string) => html`<div class="tile glass missing"><span class="muted">${what}</span></div>`;

const onKey = (run: () => void) => (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  run();
};

// ---- Action button ---------------------------------------------------------------

const CONFIRM_MS = 3000;
const DONE_MS = 1500;

/**
 * One big button that runs something: a script, scene, button or
 * automation, or any service with `action`. With `confirm`, the first tap
 * asks and a second runs it. A tick shows it went.
 */
export class LuxFrameButtonTile extends SizedTile {
  static properties = { ...SizedTile.properties, _asking: { state: true }, _done: { state: true } };

  declare config?: ButtonTileConfig;
  declare _asking: boolean;
  declare _done: boolean;

  private _timer?: number;

  constructor() {
    super();
    this._asking = false;
    this._done = false;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._timer);
  }

  private _run(): void {
    const c = this.config;
    if (!c || !this.hass) return;
    window.clearTimeout(this._timer);
    if (c.confirm && !this._asking) {
      this._asking = true;
      this._timer = window.setTimeout(() => (this._asking = false), CONFIRM_MS);
      return;
    }
    this._asking = false;
    const target = c.entity ? { entity_id: c.entity } : {};
    if (c.action?.includes('.')) {
      const [domain, service] = c.action.split('.', 2);
      this.hass.callService(domain, service, { ...target, ...(c.data ?? {}) });
    } else if (c.entity) {
      const domain = domainOf(c.entity);
      const service =
        domain === 'button' || domain === 'input_button'
          ? 'press'
          : domain === 'automation'
            ? 'trigger'
            : domain === 'scene' || domain === 'script'
              ? 'turn_on'
              : undefined;
      if (service) this.hass.callService(domain, service, target);
      else this.hass.callService('homeassistant', 'toggle', target);
    } else {
      return;
    }
    this._done = true;
    this._timer = window.setTimeout(() => (this._done = false), DONE_MS);
  }

  /** When it last ran, for the kinds Home Assistant tells. */
  private _last(s: HassEntity | undefined): string | undefined {
    if (!s) return undefined;
    const domain = domainOf(s.entity_id);
    if (domain === 'script' && s.state === 'on') return 'Running';
    const at =
      domain === 'script' || domain === 'automation'
        ? s.attributes.last_triggered
        : domain === 'scene' || domain === 'button' || domain === 'input_button'
          ? s.state
          : undefined;
    const ago = changedAgo(this.hass, at);
    return ago ? `Ran ${ago}` : undefined;
  }

  protected render() {
    const c = this.config;
    if (!c || (!c.entity && !c.action)) return missing('Nothing to run');
    const s = c.entity ? this.hass?.states[c.entity] : undefined;
    const name =
      c.name ??
      (c.entity ? resolve(this.hass, c.entity).name : c.action!.split('.').pop()!.replace(/_/g, ' ').replace(/^./, (l) => l.toUpperCase()));
    const sub = this._asking
      ? 'Tap again to run'
      : this._done
        ? 'Done'
        : (this._last(s) ?? (domainOf(c.entity ?? c.action ?? '') === 'scene' ? 'Scene' : 'Tap to run'));
    const glyph = this._done
      ? icon('check', 34)
      : c.icon || s
        ? stateIcon(this.hass, s, c.icon, name)
        : icon('tap', 34);

    return html`
      <div class="tile glass ${this._asking || this._done ? 'active' : ''}" role="button" tabindex="0"
        aria-label="${name}${c.confirm ? ', asks before running' : ''}"
        @click=${this._run} @keydown=${onKey(() => this._run())}>
        <span class="icon well">${glyph}</span>
        <div class="words">
          <div class="name">${name}</div>
          <div class="sub muted" aria-live="polite">${sub}</div>
        </div>
      </div>
    `;
  }

  static styles = [
    widgetStyles,
    css`
      .tile:active {
        transform: scale(0.97);
      }

      .well {
        color: var(--lf-accent);
        background: color-mix(in srgb, var(--lf-accent) 16%, transparent);
        --state-icon-color: var(--lf-accent);
      }

      .active .well {
        color: var(--lf-text-active);
        background: color-mix(in srgb, var(--lf-accent) 30%, transparent);
      }
    `,
  ];
}

// ---- Sensor ------------------------------------------------------------------------

const SENSOR_REFRESH_MS = 5 * 60_000;

/** A sensor's value, large, over a graph of the last day. A tap opens the graph in full. */
export class LuxFrameSensorTile extends SizedTile {
  static properties = { ...SizedTile.properties, _points: { state: true } };

  declare config?: SensorTileConfig;
  declare _points?: Point[];

  private _loaded = '';

  protected willUpdate(changed: PropertyValues): void {
    if (!changed.has('hass') && !changed.has('config')) return;
    const s = this.config ? this.hass?.states[this.config.entity] : undefined;
    if (!s || !isNumeric(s)) return;
    const hours = this.config?.hours ?? 24;
    const key = `${s.entity_id}|${hours}|${Math.floor(Date.now() / SENSOR_REFRESH_MS)}`;
    if (key === this._loaded) {
      // Keep the line's end on the value shown.
      const now = Number(s.state);
      const last = this._points?.[this._points.length - 1];
      if (last && Number.isFinite(now) && last.v !== now) this._points = [...this._points!.slice(0, -1), { t: Date.now(), v: now }];
      return;
    }
    this._loaded = key;
    void fetchSeries(this.hass, s, hours).then((points) => (this._points = points));
  }

  protected render() {
    const s = this.config ? this.hass?.states[this.config.entity] : undefined;
    if (!s) return missing('No sensor');
    const { name } = resolve(this.hass, { entity: s.entity_id, name: this.config?.name });
    const numeric = isNumeric(s) && s.state !== 'unavailable' && s.state !== 'unknown';
    const unit = s.attributes.unit_of_measurement ?? '';

    return html`
      <div class="tile glass" role="button" tabindex="0" aria-label="${name}, ${stateLabel(this.hass, s)}"
        style="--chart-color: ${measureColor(s)}"
        @click=${() => openDetail(this, s.entity_id)} @keydown=${onKey(() => openDetail(this, s.entity_id))}>
        ${numeric && this.size !== 's' ? html`<luxframe-chart class="spark" .points=${this._points}></luxframe-chart>` : nothing}
        ${numeric && this.size === 's' ? html`<luxframe-chart class="spark low" .points=${this._points}></luxframe-chart>` : nothing}
        <div class="words">
          <div class="value">
            ${numeric
              ? html`${formatNumber(this.hass, Number(s.state), s.state)}<span class="unit">${unit}</span>`
              : stateLabel(this.hass, s)}
          </div>
          <div class="name">${name}</div>
        </div>
      </div>
    `;
  }

  static styles = [
    widgetStyles,
    css`
      .tile {
        justify-content: flex-start;
        padding-top: 18px;
      }

      .spark {
        position: absolute;
        inset: auto 0 0 0;
        height: 52%;
        pointer-events: none;
      }

      .spark.low {
        height: 38%;
        opacity: 0.8;
      }

      .value {
        font-size: 36px;
        font-weight: 300;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .unit {
        margin-left: 3px;
        font-size: 0.5em;
        color: var(--lf-muted);
      }

      :host([size='m']) .value,
      :host([size='l']) .value {
        font-size: clamp(48px, 6vw, 72px);
        font-weight: 200;
      }

      .name {
        font-size: 15px;
        font-weight: 600;
        color: var(--lf-muted);
      }

      @container style(--lf-tile-style: corner) {
        .tile {
          justify-content: flex-start;
        }
      }
    `,
  ];
}

// ---- Alarm panel --------------------------------------------------------------------

/** An alarm panel's state on a shield. A tap opens arming, disarming and the keypad. */
export class LuxFrameAlarmTile extends SizedTile {
  declare config?: AlarmTileConfig;

  protected render() {
    const s = this.config ? this.hass?.states[this.config.entity] : undefined;
    if (!s) return missing('No alarm panel');
    const { name } = resolve(this.hass, { entity: s.entity_id, name: this.config?.name });
    const look = alarmLook(s.state);
    const open = () => openDetail(this, s.entity_id);
    return html`
      <div class="tile glass ${s.state === 'triggered' ? 'alarm' : ''}" role="button" tabindex="0"
        aria-label="${name}, ${stateLabel(this.hass, s)}" @click=${open} @keydown=${onKey(open)}>
        <span class="icon ${look.busy ? 'busy' : ''}" style="--icon-color: ${look.color}">${icon(look.icon, this.size === 's' || this.size === 'w' ? 34 : 48)}</span>
        <div class="words">
          <div class="name">${name}</div>
          <div class="sub muted">${stateLabel(this.hass, s)}</div>
        </div>
      </div>
    `;
  }

  static styles = [
    widgetStyles,
    css`
      .tile.alarm {
        background: color-mix(in srgb, var(--lf-danger) 35%, var(--lf-surface));
      }

      .busy svg {
        animation: pulse 1.4s ease-in-out infinite;
      }

      @keyframes pulse {
        50% {
          opacity: 0.4;
        }
      }

      @container style(--lf-tile-style: corner) {
        .icon {
          background: color-mix(in srgb, var(--icon-color) 18%, transparent);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .busy svg {
          animation: none;
        }
      }
    `,
  ];
}

// ---- Timer ---------------------------------------------------------------------------

/** A timer counting down in a ring, with start and pause beside it. */
export class LuxFrameTimerTile extends SizedTile {
  declare config?: TimerTileConfig;

  private _tick?: number;

  connectedCallback(): void {
    super.connectedCallback();
    this._tick = window.setInterval(() => {
      const s = this.config ? this.hass?.states[this.config.entity] : undefined;
      if (s?.state === 'active') this.requestUpdate();
    }, 1000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._tick);
  }

  private _toggle(s: HassEntity, e: Event): void {
    e.stopPropagation();
    this.hass?.callService('timer', s.state === 'active' ? 'pause' : 'start', { entity_id: s.entity_id });
  }

  protected render() {
    const s = this.config ? this.hass?.states[this.config.entity] : undefined;
    if (!s) return missing('No timer');
    const { name } = resolve(this.hass, { entity: s.entity_id, name: this.config?.name });
    const { left, total } = timerLeft(s);
    const active = s.state === 'active';
    const open = () => openDetail(this, s.entity_id);
    const status = active ? 'Running' : s.state === 'paused' ? 'Paused' : 'Ready';
    return html`
      <div class="tile glass" role="button" tabindex="0" aria-label="${name}, ${formatDuration(left)} left, ${status}"
        @click=${open} @keydown=${onKey(open)}>
        <div class="dial">
          ${timerRing(total ? left / total : 0, active)}
          <span class="left">${formatDuration(left)}</span>
        </div>
        <div class="words">
          <div class="name">${name}</div>
          <div class="sub muted">${status}</div>
        </div>
        <button class="round small go ${active ? 'on' : ''}" aria-label="${active ? 'Pause' : 'Start'} ${name}"
          ?disabled=${s.state === 'unavailable'} @click=${(e: Event) => this._toggle(s, e)}>
          ${icon(active ? 'pause' : 'play', 20)}
        </button>
      </div>
    `;
  }

  static styles = [
    widgetStyles,
    ringStyles,
    css`
      .tile {
        gap: 8px;
      }

      .dial {
        position: relative;
        flex: 1;
        min-height: 0;
        aspect-ratio: 1;
        max-height: 110px;
      }

      :host([size='m']) .dial,
      :host([size='l']) .dial {
        max-height: 220px;
      }

      .left {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        font-size: 22px;
        font-weight: 300;
        font-variant-numeric: tabular-nums;
      }

      :host([size='m']) .left,
      :host([size='l']) .left {
        font-size: 44px;
        font-weight: 200;
      }

      :host([size='w']) .tile {
        flex-direction: row;
        gap: 16px;
        padding-right: 64px;
      }

      :host([size='w']) .dial {
        flex: none;
        height: 100%;
      }

      :host([size='s']) .words .sub {
        display: none;
      }

      .go {
        position: absolute;
        top: 10px;
        right: 10px;
      }

      :host([size='w']) .go {
        top: 50%;
        right: 14px;
        margin-top: -22px;
      }
    `,
  ];
}

// ---- People ---------------------------------------------------------------------------

/** Who's home: each person's picture, ringed when they're home, and where they are. */
export class LuxFramePeopleTile extends SizedTile {
  declare config?: PeopleTileConfig;

  private get _people(): HassEntity[] {
    const states = this.hass?.states ?? {};
    const ids = this.config?.entities?.length
      ? this.config.entities
      : Object.keys(states).filter((id) => domainOf(id) === 'person').sort();
    return ids.map((id) => states[id]).filter((s): s is HassEntity => !!s);
  }

  protected render() {
    const people = this._people;
    if (!people.length) return missing('No people');
    const home = people.filter((p) => p.state === 'home');
    if (this.size === 's') {
      return html`
        <div class="tile glass" role="button" tabindex="0" aria-label="${home.length} of ${people.length} home"
          @click=${() => openDetail(this, (home[0] ?? people[0]).entity_id)}>
          <div class="stack">${people.slice(0, 3).map((p) => avatar(p, 44))}</div>
          <div class="words">
            <div class="name">${home.length ? `${home.length} home` : 'Nobody home'}</div>
            <div class="sub muted">${people.length - home.length ? `${people.length - home.length} away` : 'Everyone'}</div>
          </div>
        </div>
      `;
    }
    const size = this.size === 'w' ? 52 : 72;
    return html`
      <div class="tile glass people">
        ${people.map(
          (p) => html`<button class="person" @click=${() => openDetail(this, p.entity_id)}>
            ${avatar(p, size)}
            <span class="first">${(p.attributes.friendly_name ?? p.entity_id).split(' ')[0]}</span>
            <span class="muted where">${whereLabel(this.hass, p)}</span>
          </button>`,
        )}
      </div>
    `;
  }

  static styles = [
    widgetStyles,
    avatarStyles,
    css`
      .stack {
        display: flex;
      }

      .stack .avatar + .avatar {
        margin-left: -12px;
      }

      .stack .avatar {
        border: 2px solid var(--lf-surface);
      }

      .people {
        flex-direction: row;
        flex-wrap: wrap;
        align-content: center;
        justify-content: space-evenly;
        gap: 10px 4px;
        cursor: default;
      }

      .person {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        min-width: 0;
        max-width: 110px;
        padding: 4px 6px;
        border-radius: var(--lf-radius-s);
        background: none;
      }

      .first {
        max-width: 100%;
        margin-top: 4px;
        font-size: 15px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .where {
        max-width: 100%;
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      @container style(--lf-tile-style: corner) {
        .people {
          align-items: center;
          justify-content: space-evenly;
        }
      }
    `,
  ];
}

// ---- Vacuum ---------------------------------------------------------------------------

/** A robot vacuum: the icon starts or pauses it; the rest opens its controls. */
export class LuxFrameVacuumTile extends SizedTile {
  declare config?: VacuumTileConfig;

  protected render() {
    const s = this.config ? this.hass?.states[this.config.entity] : undefined;
    if (!s) return missing('No vacuum');
    const { name } = resolve(this.hass, { entity: s.entity_id, name: this.config?.name });
    const battery = batteryOf(this.hass, s);
    const cleaning = isCleaning(s);
    const open = () => openDetail(this, s.entity_id);
    const sub = [stateLabel(this.hass, s), battery !== undefined ? `${Math.round(battery)}%` : undefined]
      .filter(Boolean)
      .join(' · ');
    return html`
      <div class="tile glass ${cleaning ? 'active' : ''}" role="button" tabindex="0" aria-label="${name}, ${sub}"
        @click=${open} @keydown=${onKey(open)}>
        <button class="icon ${cleaning ? 'spin' : ''}" aria-label="${s.state === 'cleaning' ? 'Pause' : 'Start'} ${name}"
          ?disabled=${s.state === 'unavailable'}
          @click=${(e: Event) => {
            e.stopPropagation();
            startOrPause(this.hass, s);
          }}>${icon('robot', this.size === 'm' || this.size === 'l' ? 48 : 34)}</button>
        <div class="words">
          <div class="name">${name}</div>
          <div class="sub muted">${sub}</div>
        </div>
      </div>
    `;
  }

  static styles = [
    widgetStyles,
    css`
      .active .icon {
        color: var(--lf-accent);
      }

      .spin svg {
        animation: spin 3s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @container style(--lf-tile-style: corner) {
        .active .icon {
          background: color-mix(in srgb, var(--lf-accent) 18%, transparent);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .spin svg {
          animation: none;
        }
      }
    `,
  ];
}

// ---- Number and choice helpers ------------------------------------------------------------

/** A number helper: its value, and on a wide tile a slider to set it. */
export class LuxFrameNumberTile extends SizedTile {
  declare config?: NumberTileConfig;

  private _value = new Pending<number>(this);

  protected render() {
    const s = this.config ? this.hass?.states[this.config.entity] : undefined;
    if (!s) return missing('No number');
    const { name } = resolve(this.hass, { entity: s.entity_id, name: this.config?.name });
    const { min, max, step, value: reported, unit } = numberRange(s);
    const value = this._value.get(reported) ?? reported;
    const shown = Number.isFinite(value) ? `${formatNumber(this.hass, value, String(step))}${unit ? ` ${unit}` : ''}` : stateLabel(this.hass, s);
    const open = () => openDetail(this, s.entity_id);
    return html`
      <div class="tile glass" role="button" tabindex="0" aria-label="${name}, ${shown}" @click=${open} @keydown=${onKey(open)}>
        <div class="words">
          <div class="value">${shown}</div>
          <div class="name">${name}</div>
        </div>
        ${this.size === 's'
          ? nothing
          : html`<luxframe-slider filled label=${name} .value=${value} .min=${min} .max=${max} .step=${step}
              .valueText=${shown} ?disabled=${s.state === 'unavailable'}
              @click=${(e: Event) => e.stopPropagation()}
              @input=${(e: CustomEvent<number>) => this._value.hold(e.detail)}
              @change=${(e: CustomEvent<number>) => {
                this._value.release(e.detail);
                setNumber(this.hass, s, e.detail);
              }}></luxframe-slider>`}
      </div>
    `;
  }

  static styles = [
    widgetStyles,
    css`
      .tile {
        align-items: stretch;
        gap: 12px;
        padding: 14px 16px;
      }

      .value {
        font-size: 32px;
        font-weight: 300;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .name {
        font-size: 15px;
        color: var(--lf-muted);
      }

      luxframe-slider {
        height: 44px;
      }
    `,
  ];
}

/** A choice helper: the chosen option, and on a wide tile every option to tap. */
export class LuxFrameSelectTile extends SizedTile {
  declare config?: SelectTileConfig;

  private _chosen = new Pending<string>(this);

  protected render() {
    const s = this.config ? this.hass?.states[this.config.entity] : undefined;
    if (!s) return missing('No choice');
    const { name } = resolve(this.hass, { entity: s.entity_id, name: this.config?.name });
    const chosen = this._chosen.get(s.state) ?? s.state;
    const options: string[] = s.attributes.options ?? [];
    const open = () => openDetail(this, s.entity_id);
    return html`
      <div class="tile glass" role="button" tabindex="0" aria-label="${name}, ${optionLabel(this.hass, s, chosen)}"
        @click=${open} @keydown=${onKey(open)}>
        <div class="words">
          <div class="value">${optionLabel(this.hass, s, chosen)}</div>
          <div class="name">${name}</div>
        </div>
        ${this.size === 's'
          ? nothing
          : html`<div class="options" role="radiogroup" aria-label=${name}>
              ${options.map(
                (o) => html`<button class="chip ${o === chosen ? 'on' : ''}" role="radio" aria-checked=${o === chosen}
                  ?disabled=${s.state === 'unavailable'}
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this._chosen.release(o);
                    selectOption(this.hass, s, o);
                  }}>${optionLabel(this.hass, s, o)}</button>`,
              )}
            </div>`}
      </div>
    `;
  }

  static styles = [
    widgetStyles,
    css`
      .tile {
        align-items: stretch;
        justify-content: space-between;
        gap: 10px;
        padding: 14px 16px;
      }

      .value {
        font-size: 24px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .name {
        font-size: 15px;
        color: var(--lf-muted);
      }

      .options {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
        max-height: 100px;
        overflow: hidden;
      }

      :host([size='w']) .options {
        flex-wrap: nowrap;
        justify-content: safe center;
        overflow-x: auto;
        scrollbar-width: none;
      }

      @container style(--lf-tile-style: corner) {
        .options,
        :host([size='w']) .options {
          justify-content: flex-start;
        }
      }

      .chip {
        flex: none;
        min-height: 40px;
        padding: 0 14px;
        font-size: 15px;
      }
    `,
  ];
}

// ---- Energy now ------------------------------------------------------------------------------

/** Power flowing now: the home's use; on a larger tile, the flow between solar, grid, battery and home. */
export class LuxFrameEnergyTile extends SizedTile {
  declare config?: EnergyTileConfig;

  protected render() {
    const sensors = energySensors(this.hass, this.config);
    if (!Object.keys(sensors).length) return missing('No power sensors');
    const flow = readFlow(this.hass, sensors);
    const open = () => openView(this, { title: 'Energy now', tile: this.config ?? { type: 'energy' } });
    const roomy = this.size === 'm' || this.size === 'l';
    const parts = (['solar', 'grid', 'battery'] as const)
      .filter((k) => sensors[k])
      .map((k) => `${k === 'grid' && (flow.grid ?? 0) < 0 ? 'Export' : k.charAt(0).toUpperCase() + k.slice(1)} ${formatPower(flow[k])}`);

    return html`
      <div class="tile glass ${roomy ? 'roomy' : ''}" role="button" tabindex="0" aria-label="Energy now: home ${formatPower(flow.home)}"
        @click=${open} @keydown=${onKey(open)}>
        ${roomy
          ? flowDiagram(flow, sensors, false)
          : html`<span class="icon" style="--icon-color: var(--lf-color-light)">${icon('bolt', 30)}</span>
              <div class="words">
                <div class="value">${formatPower(flow.home)}</div>
                <div class="sub muted">${this.size === 'w' ? parts.join(' · ') || 'Home' : 'Home now'}</div>
              </div>`}
      </div>
    `;
  }

  static styles = [
    widgetStyles,
    flowStyles,
    css`
      .tile.roomy {
        padding: 30px 48px;
      }

      .value {
        font-size: 28px;
        font-weight: 300;
        font-variant-numeric: tabular-nums;
      }

      :host([size='w']) .tile {
        flex-direction: row;
        gap: 18px;
      }
    `,
  ];
}

define('luxframe-button-tile', LuxFrameButtonTile);
define('luxframe-sensor-tile', LuxFrameSensorTile);
define('luxframe-alarm-tile', LuxFrameAlarmTile);
define('luxframe-timer-tile', LuxFrameTimerTile);
define('luxframe-people-tile', LuxFramePeopleTile);
define('luxframe-vacuum-tile', LuxFrameVacuumTile);
define('luxframe-number-tile', LuxFrameNumberTile);
define('luxframe-select-tile', LuxFrameSelectTile);
define('luxframe-energy-tile', LuxFrameEnergyTile);
