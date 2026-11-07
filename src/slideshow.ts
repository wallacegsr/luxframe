import { LitElement, css, html, nothing } from 'lit';
import { DEFAULT_PHOTOS, Poller, listPhotos, photoUrl } from './data';
import { define } from './define';
import type { HomeAssistant } from './types';

const LIST_REFRESH_MS = 30 * 60_000;

/**
 * Photos from a Home Assistant media folder, one at a time, crossfading every
 * `interval` seconds in a shuffled order. Each photo is loaded before it's
 * shown, so the fade never lands on a half-drawn image.
 */
export class LuxFrameSlideshow extends LitElement {
  static properties = {
    hass: { attribute: false },
    folder: {},
    interval: { type: Number },
    _photos: { state: true },
    _layers: { state: true },
    _front: { state: true },
  };

  declare hass?: HomeAssistant;
  declare folder?: string;
  declare interval: number;
  declare _photos?: string[];
  /** Two stacked images; the front one is visible, the other fades in next. */
  declare _layers: [string | undefined, string | undefined];
  declare _front: 0 | 1;

  private _order: string[] = [];
  private _timer?: number;
  private _loadedFor?: string;
  private _list = new Poller(this, () => this._loadList(), LIST_REFRESH_MS);

  constructor() {
    super();
    this.interval = 30;
    this._layers = [undefined, undefined];
    this._front = 0;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._timer);
  }

  protected willUpdate(): void {
    const key = this.folder ?? DEFAULT_PHOTOS;
    if (this.hass && key !== this._loadedFor) {
      this._loadedFor = key;
      this._list.refresh();
    }
  }

  private async _loadList(): Promise<void> {
    if (!this.hass) return;
    const photos = await listPhotos(this.hass, this.folder).catch(() => []);
    const changed = photos.join() !== (this._photos ?? []).join();
    this._photos = photos;
    if (changed) {
      this._order = [];
      window.clearTimeout(this._timer);
      this._next();
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

  private async _next(): Promise<void> {
    window.clearTimeout(this._timer);
    const id = this._pick();
    if (id) {
      const url = await photoUrl(this.hass, id).catch(() => undefined);
      if (url && (await preload(url)) && this.isConnected) {
        const back = this._front === 0 ? 1 : 0;
        const layers: [string | undefined, string | undefined] = [...this._layers];
        layers[back] = url;
        this._layers = layers;
        this._front = back;
      }
    }
    if (this.isConnected && (this._photos?.length ?? 0) > 1) {
      this._timer = window.setTimeout(() => this._next(), Math.max(5, this.interval) * 1000);
    }
  }

  protected render() {
    if (this._photos && !this._photos.length) {
      return html`<div class="empty">No photos in ${folderName(this.folder)}</div>`;
    }
    return html`${this._layers.map((url, i) =>
      url
        ? html`<div class="photo ${i === this._front ? 'front' : ''}" style="background-image: url(&quot;${url}&quot;)"></div>`
        : nothing,
    )}<slot></slot>`;
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
  folder.replace('media-source://media_source/', '') || 'local';

define('luxframe-slideshow', LuxFrameSlideshow);
