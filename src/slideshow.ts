import { LitElement, css, html, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { DEFAULT_PHOTOS, IMMICH_ROOT, Poller, listPhotos, photoFolder, photoUrl } from './data';
import { define } from './define';
import { icon } from './icons';
import type { HomeAssistant } from './types';

const LIST_REFRESH_MS = 30 * 60_000;
/** Photos remembered for going back. */
const HISTORY = 50;

/**
 * Photos from a Home Assistant media folder or an Immich album (through Home
 * Assistant's Immich integration), one at a time, crossfading every
 * `interval` seconds in a shuffled order. Each photo is loaded before it's
 * shown, so the fade never lands on a half-drawn image.
 *
 * A tap on the right half skips ahead, on the left half goes back through
 * the photos already shown; either starts the interval over.
 */
export class LuxFrameSlideshow extends LitElement {
  static properties = {
    hass: { attribute: false },
    folder: {},
    album: {},
    interval: { type: Number },
    _photos: { state: true },
    _problem: { state: true },
    _layers: { state: true },
    _front: { state: true },
    _quick: { state: true },
    _hint: { state: true },
  };

  declare hass?: HomeAssistant;
  declare folder?: string;
  /** An Immich album's name or id; wins over `folder`. */
  declare album?: string;
  declare interval: number;
  /** Why there are no photos, when it isn't just an empty folder. */
  declare _problem?: string;
  declare _photos?: string[];
  /** Two stacked images; the front one is visible, the other fades in next. */
  declare _layers: [string | undefined, string | undefined];
  declare _front: 0 | 1;
  /** The last change was a tap: fade quickly. */
  declare _quick: boolean;
  /** Which way the last tap went, shown briefly; `n` restarts the fade. */
  declare _hint?: { side: 'back' | 'next'; n: number };

  private _order: string[] = [];
  /** Photos shown so far, oldest first; `_at` is the one on screen. */
  private _shown: string[] = [];
  private _at = -1;
  /** Counts moves, so a slow load can't land after a newer one. */
  private _moves = 0;
  private _timer?: number;
  private _loadedFor?: string;
  private _list = new Poller(this, () => this._loadList(), LIST_REFRESH_MS);

  constructor() {
    super();
    this.interval = 30;
    this._layers = [undefined, undefined];
    this._front = 0;
    this._quick = false;
    this.addEventListener('click', this._onClick);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._timer);
  }

  protected willUpdate(): void {
    const key = `${this.album ?? ''}|${this.folder ?? DEFAULT_PHOTOS}`;
    if (this.hass && key !== this._loadedFor) {
      this._loadedFor = key;
      this._list.refresh();
    }
  }

  private async _loadList(): Promise<void> {
    if (!this.hass) return;
    let photos: string[] = [];
    try {
      const folder = await photoFolder(this.hass, { folder: this.folder, album: this.album });
      photos = await listPhotos(this.hass, folder).catch(() => []);
      this._problem = undefined;
    } catch (e) {
      this._problem = (e as Error).message;
    }
    const changed = photos.join() !== (this._photos ?? []).join();
    this._photos = photos;
    if (changed) {
      this._order = [];
      this._shown = [];
      this._at = -1;
      void this._step(1, false);
    }
  }

  private _pick(): string | undefined {
    if (!this._photos?.length) return undefined;
    if (!this._order.length) {
      this._order = [...this._photos];
      for (let i = this._order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this._order[i], this._order[j]] = [this._order[j], this._order[i]];
      }
    }
    return this._order.shift();
  }

  /** Forward to the next photo (one already seen, else a new one), or back one. */
  private async _step(by: 1 | -1, tapped: boolean): Promise<void> {
    window.clearTimeout(this._timer);
    let id: string | undefined;
    if (by < 0) {
      if (this._at <= 0) return this._schedule();
      id = this._shown[--this._at];
    } else if (this._at < this._shown.length - 1) {
      id = this._shown[++this._at];
    } else {
      id = this._pick();
      if (id) {
        this._shown.push(id);
        if (this._shown.length > HISTORY) this._shown.shift();
        this._at = this._shown.length - 1;
      }
    }
    const move = ++this._moves;
    if (id) {
      const url = await photoUrl(this.hass, id).catch(() => undefined);
      const ready = !!url && (await preload(url));
      if (move !== this._moves) return; // a newer tap took over
      if (ready && this.isConnected) {
        const back = this._front === 0 ? 1 : 0;
        const layers: [string | undefined, string | undefined] = [...this._layers];
        layers[back] = url;
        this._layers = layers;
        this._front = back;
        this._quick = tapped;
      }
    }
    this._schedule();
  }

  private _schedule(): void {
    window.clearTimeout(this._timer);
    if (this.isConnected && (this._photos?.length ?? 0) > 1) {
      this._timer = window.setTimeout(() => void this._step(1, false), Math.max(5, this.interval) * 1000);
    }
  }

  private _onClick = (e: MouseEvent): void => {
    if ((this._photos?.length ?? 0) < 2) return;
    const box = this.getBoundingClientRect();
    const side = e.clientX < box.left + box.width / 2 ? 'back' : 'next';
    if (side === 'back' && this._at <= 0) return; // nothing shown before this one
    this._hint = { side, n: (this._hint?.n ?? 0) + 1 };
    void this._step(side === 'back' ? -1 : 1, true);
  };

  protected render() {
    if (this._problem) return html`<div class="empty">${this._problem}</div>`;
    if (this._photos && !this._photos.length) {
      return html`<div class="empty">No photos in ${this.album ? `\u201c${this.album}\u201d` : folderName(this.folder)}</div>`;
    }
    const hint = this._hint;
    return html`${this._layers.map((url, i) =>
      url
        ? html`<div class="photo ${i === this._front ? 'front' : ''} ${this._quick ? 'quick' : ''}"
            style="background-image: url(&quot;${url}&quot;)"></div>`
        : nothing,
    )}${hint
      ? keyed(hint.n, html`<div class="hint ${hint.side}" aria-hidden="true">${icon(hint.side === 'back' ? 'previous' : 'next', 26)}</div>`)
      : nothing}<slot></slot>`;
  }

  static styles = css`
    :host {
      position: relative;
      display: block;
      overflow: hidden;
      background: rgb(0 0 0 / 25%);
    }

    .photo {
      position: absolute;
      inset: 0;
      background: center / cover no-repeat;
      opacity: 0;
      transition: opacity 1.6s ease;
    }

    .photo.front {
      opacity: 1;
    }

    .photo.quick {
      transition-duration: 0.4s;
    }

    /* Which way a tap went, as the media controls draw it, fading away. */
    .hint {
      position: absolute;
      top: 50%;
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      margin-top: -28px;
      border-radius: 50%;
      color: #fff;
      background: rgb(0 0 0 / 45%);
      -webkit-backdrop-filter: blur(12px);
      backdrop-filter: blur(12px);
      opacity: 0;
      pointer-events: none;
      animation: hint 0.7s ease-out;
    }

    .hint.back {
      left: 16px;
    }

    .hint.next {
      right: 16px;
    }

    @keyframes hint {
      0% {
        opacity: 1;
        transform: scale(0.9);
      }

      40% {
        opacity: 1;
        transform: scale(1);
      }

      100% {
        opacity: 0;
      }
    }

    .empty {
      display: grid;
      place-items: center;
      height: 100%;
      padding: 12px;
      text-align: center;
      color: var(--lf-muted);
      font-family: var(--lf-font);
    }

    @media (prefers-reduced-motion: reduce) {
      .photo {
        transition: none;
      }

      .hint {
        animation-name: fade;
      }
    }

    @keyframes fade {
      from {
        opacity: 1;
      }
    }
  `;
}

function preload(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/** "local/holiday" for the message, not the whole media-source address. */
export const folderName = (folder = DEFAULT_PHOTOS): string =>
  folder.startsWith(IMMICH_ROOT) ? 'this Immich album' : folder.replace('media-source://media_source/', '') || 'local';

define('luxframe-slideshow', LuxFrameSlideshow);
