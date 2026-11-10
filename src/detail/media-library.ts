import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { define } from '../define';
import { icon, type IconName } from '../icons';
import { massLibrary, massPlay, massSearch, type MassItem, type MassSearch, type MassType } from '../media';
import { controls, sectionLabel } from '../theme';
import type { HomeAssistant } from '../types';

type View = 'favorites' | 'playlist' | 'album' | 'artist' | 'radio';

const VIEWS: Array<{ view: View; label: string }> = [
  { view: 'favorites', label: 'Favorites' },
  { view: 'playlist', label: 'Playlists' },
  { view: 'album', label: 'Albums' },
  { view: 'artist', label: 'Artists' },
  { view: 'radio', label: 'Radio' },
];

/** Favorites, in this order. */
const FAVORITES: MassType[] = ['playlist', 'album', 'artist', 'radio', 'track'];
/** Search results, in this order, and where the answer keeps each. */
const FOUND: Array<{ type: MassType; key: keyof MassSearch }> = [
  { type: 'artist', key: 'artists' },
  { type: 'album', key: 'albums' },
  { type: 'track', key: 'tracks' },
  { type: 'playlist', key: 'playlists' },
  { type: 'radio', key: 'radio' },
];

const HEADINGS: Record<string, string> = {
  playlist: 'Playlists',
  album: 'Albums',
  artist: 'Artists',
  radio: 'Radio',
  track: 'Songs',
};

const ICONS: Record<string, IconName> = {
  playlist: 'list',
  artist: 'person',
  radio: 'radio',
};

const PAGE = 60;
const SEARCH_AFTER_MS = 450;
const STARTED_MS = 2500;

interface Section {
  type: string;
  items: MassItem[];
}

/** An album's or song's artists; nothing for the rest. */
function byline(item: MassItem): string {
  if (item.media_type !== 'album' && item.media_type !== 'track') return '';
  return (item.artists ?? []).map((a) => a.name).join(', ');
}

function hideBroken(e: Event): void {
  (e.target as HTMLImageElement).hidden = true;
}

/**
 * Music Assistant's library, for the media details: favorites, playlists,
 * albums, artists and radio, and a search across every provider. A tap plays
 * the item on the speaker shown, queued as Music Assistant is set to queue it.
 */
export class LuxFrameMediaLibrary extends LitElement {
  static properties = {
    hass: { attribute: false },
    player: {},
    _view: { state: true },
    _query: { state: true },
    _sections: { state: true },
    _error: { state: true },
    _loading: { state: true },
    _more: { state: true },
    _started: { state: true },
  };

  declare hass?: HomeAssistant;
  /** The speaker it plays on. */
  declare player?: string;
  declare _view: View;
  declare _query: string;
  /** What's shown, or undefined while it first loads. */
  declare _sections?: Section[];
  declare _error?: string;
  declare _loading: boolean;
  /** Whether the list has more to show. */
  declare _more: boolean;
  /** The item just tapped, shown as starting. */
  declare _started?: string;

  /** Answers to older requests are dropped. */
  private _request = 0;
  private _searchTimer?: number;
  /** The search the list was last loaded for; '' for the library's own views. */
  private _loadedFor = '';

