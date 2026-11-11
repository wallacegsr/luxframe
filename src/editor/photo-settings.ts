import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { DEFAULT_PHOTOS, IMMICH_ROOT, immichAlbums, type PhotoAlbum } from '../data';
import { define } from '../define';
import type { HomeAssistant, PhotoSource } from '../types';
import { editorStyles } from './sheet';

const INTERVALS: Array<{ value: number; label: string }> = [
  { value: 10, label: '10 sec' },
  { value: 30, label: '30 sec' },
  { value: 60, label: '1 min' },
  { value: 300, label: '5 min' },
  { value: 900, label: '15 min' },
  { value: 3600, label: '1 hour' },
];
const DEFAULT_INTERVAL = 30;
const MEDIA = 'media-source://media_source/';

/** What a photo tile or the photos page shows, and for how long each. */
export type PhotoSettings = PhotoSource & { interval?: number };

/**
 * Where photos come from (a media folder, or an Immich album through Home
 * Assistant's Immich integration) and how long each one shows. Fires
 * `change` with the fields that changed; undefined ones go back to the default.
 */
export class LuxFramePhotoSettings extends LitElement {
  static properties = {
    hass: { attribute: false },
    value: { attribute: false },
    _albums: { state: true },
  };

  declare hass?: HomeAssistant;
  declare value?: PhotoSettings;
  /** Immich's albums; undefined while they're being read. */
  declare _albums?: PhotoAlbum[];

  private _looking = false;

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('hass') && this.hass && !this._looking) {
      this._looking = true;
      void immichAlbums(this.hass).then((found) => (this._albums = found));
    }
  }

  private _set(changes: PhotoSettings): void {
    this.dispatchEvent(new CustomEvent('change', { detail: changes }));
  }

  /** The album shown now, by its folder or by the name written in YAML. */
  private _albumOn(a: PhotoAlbum): boolean {
    const { folder, album } = this.value ?? {};
    if (album) return a.title.toLowerCase() === album.trim().toLowerCase() || a.id === album || a.id.endsWith(`|${album}`);
    return folder === a.id;
  }

  protected render() {
    const value = this.value ?? {};
    const albums = this._albums ?? [];
    const fromAlbum = !!value.album || !!value.folder?.startsWith(IMMICH_ROOT);
    const known = albums.some((a) => this._albumOn(a));
    const interval = value.interval ?? DEFAULT_INTERVAL;
    const folder = (value.folder ?? DEFAULT_PHOTOS).replace(MEDIA, '');

    return html`
      <h3>Photos from</h3>
      <div class="row" role="group" aria-label="Photos from">
        <button class="chip ${fromAlbum ? '' : 'on'}" aria-pressed=${!fromAlbum}
          @click=${() => this._set({ folder: undefined, album: undefined })}>Media folder</button>
        ${albums.map(
          (a) => html`<button class="chip ${this._albumOn(a) ? 'on' : ''}" aria-pressed=${this._albumOn(a)}
            @click=${() => this._set({ folder: a.id, album: undefined })}>${a.title}</button>`,
        )}
        ${fromAlbum && !known && this._albums
          ? html`<button class="chip on" aria-pressed="true">${value.album ?? 'Immich album'}</button>`
          : nothing}
      </div>
      ${!this._albums
        ? html`<p class="muted hint">Looking for Immich albums…</p>`
        : albums.length
          ? nothing
          : html`<p class="muted hint">
              To show an Immich album, add Home Assistant's Immich integration with your server's address and an
              API key. Its albums then appear here.
            </p>`}
      ${fromAlbum
        ? nothing
        : html`<label class="field">
            Folder under My media
            <input type="text" placeholder="local" .value=${folder}
              @change=${(e: Event) => {
                const typed = (e.target as HTMLInputElement).value.trim().replace(/^\/+|\/+$/g, '');
                const id = !typed || typed === 'local' ? undefined : typed.startsWith('media-source://') ? typed : MEDIA + typed;
                this._set({ folder: id, album: undefined });
              }} />
          </label>`}
      <h3>Each photo for</h3>
      <div class="row" role="group" aria-label="Each photo for">
        ${INTERVALS.map(
          (i) => html`<button class="chip ${interval === i.value ? 'on' : ''}" aria-pressed=${interval === i.value}
            @click=${() => this._set({ interval: i.value === DEFAULT_INTERVAL ? undefined : i.value })}>${i.label}</button>`,
        )}
        ${INTERVALS.some((i) => i.value === interval)
          ? nothing
          : html`<button class="chip on" aria-pressed="true">${interval < 60 ? `${interval} sec` : `${Math.round((interval / 60) * 10) / 10} min`}</button>`}
      </div>
    `;
  }

  static styles = [
    editorStyles,
    css`
      .hint {
        margin: 8px 0 0;
        font-size: 15px;
      }

      .field {
        margin-top: 14px;
      }
    `,
  ];
}

define('luxframe-photo-settings', LuxFramePhotoSettings);
