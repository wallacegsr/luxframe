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
import { glass, pageStyles } from '../theme';
import { formatClock } from '../time';
import type { CalendarPageConfig, HomeAssistant } from '../types';

const REFRESH_MS = 5 * 60_000;

/** The days ahead as an agenda: each day's events, all-day ones first. */
export class LuxFrameCalendarPage extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    _events: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: CalendarPageConfig;
  declare _events?: CalendarEvent[];

  private _poll = new Poller(this, () => this._load(), REFRESH_MS);
  private _loadedFor = '';

  private get _calendars(): string[] {
    return entitiesOr(this.hass, 'calendar', this.config?.entities);
  }

  private get _days(): number {
    return Math.max(1, Math.min(31, this.config?.days ?? 7));
  }

  protected willUpdate(): void {
    const key = `${this._calendars.join()}|${this._days}`;
    if (this.hass && key !== this._loadedFor) {
      this._loadedFor = key;
      this._poll.refresh();
    }
  }

  private async _load(): Promise<void> {
    if (!this.hass) return;
    const today = startOfDay(new Date());
    this._events = await fetchEvents(this.hass, this._calendars, today, addDays(today, this._days));
  }

  private _time(e: CalendarEvent, day: Date): string {
    if (e.allDay || (e.start < day && e.end > addDays(day, 1))) return 'All day';
    const start = sameDay(e.start, day) ? formatClock(this.hass, e.start) : 'Until';
    return sameDay(e.start, day) ? `${start} – ${formatClock(this.hass, e.end)}` : `${start} ${formatClock(this.hass, e.end)}`;
  }

  protected render() {
    const calendars = this._calendars;
    const title = this.config?.title ?? 'Calendar';
    if (!calendars.length) return html`<div class="missing muted">No calendar</div>`;

    const now = new Date();
    const today = startOfDay(now);
    const days = Array.from({ length: this._days }, (_, i) => addDays(today, i))
      .map((day) => ({
        day,
        events: (this._events ?? [])
          .filter((e) => e.start < addDays(day, 1) && (e.end > day || sameDay(e.start, day)))
          .filter((e) => !sameDay(day, now) || e.end > now || e.allDay)
          .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime()),
      }))
      .filter(({ events }) => events.length);

    return html`
      <div class="head"><h1>${title}</h1></div>
      ${this._events && !days.length
        ? html`<div class="muted empty">Nothing in the next ${this._days} days</div>`
        : nothing}
      <div class="agenda">
        ${days.map(
          ({ day, events }) => html`<section class="glass">
            <h2>${dayLabel(this.hass, day)}</h2>
            <ul>
              ${events.map(
                (e) => html`<li>
                  <span class="bar" style="background: ${calendarColor(calendars, e.calendar)}"></span>
                  <span class="time muted">${this._time(e, day)}</span>
                  <span class="text">
                    <span class="summary">${e.summary}</span>
                    ${e.location ? html`<span class="muted where">${e.location}</span>` : nothing}
                  </span>
                </li>`,
              )}
            </ul>
          </section>`,
        )}
      </div>
    `;
  }

  static styles = [
    pageStyles,
    glass,
    css`
      :host {
        padding-bottom: max(var(--lf-pad), 48px);
      }

      .missing {
        display: grid;
        place-items: center;
        height: 100%;
        font-size: 22px;
      }

      .empty {
        font-size: 20px;
      }

      .agenda {
        columns: 2 340px;
        column-gap: var(--lf-gap);
      }

      section {
        break-inside: avoid;
        margin-bottom: var(--lf-gap);
        padding: 16px 20px;
        border-radius: var(--lf-radius);
      }

      h2 {
        margin: 0 0 10px;
        font-size: 18px;
        font-weight: 600;
      }

      ul {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      li {
        display: grid;
        grid-template-columns: 4px 8.5em 1fr;
        gap: 12px;
        align-items: start;
        min-width: 0;
      }

      .bar {
        align-self: stretch;
        border-radius: 2px;
      }

      .time {
        font-size: 15px;
        font-variant-numeric: tabular-nums;
        padding-top: 2px;
      }

      .text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .summary {
        font-size: 17px;
        font-weight: 600;
      }

      .where {
        font-size: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ];
}

define('luxframe-calendar-page', LuxFrameCalendarPage);
