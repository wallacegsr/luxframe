import { LitElement, css, html, nothing, svg } from 'lit';
import { define } from '../define';
import { icon, type IconName } from '../icons';
import { formatClock } from '../time';
import type { HassEntity, HomeAssistant } from '../types';
import { detailStyles } from './styles';

const DAY = 86_400_000;

/** One of the sun's next times; only its time of day is shown, which barely moves day to day. */
function today(next: unknown): Date | undefined {
  if (typeof next !== 'string') return undefined;
  const at = new Date(next);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

/**
 * The sun today: an arc across the sky with the sun on it, the day's light
 * from dawn to dusk, how long the day is, and how high the sun stands.
 */
export class LuxFrameSunDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const a = s.attributes;
    const up = s.state === 'above_horizon';
    const next = today(a.next_rising);
    // While the sun is up, it rose about a day before it next rises.
    const rise = next && up ? new Date(next.getTime() - DAY) : next;
    const set = today(a.next_setting);
    const now = Date.now();
    const progress = rise && set && up ? Math.min(1, Math.max(0, (now - rise.getTime()) / (set.getTime() - rise.getTime()))) : undefined;
    const length = rise && set ? Math.abs(set.getTime() - rise.getTime()) / 60_000 : undefined;

    const all: Array<{ label: string; at?: Date; icon: IconName }> = [
      { label: 'Dawn', at: today(a.next_dawn), icon: 'sunrise' },
      { label: 'Sunrise', at: next, icon: 'sunrise' },
      { label: 'Solar noon', at: today(a.next_noon), icon: 'sun' },
      { label: 'Sunset', at: set, icon: 'sunset' },
      { label: 'Dusk', at: today(a.next_dusk), icon: 'moon' },
    ];
    const times = all.filter((t) => t.at);

    const angle = Math.PI * (1 - (progress ?? 0));
    return html`
      <div class="status" aria-live="polite">
        ${up ? 'Above the horizon' : 'Below the horizon'}
        ${typeof a.elevation === 'number' ? html`<span class="muted">· ${Math.round(a.elevation)}° high</span>` : nothing}
      </div>
      <svg class="arc" viewBox="0 0 200 104" aria-hidden="true">
        ${svg`<path class="sky" d="M10 96 A90 90 0 0 1 190 96" />
        <line x1="0" y1="96" x2="200" y2="96" />
        ${progress !== undefined
          ? svg`<path class="done" d="M10 96 A90 90 0 0 1 ${100 + 90 * Math.cos(angle)} ${96 - 90 * Math.sin(angle)}" />
            <circle cx=${100 + 90 * Math.cos(angle)} cy=${96 - 90 * Math.sin(angle)} r="8" />`
          : nothing}`}
      </svg>
      <ol class="times glass">
        ${times.map(
          (t) => html`<li>${icon(t.icon, 22)}<span>${t.label}</span><strong>${formatClock(this.hass, t.at!)}</strong></li>`,
        )}
        ${length
          ? html`<li>${icon('clock', 22)}<span>Daylight</span><strong>${Math.floor(length / 60)} h${Math.round(length % 60) ? ` ${Math.round(length % 60)} min` : ''}</strong></li>`
          : nothing}
        ${typeof a.azimuth === 'number'
          ? html`<li>${icon('target', 22)}<span>Direction</span><strong>${Math.round(a.azimuth)}°</strong></li>`
          : nothing}
      </ol>
    `;
  }

  static styles = [
    detailStyles,
    css`
      :host {
        justify-content: flex-start;
      }

      .arc {
        width: min(560px, 90%, 64vh);
        overflow: visible;
      }

      .sky {
        fill: none;
        stroke: var(--lf-faint);
        stroke-width: 2;
        stroke-dasharray: 4 4;
      }

      .done {
        fill: none;
        stroke: var(--lf-accent);
        stroke-width: 3;
        stroke-linecap: round;
      }

      .arc line {
        stroke: var(--lf-faint);
        stroke-width: 1;
      }

      .arc circle {
        fill: var(--lf-accent);
        filter: drop-shadow(0 0 8px var(--lf-accent));
      }

      .times {
        box-sizing: border-box;
        width: min(480px, 100%);
        margin: 0;
        padding: 6px 20px;
        list-style: none;
        border-radius: var(--lf-radius);
      }

      .times li {
        display: grid;
        grid-template-columns: 28px 1fr auto;
        align-items: center;
        gap: 12px;
        min-height: 50px;
        font-size: 17px;
      }

      .times li + li {
        border-top: 1px solid var(--lf-control-row);
      }

      .times svg {
        color: var(--lf-muted);
      }

      strong {
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
    `,
  ];
}

define('luxframe-sun-detail', LuxFrameSunDetail);
