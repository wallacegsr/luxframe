import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import '../chart';
import { entitiesInArea, findArea } from '../data';
import { define } from '../define';
import { domainOf, openDetail } from '../entity';
import { flowDiagram, flowStyles, flowWord, formatPower, readFlow, SOURCES, energySensors } from '../energy';
import { fetchSeries, type Point } from '../history';
import { icon } from '../icons';
import { controls, glass } from '../theme';
import type { CalendarTileConfig, EnergyTileConfig, GridTileConfig, HomeAssistant, RoomTileConfig } from '../types';

/** A widget's fuller view, for widgets that aren't one entity. */
export function renderWidgetView(hass: HomeAssistant | undefined, tile: GridTileConfig) {
  switch (tile.type) {
    case 'energy':
      return html`<luxframe-energy-view .hass=${hass} .config=${tile}></luxframe-energy-view>`;
    case 'room':
      return html`<luxframe-room-view .hass=${hass} .config=${tile}></luxframe-room-view>`;
    case 'calendar':
      return html`<luxframe-calendar-page embedded .hass=${hass}
        .config=${{ type: 'calendar', entities: (tile as CalendarTileConfig).entities, days: 14 }}></luxframe-calendar-page>`;
    default:
      return html`<div class="missing">Nothing more to show.</div>`;
  }
}

