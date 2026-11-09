import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { define } from '../define';
import { icon } from '../icons';
import { MEDIA, favoriteButton, formatTime, isMusicAssistant, massUpNext, mediaPosition, supports } from '../media';
import { Pending, near } from '../pending';
import type { HassEntity, HomeAssistant } from '../types';
import './media-library';
import './media-speakers';

type Tab = 'speakers' | 'library';

const REPEAT_NEXT: Record<string, string> = { off: 'all', all: 'one', one: 'off' };
const REPEAT_LABEL: Record<string, string> = {
  off: 'Repeat is off',
  all: 'Repeating everything',
  one: 'Repeating this song',
};
/** How long a seek shows before the speaker reports it. */
const SEEK_HOLD_MS = 4000;
const SEEK_STEP = 10;

/**
 * A speaker's details: big artwork, what's playing with a bar to seek,
 * shuffle and repeat, and volume. With Music Assistant, a heart that adds
 * the song to its favorites and what's up next. Beside it, the speakers
 * (group them, set each one's volume, move the music) and, with Music
 * Assistant, the library to play from.
 */
export class LuxFrameMediaDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
    _tab: { state: true },
    _seek: { state: true },
    _faved: { state: true },
    _upNext: { state: true },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;
  declare _tab: Tab;
  /** Where the finger is on the progress bar, in seconds, while it's down. */
  declare _seek?: number;
  /** The song the heart was pressed for. */
  declare _faved?: string;
  declare _upNext?: string;

  private _volume = new Pending<number>(this);
  /** Where playback was sent, until the speaker says it's there. */
  private _sought = new Pending<number>(this);
  private _timer?: number;
  /** The song `_upNext` follows. */
  private _upNextOf?: string;
  /** The library stays once opened, so going back to it keeps its place. */
  private _libraryOpened = false;

  constructor() {
    super();
    this._tab = 'speakers';
  }

  connectedCallback(): void {
    super.connectedCallback();
    // The position moves on by itself while playing.
    this._timer = window.setInterval(() => {
      if (this.stateObj?.state === 'playing' && this._seek === undefined) this.requestUpdate();
    }, 1000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._timer);
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('stateObj') || changed.has('hass')) this._followQueue();
  }

  /** One song on one speaker. */
  private _song(): string {
    const s = this.stateObj;
    const a = s?.attributes ?? {};
    return [s?.entity_id, a.media_content_id, a.media_title, a.media_artist].join('|');
  }

  /** Music Assistant's queue: what plays next, asked once per song. */
  private _followQueue(): void {
    const s = this.stateObj;
    const active = s?.state === 'playing' || s?.state === 'paused';
    if (!s || !this.hass || !active || !isMusicAssistant(this.hass, s)) {
      this._upNextOf = undefined;
      this._upNext = undefined;
      return;
    }
    const song = this._song();
    if (song === this._upNextOf) return;
    this._upNextOf = song;
    this._upNext = undefined;
    massUpNext(this.hass, s.entity_id)
      .then((next) => {
        if (this._upNextOf === song) this._upNext = next;
      })
      .catch(() => undefined);
  }

  private _call(service: string, data: Record<string, unknown> = {}): void {
    const s = this.stateObj;
    if (s) this.hass?.callService('media_player', service, { entity_id: s.entity_id, ...data });
  }

  // ---- Seeking --------------------------------------------------------------

  /** The song's length when it can be sought through, else undefined. */
  private _seekable(): number | undefined {
    const s = this.stateObj;
    const duration = s?.attributes.media_duration;
    const active = s?.state === 'playing' || s?.state === 'paused';
    return active && supports(s, MEDIA.SEEK) && typeof duration === 'number' && duration > 0 ? duration : undefined;
  }

  private _seekAt(e: PointerEvent, duration: number): number {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
  }

  private _seekDown(e: PointerEvent): void {
    const duration = this._seekable();
    if (duration === undefined || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this._seek = this._seekAt(e, duration);
  }

  private _seekMove(e: PointerEvent): void {
    const duration = this._seekable();
    if (this._seek !== undefined && duration !== undefined) this._seek = this._seekAt(e, duration);
  }

  private _seekUp(): void {
    if (this._seek === undefined) return;
    this._seekTo(this._seek);
    this._seek = undefined;
  }

  private _seekTo(seconds: number): void {
    const position = Math.round(seconds);
    this._sought.release(position, SEEK_HOLD_MS);
    this._call('media_seek', { seek_position: position });
  }

  private _seekKey(e: KeyboardEvent, position: number | undefined): void {
    const duration = this._seekable();
    if (duration === undefined || position === undefined) return;
    const step = e.key === 'ArrowRight' ? SEEK_STEP : e.key === 'ArrowLeft' ? -SEEK_STEP : 0;
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    this._seekTo(Math.max(0, Math.min(duration, position + step)));
  }

  private _renderProgress(position: number | undefined, duration: number | undefined) {
    const seekable = this._seekable() !== undefined;
    const fraction = duration && position !== undefined ? Math.min(1, position / duration) : 0;
    const percent = `${(fraction * 100).toFixed(2)}%`;
    return html`<div class="progress">
      <span class="time">${position !== undefined ? formatTime(position) : ''}</span>
      <div
        class="bar ${seekable ? 'seekable' : ''}"
        role="slider"
        tabindex=${seekable ? 0 : -1}
        aria-label="Position in the song"
        aria-valuemin="0"
        aria-valuemax=${Math.round(duration ?? 0)}
        aria-valuenow=${Math.round(position ?? 0)}
        aria-valuetext=${position !== undefined ? formatTime(position) : nothing}
        aria-disabled=${!seekable}
        data-no-swipe
        @pointerdown=${this._seekDown}
        @pointermove=${this._seekMove}
        @pointerup=${this._seekUp}
        @pointercancel=${this._seekUp}
        @keydown=${(e: KeyboardEvent) => this._seekKey(e, position)}
      >
        <div class="rail"><div class="fill" style="width: ${percent}"></div></div>
        ${seekable ? html`<div class="knob" style="left: ${percent}"></div>` : nothing}
      </div>
      <span class="time">${duration ? formatTime(duration) : ''}</span>
    </div>`;
  }

  // ---- The rest -------------------------------------------------------------

  private _showTab(tab: Tab): void {
    this._tab = tab;
    const pane = this.renderRoot.querySelector('.pane');
    if (pane) pane.scrollTop = 0;
  }

  private _renderVolume(s: HassEntity) {
    const a = s.attributes;
    const unavailable = s.state === 'unavailable';
    const reported = typeof a.volume_level === 'number' ? Math.round(a.volume_level * 100) : undefined;
    const volume = this._volume.get(reported, near(1)) ?? reported ?? 0;
    const muted = !!a.is_volume_muted;
    if (!supports(s, MEDIA.VOLUME_SET) && !supports(s, MEDIA.VOLUME_MUTE)) return nothing;
    return html`<div class="volume">
      ${supports(s, MEDIA.VOLUME_MUTE)
        ? html`<button class="round small plain" aria-label=${muted ? 'Unmute' : 'Mute'} aria-pressed=${muted}
            ?disabled=${unavailable} @click=${() => this._call('volume_mute', { is_volume_muted: !muted })}>
            ${icon(muted ? 'mute' : 'speaker', 24)}
          </button>`
        : html`<span class="speaker-icon">${icon('speaker', 24)}</span>`}
      ${supports(s, MEDIA.VOLUME_SET)
        ? html`<luxframe-slider
            filled
            label="Volume"
            .value=${volume}
            .valueText=${`${volume}%`}
            ?disabled=${unavailable}
            @input=${(e: CustomEvent<number>) => this._volume.hold(e.detail)}
            @change=${(e: CustomEvent<number>) => {
              this._volume.release(e.detail);
              this._call('volume_set', { volume_level: e.detail / 100 });
            }}
          ></luxframe-slider>`
        : nothing}
    </div>`;
  }

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const hass = this.hass;
    const a = s.attributes;
    const playing = s.state === 'playing';
    const active = playing || s.state === 'paused';
    const off = s.state === 'off';
    const unavailable = s.state === 'unavailable';
    const title = active
      ? (a.media_title ?? 'Playing')
      : unavailable
        ? 'Unavailable'
        : off
          ? 'Off'
          : 'Nothing playing';
    const artist = active ? [a.media_artist, a.media_album_name].filter(Boolean).join(' · ') : '';
    const art = active && a.entity_picture ? (a.entity_picture as string) : undefined;
    const duration = typeof a.media_duration === 'number' && a.media_duration > 0 ? a.media_duration : undefined;
    const reported = mediaPosition(s);
    const position = this._seek ?? this._sought.get(reported, (x, y) => Math.abs(x - y) < 3) ?? reported;
    const mass = isMusicAssistant(hass, s);
    const heart = mass ? favoriteButton(hass, s.entity_id) : undefined;
    const faved = this._faved === this._song();
    const shuffle = !!a.shuffle;
    const repeat = typeof a.repeat === 'string' ? a.repeat : 'off';
    const canPlayPause = playing ? supports(s, MEDIA.PAUSE) : supports(s, MEDIA.PLAY);
    const tab: Tab = mass ? this._tab : 'speakers';
    if (tab === 'library') this._libraryOpened = true;

    return html`
      <div class="layout">
        <section class="now" aria-label="Now playing">
          <div class="cover">
            <div class="art" style=${art ? `background-image: url("${art}")` : ''}>
              ${art ? nothing : icon('music', 56)}
            </div>
          </div>
          <div class="heading">
            <div class="titles">
              <div class="title">${title}</div>
              ${artist ? html`<div class="line muted">${artist}</div>` : nothing}
            </div>
            ${heart
              ? html`<button
                  class="round small plain heart ${faved ? 'faved' : ''}"
                  aria-label=${faved ? 'Added to favorites' : 'Add to favorites'}
                  aria-pressed=${faved}
                  ?disabled=${!active || faved}
                  @click=${() => {
                    this.hass?.callService('button', 'press', { entity_id: heart });
                    this._faved = this._song();
                  }}
                >
                  ${icon(faved ? 'heart-filled' : 'heart', 28)}
                </button>`
              : nothing}
          </div>
          ${active && (duration || reported !== undefined) ? this._renderProgress(position, duration) : nothing}
          <div class="transport" role="group" aria-label="Playback">
            ${supports(s, MEDIA.SHUFFLE_SET)
              ? html`<button class="round small plain ${shuffle ? 'lit' : ''}" aria-label="Shuffle" aria-pressed=${shuffle}
                  ?disabled=${unavailable || off} @click=${() => this._call('shuffle_set', { shuffle: !shuffle })}>
                  ${icon('shuffle', 24)}
                </button>`
              : nothing}
            <button class="round" aria-label="Previous" ?disabled=${!active || !supports(s, MEDIA.PREVIOUS)}
              @click=${() => this._call('media_previous_track')}>${icon('previous', 28)}</button>
            <button class="round big" aria-label=${playing ? 'Pause' : 'Play'} ?disabled=${unavailable || off || !canPlayPause}
              @click=${() => this._call('media_play_pause')}>${icon(playing ? 'pause' : 'play', 36)}</button>
            <button class="round" aria-label="Next" ?disabled=${!active || !supports(s, MEDIA.NEXT)}
              @click=${() => this._call('media_next_track')}>${icon('next', 28)}</button>
            ${supports(s, MEDIA.REPEAT_SET)
              ? html`<button class="round small plain ${repeat !== 'off' ? 'lit' : ''}" aria-label=${REPEAT_LABEL[repeat] ?? 'Repeat'}
                  aria-pressed=${repeat !== 'off'} ?disabled=${unavailable || off}
                  @click=${() => this._call('repeat_set', { repeat: REPEAT_NEXT[repeat] ?? 'off' })}>
                  ${icon(repeat === 'one' ? 'repeat-one' : 'repeat', 24)}
                </button>`
              : nothing}
          </div>
          ${off && supports(s, MEDIA.TURN_ON)
            ? html`<button class="pill" @click=${() => this._call('turn_on')}>Turn On</button>`
            : this._renderVolume(s)}
          ${this._upNext ? html`<div class="next muted">Up next · ${this._upNext}</div>` : nothing}
        </section>

        <section class="more">
          ${mass
            ? html`<div class="tabs" role="tablist" aria-label="Speakers and library">
                <button role="tab" class="tab ${tab === 'speakers' ? 'on' : ''}" aria-selected=${tab === 'speakers'}
                  @click=${() => this._showTab('speakers')}>Speakers</button>
                <button role="tab" class="tab ${tab === 'library' ? 'on' : ''}" aria-selected=${tab === 'library'}
                  @click=${() => this._showTab('library')}>Library</button>
              </div>`
            : html`<h3>Speakers</h3>`}
          <div class="pane" data-no-swipe>
            <luxframe-media-speakers ?hidden=${tab !== 'speakers'} .hass=${hass} .player=${s.entity_id}>
            </luxframe-media-speakers>
            ${mass && this._libraryOpened
              ? html`<luxframe-media-library ?hidden=${tab !== 'library'} .hass=${hass} .player=${s.entity_id}>
                </luxframe-media-library>`
              : nothing}
          </div>
        </section>
      </div>
    `;
  }

  static styles = css`
    :host {
      flex: 1;
      align-self: stretch;
      display: block;
      min-width: 0;
      min-height: 0;
      color: var(--lf-text);
      font-family: var(--lf-font);
    }

    /* Upright: what's playing above the speakers and library; on its side, beside them. */
    .layout {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      gap: 28px;
      height: 100%;
      max-width: 1320px;
      margin: 0 auto;
    }

    @media (orientation: landscape) {
      .layout {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
        grid-template-rows: minmax(0, 1fr);
        gap: clamp(28px, 4vw, 64px);
      }
    }

    .now {
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-width: 0;
      min-height: 0;
    }

    /* Centered while it fits; on a short screen it runs off the bottom, not into the header. */
    .now > :first-child {
      margin-top: auto;
    }

    .now > :last-child {
      margin-bottom: auto;
    }

    .cover {
      flex: none;
      display: grid;
      place-items: center;
    }

    .art {
      display: grid;
      place-items: center;
      width: min(100%, 36vh, 400px);
      aspect-ratio: 1;
      border-radius: 24px;
      color: var(--lf-muted);
      background: rgb(255 255 255 / 12%) center / cover no-repeat;
      box-shadow: 0 18px 44px rgb(0 0 0 / 28%);
    }

    @media (orientation: portrait) {
      .art {
        width: min(100%, 28vh, 360px);
      }
    }

    /* Where it can, the artwork takes the room the controls leave, as a square. */
    @supports (container-type: size) {
      .now {
        container-type: inline-size;
      }

      .cover {
        flex: 0 1 min(400px, 100cqw);
        min-height: 140px;
        container-type: size;
      }

      .art {
        width: min(100cqw, 100cqh);
      }

      /* Upright, the speakers and library keep room for a few rows; the artwork gives way. */
      @media (orientation: portrait) {
        .layout {
          grid-template-rows: minmax(0, auto) minmax(min(300px, 40%), 1fr);
        }

        .cover {
          flex-basis: min(360px, 28vh, 100cqw);
        }
      }
    }

    /* A short screen: the artwork beside the title, so the controls keep their size. */
    @media (orientation: landscape) and (max-height: 680px), (orientation: portrait) and (max-height: 960px) {
      .now {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-content: center;
        gap: 16px 20px;
      }

      .now > * {
        grid-column: 1 / -1;
      }

      .now > :first-child,
      .now > :last-child {
        margin: 0;
      }

      .cover {
        grid-column: 1;
        width: clamp(88px, 18vh, 128px);
        min-height: 0;
        container-type: normal;
      }

      .art {
        width: 100%;
      }

      .heading {
        grid-column: 2;
      }
    }

    @media (orientation: portrait) and (max-height: 960px) {
      .layout {
        grid-template-rows: auto minmax(0, 1fr);
      }
    }

    .heading {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .titles {
      flex: 1;
      min-width: 0;
    }

    .title {
      font-size: clamp(22px, 2.6vw, 30px);
      font-weight: 600;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .line {
      margin-top: 4px;
      font-size: 18px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .muted {
      color: var(--lf-muted);
    }

    /* The song's progress, with a wide strip to drag along. */
    .progress {
      display: grid;
      grid-template-columns: 4.2ch minmax(0, 1fr) 4.2ch;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      font-variant-numeric: tabular-nums;
      color: var(--lf-muted);
    }

    .time:last-child {
      text-align: right;
    }

    .bar {
      position: relative;
      height: 36px;
      outline: none;
      touch-action: none;
    }

    .bar.seekable {
      cursor: pointer;
    }

    .bar:focus-visible {
      box-shadow: 0 0 0 3px var(--lf-accent);
      border-radius: 10px;
    }

    .rail {
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      height: 6px;
      margin-top: -3px;
      overflow: hidden;
      border-radius: 3px;
      background: rgb(255 255 255 / 18%);
    }

    .fill {
      height: 100%;
      background: var(--lf-text);
    }

    .knob {
      position: absolute;
      top: 50%;
      width: 18px;
      height: 18px;
      margin: -9px 0 0 -9px;
      border-radius: 50%;
      background: var(--lf-text);
      box-shadow: 0 1px 5px rgb(0 0 0 / 30%);
      pointer-events: none;
    }

    .transport {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: clamp(10px, 2vw, 24px);
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
      width: 60px;
      height: 60px;
      padding: 0;
      border-radius: 50%;
      background: rgb(255 255 255 / 12%);
    }

    .round.big {
      width: 80px;
      height: 80px;
      color: var(--lf-text-active);
      background: var(--lf-surface-active);
    }

    .round.small {
      width: 48px;
      height: 48px;
    }

    .round.plain {
      background: none;
      color: var(--lf-muted);
    }

    .round.plain.lit {
      color: var(--lf-accent);
    }

    /* A heart pressed stays full for this song; Music Assistant keeps it. */
    .heart.faved,
    .heart.faved:disabled {
      opacity: 1;
      color: #ff6b81;
    }

    .volume {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--lf-muted);
    }

    .volume .round.plain {
      color: var(--lf-text);
    }

    .speaker-icon {
      display: grid;
      place-items: center;
      width: 48px;
    }

    .volume luxframe-slider {
      flex: 1;
      --slider-fill: var(--lf-surface-active);
    }

    .pill {
      align-self: center;
      min-width: 200px;
      min-height: 56px;
      padding: 0 28px;
      border-radius: 999px;
      font-size: 18px;
      font-weight: 600;
      color: var(--lf-text-active);
      background: var(--lf-surface-active);
    }

    .next {
      flex: none;
      font-size: 15px;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .more {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
      min-height: 0;
    }

    .tabs {
      display: flex;
      gap: 8px;
    }

    .tab {
      min-height: 44px;
      padding: 0 20px;
      border-radius: 999px;
      font-size: 16px;
      font-weight: 600;
      background: rgb(255 255 255 / 12%);
    }

    .tab.on {
      color: var(--lf-text-active);
      background: var(--lf-surface-active);
    }

    h3 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--lf-muted);
    }

    /* Lists scroll here, up and down, without moving the sheet. */
    .pane {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      touch-action: pan-y;
      scrollbar-width: none;
    }

    .pane::-webkit-scrollbar {
      display: none;
    }
  `;
}

define('luxframe-media-detail', LuxFrameMediaDetail);
