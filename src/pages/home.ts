import { LitElement, css, html, nothing } from 'lit';
import { type BadgeItem } from '../badges';
import { define } from '../define';
import { pickable } from '../editor/layout';
import { domainOf, resolve } from '../entity';
import { icon, type IconName } from '../icons';
import { controls, pageStyles, sectionLabel } from '../theme';
import '../tiles/home';
import type { HassEntity, HomePageConfig, HomeAssistant } from '../types';

/** Sensors that say something is open. */
const OPENINGS = new Set(['door', 'window', 'garage_door', 'opening']);

/** A group of things summed up in one chip, which opens the list of them. */
interface Summary {
  id: string;
  label: string;
  icon: IconName;
  /** "3 on", "All off": what the chip says under its name. */
  status: string;
  /** Lit when something in it is on, open or playing. */
  active: boolean;
  /** What the chip opens: the ones that count first, then the rest. */
  entities: HassEntity[];
}

/**
 * The whole home at a glance, as Apple's Home app opens: a row of chips that
 * sum up the lights, the climate, security and what's playing, each opening
 * the things it counts; then every room; then scenes. It builds itself from
 * Home Assistant's areas and devices, so it needs no setting up.
 */
export class LuxFrameHomePage extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    badges: { attribute: false },
    editing: { type: Boolean, reflect: true },
    _open: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: HomePageConfig;
  /** The title bar's badges, worked out by the frame. */
  declare badges?: BadgeItem[];
  declare editing?: boolean;
  /** The chip whose list is showing. */
  declare _open?: string;

  private _summaries(): Summary[] {
    const all = pickable(this.hass).filter((s) => s.state !== 'unavailable');
    const of = (...domains: string[]) => all.filter((s) => domains.includes(domainOf(s.entity_id)));
    const first = (list: HassEntity[], hit: (s: HassEntity) => boolean) => [...list.filter(hit), ...list.filter((s) => !hit(s))];
    const out: Summary[] = [];

    const lights = of('light');
    if (lights.length) {
      const on = lights.filter((s) => s.state === 'on');
      out.push({
        id: 'lights',
        label: 'Lights',
        icon: 'bulb',
        status: on.length ? `${on.length} on` : 'All off',
        active: on.length > 0,
        entities: first(lights, (s) => s.state === 'on'),
      });
    }

    const climate = of('climate');
    if (climate.length) {
      const temps = climate.map((s) => Number(s.attributes.current_temperature)).filter((n) => Number.isFinite(n));
      const average = temps.length ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : undefined;
      const running = climate.filter((s) => s.state !== 'off');
      out.push({
        id: 'climate',
        label: 'Climate',
        icon: 'flame',
        status: average !== undefined ? `${average}°` : running.length ? `${running.length} on` : 'Off',
        active: running.length > 0,
        entities: climate,
      });
    }

    const locks = of('lock');
    const openings = all.filter(
      (s) => domainOf(s.entity_id) === 'binary_sensor' && OPENINGS.has(String(s.attributes.device_class)),
    );
    const garages = of('cover').filter((s) => ['garage', 'door', 'gate'].includes(String(s.attributes.device_class)));
    const alarms = of('alarm_control_panel');
    const secure = [...alarms, ...locks, ...garages, ...openings];
    if (secure.length) {
      const unlocked = locks.filter((s) => s.state !== 'locked');
      const open = [...openings.filter((s) => s.state === 'on'), ...garages.filter((s) => s.state !== 'closed')];
      const triggered = alarms.some((s) => s.state === 'triggered');
      const status = triggered
        ? 'Alarm going off'
        : [unlocked.length ? `${unlocked.length} unlocked` : '', open.length ? `${open.length} open` : '']
            .filter(Boolean)
            .join(' · ') || 'All secure';
      const amiss = new Set([...unlocked, ...open].map((s) => s.entity_id));
      out.push({
        id: 'security',
        label: 'Security',
        icon: triggered ? 'shield-alert' : amiss.size ? 'shield' : 'shield-check',
        status,
        active: triggered || amiss.size > 0,
        entities: first(secure, (s) => amiss.has(s.entity_id)),
      });
    }

    const players = of('media_player');
    if (players.length) {
      const playing = players.filter((s) => s.state === 'playing');
      out.push({
        id: 'media',
        label: 'Speakers',
        icon: 'speaker',
        status: playing.length ? `${playing.length} playing` : 'Nothing playing',
        active: playing.length > 0,
        entities: first(players, (s) => s.state === 'playing'),
      });
    }
    return out;
  }

  private _areas() {
    const chosen = this.config?.areas;
    const areas = Object.values(this.hass?.areas ?? {});
    if (chosen?.length) return chosen.map((id) => areas.find((a) => a.area_id === id || a.name === id)).filter((a) => !!a);
    return areas.sort((a, b) => a.name.localeCompare(b.name));
  }

  private _scenes(): HassEntity[] {
    const chosen = this.config?.scenes;
    if (chosen?.length) return chosen.map((id) => this.hass?.states[id]).filter((s): s is HassEntity => !!s);
    return pickable(this.hass)
      .filter((s) => domainOf(s.entity_id) === 'scene')
      .sort((a, b) => resolve(this.hass, a.entity_id).name.localeCompare(resolve(this.hass, b.entity_id).name))
      .slice(0, 8);
  }

  protected render() {
    if (!this.config) return nothing;
    const summaries = this._summaries();
    const open = summaries.find((s) => s.id === this._open);
    const areas = this._areas();
    const scenes = this.config.scenes?.length === 0 ? [] : this._scenes();
    const title = (this.config.title ?? 'Home').trim();
    return html`
      <div class="head">
        ${title ? html`<h1>${title}</h1>` : nothing}
        ${this.editing || this.badges?.length ? html`<luxframe-badges .hass=${this.hass} .items=${this.badges ?? []} ?editing=${this.editing}></luxframe-badges>` : nothing}
      </div>
      ${summaries.length
        ? html`<div class="summaries" role="group" aria-label="Summary">
            ${summaries.map(
              (s) => html`<button
                class="summary glass ${s.active ? 'active' : ''} ${open?.id === s.id ? 'open' : ''}"
                aria-expanded=${open?.id === s.id}
                @click=${() => (this._open = open?.id === s.id ? undefined : s.id)}
              >
                <span class="summary-icon">${icon(s.icon, 26)}</span>
                <span class="summary-text">
                  <span class="summary-name">${s.label}</span>
                  <span class="summary-status">${s.status}</span>
                </span>
              </button>`,
            )}
          </div>`
        : nothing}
      ${open
        ? html`<h3>${open.label}</h3>
            <div class="grid">
              ${open.entities.map(
                (s) => html`<luxframe-tile .hass=${this.hass} .entity=${s.entity_id}></luxframe-tile>`,
              )}
            </div>`
        : nothing}
      ${areas.length
        ? html`<h3>Rooms</h3>
            <div class="grid rooms">
              ${areas.map(
                (a) => html`<luxframe-room-tile .hass=${this.hass} .config=${{ type: 'room', area: a!.area_id }}></luxframe-room-tile>`,
              )}
            </div>`
        : nothing}
      ${scenes.length
        ? html`<h3>Scenes</h3>
            <div class="row">
              ${scenes.map(
                (s) => html`<button class="chip glass"
                  @click=${() => this.hass?.callService('scene', 'turn_on', { entity_id: s.entity_id })}>
                  ${resolve(this.hass, s.entity_id).name}
                </button>`,
              )}
            </div>`
        : nothing}
      ${!summaries.length && !areas.length
        ? html`<p class="muted">Nothing to show yet. Add devices and areas in Home Assistant and they appear here.</p>`
        : nothing}
    `;
  }

  static styles = [
    pageStyles,
    controls,
    sectionLabel,
    css`
      :host {
        padding-bottom: max(var(--lf-pad), 48px);
      }

      h3 {
        margin: 26px 0 12px;
      }

      .summaries {
        display: flex;
        flex-wrap: wrap;
        gap: var(--lf-gap);
      }

      /* A group summed up: its icon, its name, and how things stand. */
      .summary {
        flex: 1 1 200px;
        max-width: 320px;
        display: flex;
        align-items: center;
        gap: 14px;
        min-height: 72px;
        padding: 12px 18px;
        border-radius: var(--lf-radius);
        text-align: left;
        transition:
          transform var(--lf-fast),
          background-color var(--lf-move),
          color var(--lf-move);
      }

      .summary:active {
        transform: scale(0.98);
      }

      .summary.active .summary-icon {
        color: var(--lf-accent);
      }

      .summary.open {
        color: var(--lf-text-active);
        background: var(--lf-surface-active);
      }

      .summary-icon {
        flex: none;
        display: grid;
        place-items: center;
        color: var(--lf-muted);
      }

      .summary.open .summary-icon {
        color: inherit;
      }

      .summary-text {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .summary-name {
        font-size: 17px;
        font-weight: 600;
      }

      .summary-status {
        font-size: 15px;
        color: var(--lf-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .summary.open .summary-status {
        color: var(--lf-muted-active);
      }

      .grid {
        grid-auto-rows: 132px;
      }

      .grid.rooms {
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      }

      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      p {
        font-size: 17px;
      }
    `,
  ];
}

define('luxframe-home-page', LuxFrameHomePage);