const viewBase = [
  controls,
  glass,
  css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 20px;
      width: 100%;
      height: 100%;
      min-height: 0;
      overflow-y: auto;
      color: var(--lf-text);
      font-family: var(--lf-font);
    }

    .panel {
      box-sizing: border-box;
      border-radius: var(--lf-radius);
    }
  `,
];

/**
 * The energy flow in full: the diagram large with what each part is doing,
 * and the last day of each sensor, readable at any moment by touch.
 */
export class LuxFrameEnergyView extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    _series: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: EnergyTileConfig;
  declare _series: Partial<Record<string, Point[]>>;

  private _loaded = '';

  constructor() {
    super();
    this._series = {};
  }

  protected willUpdate(changed: PropertyValues): void {
    if (!changed.has('hass') || !this.hass) return;
    const sensors = energySensors(this.hass, this.config);
    const key = `${Object.values(sensors).join()}|${Math.floor(Date.now() / 300_000)}`;
    if (key === this._loaded) return;
    this._loaded = key;
    for (const id of Object.values(sensors)) {
      const s = this.hass.states[id!];
      if (s) void fetchSeries(this.hass, s, 24).then((points) => (this._series = { ...this._series, [id!]: points }));
    }
  }

  protected render() {
    const sensors = energySensors(this.hass, this.config);
    if (!Object.keys(sensors).length) {
      return html`<div class="panel glass empty muted">
        No power sensors found. Name them in the tile's YAML: <code>solar</code>, <code>grid</code>, <code>battery</code>, <code>home</code>.
      </div>`;
    }
    const flow = readFlow(this.hass, sensors);
    return html`
      <div class="panel glass diagram">${flowDiagram(flow, sensors, true)}</div>
      <div class="graphs">
        ${SOURCES.filter((s) => sensors[s.key]).map((s) => {
          const id = sensors[s.key]!;
          const unit = this.hass?.states[id]?.attributes.unit_of_measurement ?? 'W';
          return html`<button class="panel glass graph" @click=${() => openDetail(this, id)}>
            <span class="head">
              <span class="name">${icon(s.icon, 20)} ${s.label}</span>
              <span class="muted">${formatPower(flow[s.key])} · ${flowWord(s.key, flow[s.key]).toLowerCase()}</span>
            </span>
            <luxframe-chart .hass=${this.hass} .points=${this._series[id]} unit=${unit} style="--chart-color: ${s.color}"></luxframe-chart>
          </button>`;
        })}
      </div>
    `;
  }

  static styles = [
    viewBase,
    flowStyles,
    css`
      .diagram {
        flex: none;
        height: min(46vh, 420px);
        padding: 40px 80px;
        --ring: 64px;
        --value-size: 20px;
      }

      .graphs {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: var(--lf-gap, 12px);
        padding-bottom: 24px;
      }

      .graph {
        display: flex;
        flex-direction: column;
        gap: 10px;
        height: 170px;
        padding: 14px 18px;
        text-align: left;
      }

      .head {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .name {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 17px;
        font-weight: 600;
      }

      .head .muted {
        font-size: 15px;
      }

      luxframe-chart {
        flex: 1;
        pointer-events: none;
      }

      .empty {
        padding: 32px;
        font-size: 17px;
        text-align: center;
      }
    `,
  ];
}

/** Domains a room's view shows as tiles, in this order. */
const ROOM_KINDS = ['light', 'switch', 'fan', 'cover', 'climate', 'lock', 'media_player', 'vacuum', 'scene', 'script', 'input_boolean'];

/**
 * A room without a page of its own: its readings along the top, all its
 * lights at once, and a tile for everything in it.
 */
export class LuxFrameRoomView extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare config?: RoomTileConfig;

  protected render() {
    const area = this.config ? findArea(this.hass, this.config.area) : undefined;
    if (!area) return html`<div class="muted">No room “${this.config?.area ?? ''}”</div>`;
    const entities = entitiesInArea(this.hass, area.area_id);
    const devices = entities
      .filter((s) => ROOM_KINDS.includes(domainOf(s.entity_id)))
      .sort((a, b) => ROOM_KINDS.indexOf(domainOf(a.entity_id)) - ROOM_KINDS.indexOf(domainOf(b.entity_id)));
    const readings = entities.filter(
      (s) => domainOf(s.entity_id) === 'sensor' && s.attributes.unit_of_measurement && Number.isFinite(Number(s.state)),
    );
    const lights = entities.filter((s) => domainOf(s.entity_id) === 'light');
    const on = lights.filter((s) => s.state === 'on');

    return html`
      ${readings.length || lights.length
        ? html`<div class="row">
            ${readings.slice(0, 6).map(
              (s) => html`<button class="chip" @click=${() => openDetail(this, s.entity_id)}>
                <span class="muted">${s.attributes.device_class === 'temperature' ? 'Temperature' : s.attributes.device_class === 'humidity' ? 'Humidity' : (s.attributes.friendly_name ?? s.entity_id)}</span>
                ${Math.round(Number(s.state) * 10) / 10} ${s.attributes.unit_of_measurement}
              </button>`,
            )}
            ${lights.length
              ? html`<button class="chip ${on.length ? 'on' : ''}"
                  @click=${() =>
                    this.hass?.callService('light', on.length ? 'turn_off' : 'turn_on', {
                      entity_id: (on.length ? on : lights).map((s) => s.entity_id),
                    })}>
                  ${icon('bulb', 20)} ${on.length ? `Turn off ${on.length === 1 ? 'the light' : `${on.length} lights`}` : 'Turn on the lights'}
                </button>`
              : nothing}
          </div>`
        : nothing}
      ${devices.length
        ? html`<div class="tiles">
            ${devices.map((s) => html`<luxframe-tile subtitle="state" .hass=${this.hass} .entity=${s.entity_id}></luxframe-tile>`)}
          </div>`
        : html`<div class="muted empty">Nothing to control in ${area.name}.</div>`}
    `;
  }

  static styles = [
    viewBase,
    css`
      .row {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 10px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-variant-numeric: tabular-nums;
      }

      .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        grid-auto-rows: minmax(140px, auto);
        gap: var(--lf-gap, 12px);
        padding-bottom: 24px;
      }

      .empty {
        padding: 32px;
        font-size: 17px;
        text-align: center;
      }
    `,
  ];
}

define('luxframe-energy-view', LuxFrameEnergyView);
define('luxframe-room-view', LuxFrameRoomView);
