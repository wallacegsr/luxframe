import { LitElement, css, html, nothing } from 'lit';
import { entitiesOr, firstWeather } from '../data';
import { type BadgeItem } from '../badges';
import { define } from '../define';
import '../slideshow';
import '../tiles/media';
import { pageStyles } from '../theme';
import { formatDate, formatTime, onMinute } from '../time';
import type { CamerasPageConfig, HomeAssistant, NightPageConfig, PhotosPageConfig } from '../types';

/** Every camera (or the ones listed) as live-ish stills; a tap streams one. */
export class LuxFrameCamerasPage extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    badges: { attribute: false },
    editing: { type: Boolean },
  };

  declare hass?: HomeAssistant;
  declare config?: CamerasPageConfig;
  /** The title bar's badges, worked out by the frame. */
  declare badges?: BadgeItem[];
  declare editing?: boolean;

  protected render() {
    const cameras = entitiesOr(this.hass, 'camera', this.config?.entities);
    return html`
      <div class="head"><h1>${this.config?.title ?? 'Cameras'}</h1>
        ${this.editing || this.badges?.length ? html`<luxframe-badges .hass=${this.hass} .items=${this.badges ?? []} ?editing=${this.editing}></luxframe-badges>` : nothing}
      </div>
      ${cameras.length
        ? html`<div class="cameras">
            ${cameras.map(
              (entity) => html`<luxframe-camera-tile .hass=${this.hass} .config=${{ type: 'camera', entity }} size="m">
              </luxframe-camera-tile>`,
            )}
          </div>`
        : html`<div class="muted empty">No cameras</div>`}
    `;
  }

  static styles = [
    pageStyles,
    css`
      :host {
        padding-bottom: max(var(--lf-pad), 48px);
      }

      .cameras {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
        gap: var(--lf-gap);
      }

      luxframe-camera-tile {
        aspect-ratio: 16 / 9;
      }

      .empty {
        font-size: 22px;
      }
    `,
  ];
}

/** Minute-ticking page base for the photo and night pages' clocks. */
class ClockPage extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
  };

  declare hass?: HomeAssistant;

  private _off?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    this._off = onMinute(() => this.requestUpdate());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._off?.();
  }
}

/** Photos from a media folder, edge to edge, with the time in a corner. */
export class LuxFramePhotosPage extends ClockPage {
  declare config?: PhotosPageConfig;

  protected render() {
    const now = new Date();
    return html`
      <luxframe-slideshow .hass=${this.hass} .folder=${this.config?.folder} .interval=${this.config?.interval ?? 30}>
      </luxframe-slideshow>
      ${this.config?.clock === false
        ? nothing
        : html`<div class="clock">
            <div class="time">${formatTime(this.hass, now)}</div>
            <div class="date">${formatDate(this.hass, now)}</div>
          </div>`}
    `;
  }

  static styles = css`
    :host {
      position: relative;
      display: block;
      height: 100%;
      color: #fff;
      font-family: var(--lf-font);
    }

    luxframe-slideshow {
      position: absolute;
      inset: 0;
    }

    .clock {
      position: absolute;
      left: var(--lf-pad);
      bottom: max(var(--lf-pad), 48px);
      text-shadow: 0 1px 12px rgb(0 0 0 / 55%);
      pointer-events: none;
    }

    .time {
      font-size: clamp(56px, 9vw, 110px);
      font-weight: 200;
      line-height: 1;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
    }

    .date {
      margin-top: 6px;
      font-size: clamp(18px, 2.4vw, 26px);
      font-weight: 500;
    }
  `;
}

/**
 * A calm page for the night: a dim clock on black, nudged a little every
 * minute so nothing stays lit in one place all night.
 */
export class LuxFrameNightPage extends ClockPage {
  declare config?: NightPageConfig;

  protected render() {
    const now = new Date();
    // A slow drift around the middle, the same for the whole minute.
    const m = now.getHours() * 60 + now.getMinutes();
    const dx = Math.round(Math.sin(m * 0.7) * 24);
    const dy = Math.round(Math.cos(m * 0.9) * 18);
    const weather = this.config?.weather ? firstWeather(this.hass, this.config.weather) : undefined;
    const temp = weather?.attributes.temperature;
    return html`
      <div class="clock" style="transform: translate(${dx}px, ${dy}px)">
        <div class="time">${formatTime(this.hass, now)}</div>
        <div class="date">
          ${formatDate(this.hass, now)}${typeof temp === 'number' ? html` · ${Math.round(temp)}°` : nothing}
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: grid;
      place-items: center;
      height: 100%;
      background: #000;
      color: rgb(255 170 140 / 42%);
      font-family: var(--lf-font);
    }

    .clock {
      text-align: center;
      transition: transform 2s ease;
    }

    .time {
      font-size: clamp(96px, 20vw, 220px);
      font-weight: 200;
      line-height: 1;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
    }

    .date {
      margin-top: 10px;
      font-size: clamp(18px, 2.6vw, 26px);
      color: rgb(255 170 140 / 30%);
    }
  `;
}

define('luxframe-cameras-page', LuxFrameCamerasPage);
define('luxframe-photos-page', LuxFramePhotosPage);
define('luxframe-night-page', LuxFrameNightPage);
