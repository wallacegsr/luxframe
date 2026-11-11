import { css, html } from 'lit';
import { cameraStill } from '../data';
import { define } from '../define';
import { openMoreInfo, resolve } from '../entity';
import '../now-playing';
import '../slideshow';
import { glass, tileBase } from '../theme';
import type { CameraTileConfig, NowPlayingTileConfig, PhotoTileConfig } from '../types';
import { SizedTile } from './sized';

const CAMERA_REFRESH_MS = 10_000;

/** A speaker's now playing, on glass. */
export class LuxFrameNowPlayingTile extends SizedTile {
  declare config?: NowPlayingTileConfig;

  protected render() {
    return html`<div class="tile glass">
      <luxframe-now-playing .hass=${this.hass} .entity=${this.config?.entity} .size=${this.size}>
      </luxframe-now-playing>
    </div>`;
  }

  static styles = [
    tileBase,
    glass,
    css`
      .tile {
        display: flex;
        flex-direction: column;
      }

      luxframe-now-playing {
        flex: 1;
        padding: 16px;
      }

      :host([size='s']) luxframe-now-playing {
        padding: 0;
        border-radius: inherit;
      }
    `,
  ];
}

/**
 * A camera's still, refreshed every ten seconds while on screen, with its
 * name. A tap opens Home Assistant's own dialog, which streams it live.
 */
export class LuxFrameCameraTile extends SizedTile {
  static properties = { ...SizedTile.properties, _tick: { state: true } };

  declare config?: CameraTileConfig;
  declare _tick: number;

  private _timer?: number;

  constructor() {
    super();
    this._tick = Date.now();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._timer = window.setInterval(() => {
      if (!document.hidden) this._tick = Date.now();
    }, CAMERA_REFRESH_MS);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._timer);
  }

  protected render() {
    const id = this.config?.entity;
    const s = id ? this.hass?.states[id] : undefined;
    if (!s) return html`<div class="tile glass message muted">No camera</div>`;
    const { name } = resolve(this.hass, s.entity_id);
    const still = s.state === 'unavailable' ? undefined : cameraStill(s, this._tick);
    return html`
      <div class="tile glass" role="button" tabindex="0" aria-label="${name} camera"
        @click=${() => openMoreInfo(this, s.entity_id)}>
        ${still ? html`<img src=${still} alt="" />` : html`<div class="message muted">Camera unavailable</div>`}
        <div class="name">${name}</div>
      </div>
    `;
  }

  static styles = [
    tileBase,
    glass,
    css`
      .tile {
        cursor: pointer;
        outline: none;
      }

      .tile:focus-visible {
        box-shadow: 0 0 0 3px var(--lf-accent);
      }

      img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .message {
        display: grid;
        place-items: center;
        height: 100%;
        padding: 12px;
        text-align: center;
      }

      .name {
        position: absolute;
        left: 12px;
        bottom: 10px;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 15px;
        font-weight: 600;
        color: #fff;
        background: rgb(0 0 0 / 45%);
      }
    `,
  ];
}

/** Photos from a media folder, crossfading. */
export class LuxFramePhotoTile extends SizedTile {
  declare config?: PhotoTileConfig;

  protected render() {
    return html`<luxframe-slideshow class="tile" .hass=${this.hass} .folder=${this.config?.folder}
      .album=${this.config?.album} .interval=${this.config?.interval ?? 30}></luxframe-slideshow>`;
  }

  static styles = [tileBase];
}

define('luxframe-now-playing-tile', LuxFrameNowPlayingTile);
define('luxframe-camera-tile', LuxFrameCameraTile);
define('luxframe-photo-tile', LuxFramePhotoTile);
