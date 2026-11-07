import { LitElement, css, html, nothing } from 'lit';
import { define } from './define';
import { resolve } from './entity';
import { icon } from './icons';
import { MEDIA, pickPlayer, supports } from './media';
import { Pending, near } from './pending';
import type { HomeAssistant, TileSize } from './types';

/**
 * What a speaker is playing: artwork, title, artist, previous / play-pause /
 * next and volume, with buttons the speaker can't use dimmed. Follows
 * `entity`, or whichever speaker is playing (Music Assistant's first).
 *
 * `size` trims it for small tiles: `s` keeps the artwork and play/pause, `w`
 * drops the volume.
 */
export class LuxFrameNowPlaying extends LitElement {
  static properties = {
    hass: { attribute: false },
    entity: {},
    size: { reflect: true },
  };

  declare hass?: HomeAssistant;
  declare entity?: string;
  declare size: TileSize;

  private _volume = new Pending<number>(this);

  constructor() {
    super();
    this.size = 'm';
  }

  private _call(entityId: string, service: string, data: Record<string, unknown> = {}): void {
    this.hass?.callService('media_player', service, { entity_id: entityId, ...data });
  }

  protected render() {
    const player = pickPlayer(this.hass, this.entity);
    if (!player) return html`<div class="empty muted">No speakers</div>`;

    const a = player.attributes;
    const playing = player.state === 'playing';
    const active = playing || player.state === 'paused';
    const title = active ? (a.media_title ?? 'Playing') : 'Nothing playing';
    const artist = active ? [a.media_artist, a.media_album_name].filter(Boolean).join(' · ') : '';
    // The full name: "Speaker" alone says nothing once the room is dropped.
    const name = a.friendly_name ?? resolve(this.hass, player.entity_id).name;
    const reported = typeof a.volume_level === 'number' ? Math.round(a.volume_level * 100) : undefined;
    const volume = this._volume.get(reported, near(1)) ?? reported ?? 0;
    const canPlayPause = playing ? supports(player, MEDIA.PAUSE) : supports(player, MEDIA.PLAY);
    const off = player.state === 'unavailable' || player.state === 'off';
    const art = a.entity_picture && active ? a.entity_picture : undefined;
    const id = player.entity_id;

    const playPause = html`<button class="round big" aria-label=${playing ? 'Pause' : 'Play'}
      ?disabled=${off || !canPlayPause} @click=${() => this._call(id, 'media_play_pause')}>
      ${icon(playing ? 'pause' : 'play', 30)}
    </button>`;

    if (this.size === 's') {
      return html`
        <div class="small" style=${art ? `background-image: url("${art}")` : ''}>
          <div class="shade"></div>
          <div class="title one">${title}</div>
          ${playPause}
        </div>
      `;
    }

    return html`
      <div class="now">
        <div class="art" style=${art ? `background-image: url("${art}")` : ''}>
          ${art ? nothing : icon('speaker', 30)}
        </div>
        <div class="info">
          <div class="title">${title}</div>
          ${artist ? html`<div class="muted line">${artist}</div>` : nothing}
          <div class="muted line small-text">${name}</div>
        </div>
      </div>
      <div class="transport" role="group" aria-label="Playback">
        <button class="round" aria-label="Previous" ?disabled=${!active || !supports(player, MEDIA.PREVIOUS)}
          @click=${() => this._call(id, 'media_previous_track')}>${icon('previous')}</button>
        ${playPause}
        <button class="round" aria-label="Next" ?disabled=${!active || !supports(player, MEDIA.NEXT)}
          @click=${() => this._call(id, 'media_next_track')}>${icon('next')}</button>
      </div>
      ${this.size === 'w'
        ? nothing
        : html`<div class="volume">
            ${icon('speaker', 22)}
            <luxframe-slider
              filled
              label="Volume"
              .value=${volume}
              .valueText=${`${volume}%`}
              ?disabled=${off || !supports(player, MEDIA.VOLUME_SET)}
              @input=${(e: CustomEvent<number>) => this._volume.hold(e.detail)}
              @change=${(e: CustomEvent<number>) => {
                this._volume.release(e.detail);
                this._call(id, 'volume_set', { volume_level: e.detail / 100 });
              }}
            ></luxframe-slider>
          </div>`}
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 16px;
      min-width: 0;
      color: var(--lf-text);
      font-family: var(--lf-font);
    }

    :host([size='w']) {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }

    .empty {
      display: grid;
      place-items: center;
      min-height: 100px;
      font-size: 18px;
    }

    .muted {
      color: var(--lf-muted);
    }

    .now {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }

    .art {
      flex: none;
      display: grid;
      place-items: center;
      width: 88px;
      height: 88px;
      border-radius: 14px;
      background: rgb(255 255 255 / 14%) center / cover no-repeat;
      color: var(--lf-muted);
    }

    :host([size='w']) .art {
      width: 64px;
      height: 64px;
      border-radius: 12px;
    }

    .info {
      min-width: 0;
    }

    .title {
      font-size: 20px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .line {
      font-size: 16px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .small-text {
      font-size: 14px;
    }

    .transport {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 22px;
    }

    :host([size='w']) .transport {
      gap: 10px;
    }

    button {
      font: inherit;
      color: inherit;
      border: 0;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    button:disabled {
      opacity: 0.35;
      cursor: default;
    }

    button:focus-visible {
      outline: 3px solid var(--lf-accent);
      outline-offset: 2px;
    }

    .round {
      flex: none;
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      padding: 0;
      border-radius: 50%;
      background: rgb(255 255 255 / 12%);
    }

    .round.big {
      width: 64px;
      height: 64px;
      color: var(--lf-text-active);
      background: var(--lf-surface-active);
    }

    .volume {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--lf-muted);
    }

    .volume luxframe-slider {
      flex: 1;
      --slider-fill: var(--lf-surface-active);
    }

    /* A small tile: the artwork fills it, play/pause in the corner. */
    .small {
      position: relative;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: flex-start;
      gap: 8px;
      padding: 12px;
      border-radius: inherit;
      background: center / cover no-repeat;
    }

    .shade {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(transparent 35%, rgb(0 0 0 / 55%));
    }

    .small > :not(.shade) {
      position: relative;
    }

    .small .round.big {
      width: 48px;
      height: 48px;
    }

    .one {
      max-width: 100%;
      font-size: 15px;
    }
  `;
}

define('luxframe-now-playing', LuxFrameNowPlaying);
