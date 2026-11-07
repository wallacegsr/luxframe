import { LitElement, css, html, nothing } from 'lit';
import {
  Poller,
  addDays,
  calendarColor,
  dayLabel,
  entitiesOr,
  fetchEvents,
  sameDay,
  startOfDay,
  type CalendarEvent,
} from '../data';
import { define } from '../define';
import { icon } from '../icons';
import { glass, tileBase } from '../theme';
import { formatClock } from '../time';
import type { CalendarTileConfig, HomeAssistant, TileSize } from '../types';
import { goTo } from './goto';

const REFRESH_MS = 5 * 60_000;
const SHOWN: Record<TileSize, number> = { s: 1, w: 2, m: 4, l: 5 };

/**
 * Coming events from one or more calendars, or this month with the days that
 * have something marked. A tap goes to the calendar page, if there is one.
 */
export class LuxFrameCalendarTile extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    size: { reflect: true },
    _events: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: CalendarTileConfig;
  declare size: TileSize;
  declare _events?: CalendarEvent[];

  private _poll = new Poller(this, () => this._load(), REFRESH_MS);
  private _loadedFor = '';

  constructor() {
    super();
    this.size = 's';
  }

  private get _calendars(): string[] {
    return entitiesOr(this.hass, 'calendar', this.config?.entities);
  }

  private get _month(): boolean {
    return this.config?.view === 'month' && (this.size === 'm' || this.size === 'l');
  }

  protected willUpdate(): void {
    // The first hass arrives after connecting; load as soon as it does.
    const key = `${this._calendars.join()}|${this._month}`;
    if (this.hass && key !== this._loadedFor) {
      this._loadedFor = key;
      this._poll.refresh();
    }
  }

  private async _load(): Promise<void> {
    if (!this.hass) return;
    const now = new Date();
    const [start, end] = this._month
      ? [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)]
      : [now, addDays(now, 14)];
    const events = await fetchEvents(this.hass, this._calendars, start, end);
    // Upcoming leaves out what has already ended today.
    this._events = this._month ? events : events.filter((e) => e.end > now);
  }

  private _when(e: CalendarEvent): string {
    const day = dayLabel(this.hass, e.start);
    return e.allDay ? day : `${day} · ${formatClock(this.hass, e.start)}`;
  }

  private _renderUpcoming() {
    const calendars = this._calendars;
    const events = (this._events ?? []).slice(0, SHOWN[this.size] ?? 1);
    if (!events.length) {
      return html`<div class="quiet">
        ${icon('calendar', 30)}
        <div class="muted">${this._events ? 'Nothing coming up' : ''}</div>
      </div>`;
    }
    return html`
      ${this.size === 'm' || this.size === 'l' ? html`<div class="head muted">Up next</div>` : nothing}
      <ul>
        ${events.map(
          (e) => html`<li>
            <span class="dot" style="background: ${calendarColor(calendars, e.calendar)}"></span>
            <span class="text">
              <span class="summary">${e.summary}</span>
              <span class="muted when">${this._when(e)}</span>
            </span>
          </li>`,
        )}
      </ul>
    `;
  }

  private _renderMonth() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    // Weeks start on Monday, unless the locale says otherwise.
    const weekStart = (new Intl.Locale(this.hass?.locale?.language ?? navigator.language) as any).weekInfo?.firstDay ?? 1;
    const offset = (first.getDay() - (weekStart % 7) + 7) % 7;
    const busy = new Set(
      (this._events ?? []).flatMap((e) => {
        const marks: number[] = [];
        for (let d = startOfDay(e.start); d < e.end || sameDay(d, e.start); d = addDays(d, 1)) {
          if (d.getMonth() === now.getMonth()) marks.push(d.getDate());
          if (marks.length > 31) break;
        }
        return marks;
      }),
    );
    const names = Array.from({ length: 7 }, (_, i) =>
      new Date(2024, 0, 1 + ((weekStart - 1 + i + 7) % 7)).toLocaleDateString(this.hass?.locale?.language, {
        weekday: 'narrow',
      }),
    );
    return html`
      <div class="head">${now.toLocaleDateString(this.hass?.locale?.language, { month: 'long', year: 'numeric' })}</div>
      <div class="month" role="grid">
        ${names.map((n) => html`<span class="muted wd">${n}</span>`)}
        ${Array.from({ length: offset }, () => html`<span></span>`)}
        ${Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          return html`<span class="day ${day === now.getDate() ? 'today' : ''} ${busy.has(day) ? 'busy' : ''}">
            ${day}
          </span>`;
        })}
      </div>
    `;
  }

  protected render() {
    if (!this._calendars.length) return html`<div class="tile glass quiet muted">No calendar</div>`;
    return html`
      <div class="tile glass ${this._month ? 'is-month' : ''}" role="button" tabindex="0"
        @click=${() => goTo(this, { type: 'calendar' })}>
        ${this._month ? this._renderMonth() : this._renderUpcoming()}
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
        justify-content: center;
        gap: 8px;
        padding: 16px 18px;
        cursor: pointer;
        outline: none;
      }

      .tile:focus-visible {
        box-shadow: 0 0 0 3px var(--lf-accent);
      }

      .quiet {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 100%;
        text-align: center;
      }

      .head {
        font-size: 15px;
        font-weight: 600;
      }

      ul {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin: 0;
        padding: 0;
        list-style: none;
        min-width: 0;
      }

      li {
        display: flex;
        gap: 10px;
        min-width: 0;
      }

      .dot {
        flex: none;
        width: 4px;
        border-radius: 2px;
      }

      .text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .summary {
        font-size: 17px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .when {
        font-size: 14px;
      }

      :host([size='w']) ul {
        flex-direction: row;
        gap: 18px;
      }

      :host([size='w']) li {
        flex: 1;
      }

      .is-month {
        justify-content: flex-start;
      }

      .month {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        align-content: space-evenly;
        gap: 2px;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }

      .wd {
        font-size: 12px;
        font-weight: 600;
      }

      .day {
        position: relative;
        display: grid;
        place-items: center;
        aspect-ratio: 1;
        max-height: 34px;
        margin: auto;
        width: 100%;
        max-width: 34px;
        border-radius: 50%;
        font-size: 14px;
      }

      .day.today {
        color: var(--lf-text-active);
        background: var(--lf-surface-active);
        font-weight: 700;
      }

      .day.busy::after {
        content: '';
        position: absolute;
        bottom: 2px;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--lf-accent);
      }
    `,
  ];
}

define('luxframe-calendar-tile', LuxFrameCalendarTile);