  constructor() {
    super();
    this._view = 'favorites';
    this._query = '';
    this._loading = false;
    this._more = false;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._searchTimer);
  }

  protected willUpdate(changed: PropertyValues): void {
    // Another speaker may use another Music Assistant server.
    if (changed.has('player') && this.player) void this._load();
  }

  private get _searching(): boolean {
    return this._query.trim().length >= 2;
  }

  /** What to search for, or '' to show the library's own views. */
  private get _search(): string {
    return this._searching ? this._query.trim() : '';
  }

  private async _load(more = false): Promise<void> {
    const hass = this.hass;
    const player = this.player;
    if (!hass || !player) return;
    const request = ++this._request;
    this._loadedFor = this._search;
    this._loading = true;
    this._error = undefined;
    if (!more) this._sections = undefined;
    try {
      let sections: Section[];
      let hasMore = false;
      if (this._search) {
        const found = await massSearch(hass, player, this._search);
        sections = FOUND.map(({ type, key }) => ({ type, items: found[key] ?? [] }));
      } else if (this._view === 'favorites') {
        sections = await Promise.all(
          FAVORITES.map(async (type) => ({ type, items: await massLibrary(hass, player, type, { favorite: true }) })),
        );
      } else {
        const before = more ? (this._sections?.[0]?.items ?? []) : [];
        const items = await massLibrary(hass, player, this._view, { limit: PAGE, offset: before.length });
        sections = [{ type: this._view, items: [...before, ...items] }];
        hasMore = items.length === PAGE;
      }
      if (request !== this._request) return;
      this._sections = sections.filter((s) => s.items.length);
      this._more = hasMore;
    } catch (e) {
      if (request !== this._request) return;
      this._error = (e as { message?: string })?.message ?? String(e);
    } finally {
      if (request === this._request) this._loading = false;
    }
  }

  private _show(view: View): void {
    if (view === this._view) return;
    this._view = view;
    void this._load();
  }

  private _typed(e: Event): void {
    this._query = (e.target as HTMLInputElement).value;
    window.clearTimeout(this._searchTimer);
    // A first letter, or a space, doesn't change what to show.
    if (this._search === this._loadedFor) return;
    this._searchTimer = window.setTimeout(() => void this._load(), SEARCH_AFTER_MS);
  }

  private _searchNow(): void {
    window.clearTimeout(this._searchTimer);
    void this._load();
  }

  private _play(item: MassItem): void {
    if (!this.hass || !this.player) return;
    void massPlay(this.hass, this.player, item);
    this._started = item.uri;
    window.setTimeout(() => {
      if (this._started === item.uri) this._started = undefined;
    }, STARTED_MS);
  }

  private _cover(item: MassItem, size: number) {
    return html`<span class="cover ${item.media_type === 'artist' ? 'round' : ''}">
      ${icon(ICONS[item.media_type] ?? 'music', size)}
      ${item.image ? html`<img src=${item.image} alt="" loading="lazy" @error=${hideBroken} />` : nothing}
      ${this._started === item.uri ? html`<span class="started">${icon('play', size)}</span>` : nothing}
    </span>`;
  }

  private _renderCard(item: MassItem) {
    const by = byline(item);
    return html`<button class="card" aria-label="Play ${item.name}" @click=${() => this._play(item)}>
      ${this._cover(item, 32)}
      <span class="name">${item.name}</span>
      ${by ? html`<span class="by">${by}</span>` : nothing}
    </button>`;
  }

  private _renderSong(item: MassItem) {
    const by = byline(item);
    return html`<li>
      <button class="song" aria-label="Play ${item.name}" @click=${() => this._play(item)}>
        ${this._cover(item, 20)}
        <span class="text">
          <span class="name">${item.name}</span>
          ${by ? html`<span class="by">${by}</span>` : nothing}
        </span>
      </button>
    </li>`;
  }

  private _renderBody() {
    if (this._error) return html`<p class="note">Couldn’t reach the library: ${this._error}</p>`;
    if (!this._sections) return html`<p class="note">Loading…</p>`;
    if (!this._sections.length) {
      return html`<p class="note">
        ${this._searching
          ? 'Nothing found.'
          : this._view === 'favorites'
            ? 'No favorites yet. Tap the heart while a song plays to add it.'
            : 'Nothing here yet.'}
      </p>`;
    }
    const headed = this._searching || this._view === 'favorites';
    return html`
      ${this._sections.map(
        (section) => html`
          ${headed ? html`<h4>${HEADINGS[section.type] ?? section.type}</h4>` : nothing}
          ${section.type === 'track'
            ? html`<ul class="songs">${section.items.map((item) => this._renderSong(item))}</ul>`
            : html`<div class="grid">${section.items.map((item) => this._renderCard(item))}</div>`}
        `,
      )}
      ${this._more
        ? html`<div class="more">
            <button class="chip" ?disabled=${this._loading} @click=${() => void this._load(true)}>Show more</button>
          </div>`
        : nothing}
    `;
  }

  protected render() {
    return html`
      <label class="search">
        ${icon('search', 20)}
        <input
          type="search"
          aria-label="Search Music Assistant"
          placeholder="Search Music Assistant"
          enterkeyhint="search"
          autocomplete="off"
          .value=${this._query}
          @input=${this._typed}
          @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this._searchNow()}
        />
      </label>
      ${this._searching
        ? nothing
        : html`<div class="views" role="group" aria-label="Library">
            ${VIEWS.map(
              ({ view, label }) => html`<button class="chip ${this._view === view ? 'on' : ''}"
                aria-pressed=${this._view === view} @click=${() => this._show(view)}>${label}</button>`,
            )}
          </div>`}
      ${this._renderBody()}
    `;
  }

  static styles = [
    controls,
    sectionLabel,
    css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 14px;
      color: var(--lf-text);
      font-family: var(--lf-font);
    }

    :host([hidden]) {
      display: none;
    }

    .search {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 48px;
      padding: 0 16px;
      border-radius: 999px;
      color: var(--lf-muted);
      background: var(--lf-control);
    }

    .search input {
      flex: 1;
      min-width: 0;
      height: 48px;
      padding: 0;
      border: 0;
      outline: none;
      font: inherit;
      font-size: 17px;
      color: var(--lf-text);
      background: none;
    }

    .search input::placeholder {
      color: var(--lf-faint);
    }

    .views {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
      touch-action: pan-x pan-y;
    }

    .views::-webkit-scrollbar {
      display: none;
    }

    .chip {
      flex: none;
    }

    h4 {
      margin: 8px 0 -4px;
    }

    .note {
      margin: 8px 4px;
      font-size: 17px;
      color: var(--lf-muted);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
      gap: 16px 14px;
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
      padding: 0;
      text-align: left;
      background: none;
      content-visibility: auto;
      contain-intrinsic-size: auto 190px;
    }

    .cover {
      position: relative;
      display: grid;
      place-items: center;
      flex: none;
      width: 100%;
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: var(--lf-radius-icon);
      color: var(--lf-muted);
      background: var(--lf-control);
      transition: transform var(--lf-fast);
    }

    .cover.round {
      border-radius: 50%;
    }

    .cover img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .started {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: #fff;
      background: rgb(0 0 0 / 45%);
      animation: fade var(--lf-move) ease-out;
    }

    .card:active .cover {
      transform: scale(0.96);
    }

    .name {
      max-width: 100%;
      font-size: 15px;
      font-weight: 600;
      line-height: 1.25;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .by {
      max-width: 100%;
      margin-top: -2px;
      font-size: 13px;
      color: var(--lf-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .songs {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .song {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      min-height: 56px;
      padding: 6px;
      border-radius: var(--lf-radius-s);
      text-align: left;
      background: none;
    }

    .song:active {
      background: var(--lf-control);
    }

    .song .cover {
      width: 44px;
      border-radius: calc(var(--lf-radius-icon) / 2);
    }

    .song .text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .song .name {
      -webkit-line-clamp: 1;
    }

    .more {
      display: flex;
      justify-content: center;
      padding: 4px 0 8px;
    }

    @keyframes fade {
      from {
        opacity: 0;
      }
    }
  `,
  ];
}

define('luxframe-media-library', LuxFrameMediaLibrary);
