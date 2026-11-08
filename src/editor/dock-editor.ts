import { dump, load } from 'js-yaml';
import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { define } from '../define';
import { resolve } from '../entity';
import { compactDock, dockKind, dockLabel, normalizeDock } from '../quick/dock';
import type { HomeAssistant, QuickDockConfig } from '../types';
import './card-visual';
import { tileLabel } from './layout';
import { editorStyles } from './sheet';

function yamlError(e: unknown): string {
  const reason = (e as { reason?: string }).reason;
  return `That isn’t valid YAML${reason ? ` (${reason})` : ''}`;
}

/**
 * One dock item's settings: its name and icon, whether it opens first, a
 * card's own editor and background, its YAML for the rest (visibility, the
 * tile it opens), its place, and removing it. Fires `change` with the new
 * item, `move` (-1 or 1) and `remove`.
 */
export class LuxFrameDockEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    item: { attribute: false },
    first: { type: Boolean },
    last: { type: Boolean },
    _yaml: { state: true },
    _error: { state: true },
    _mode: { state: true },
    _cardYaml: { state: true },
    _cardError: { state: true },
    _noVisual: { state: true },
  };

  declare hass?: HomeAssistant;
  declare item?: QuickDockConfig;
  declare first: boolean;
  declare last: boolean;
  /** The item's YAML while it's being edited, before Apply. */
  declare _yaml?: string;
  declare _error?: string;
  /** A card's visual editor, or its YAML. */
  declare _mode: 'visual' | 'yaml';
  /** The card's YAML while it's being edited, before Apply. */
  declare _cardYaml?: string;
  declare _cardError?: string;
  /** Why the card has no visual editor, once its editor says so. */
  declare _noVisual?: string;

  /** The card type `_noVisual` and `_mode` are about. */
  private _cardType?: string;

  constructor() {
    super();
    this.first = false;
    this.last = false;
    this._mode = 'visual';
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('item')) {
      this._yaml = undefined;
      this._error = undefined;
      this._cardYaml = undefined;
      this._cardError = undefined;
      const type = typeof this.item?.card?.type === 'string' ? this.item.card.type : undefined;
      if (type !== this._cardType) {
        // A new card: its own editor, if it has one; a blank one is pasted.
        this._cardType = type;
        this._noVisual = undefined;
        this._mode = type ? 'visual' : 'yaml';
      }
    }
  }

  private _fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /** Changes some settings; undefined or empty removes one. */
  private _set(changes: Partial<QuickDockConfig>): void {
    const next: Record<string, unknown> = { ...this.item!, ...changes };
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '') delete next[key];
    }
    this._fire('change', next);
  }

  private _applyYaml(): void {
    if (this._yaml === undefined) return;
    let parsed: unknown;
    try {
      parsed = load(this._yaml);
    } catch (e) {
      this._error = yamlError(e);
      return;
    }
    const item = typeof parsed === 'string' ? normalizeDock(parsed) : parsed;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      this._error = 'It needs something to open: “type: media”, an “entity”, a “card” or a “tile”';
      return;
    }
    const { type, visibility } = item as { type?: unknown; visibility?: unknown };
    // A card's own YAML pasted here would otherwise open its entity's controls.
    if (type !== undefined && type !== 'media') {
      this._error = 'That looks like a card on its own: put it under “card:”';
      return;
    }
    if (!dockKind(item as QuickDockConfig)) {
      this._error = 'It needs something to open: “type: media”, an “entity”, a “card” or a “tile”';
      return;
    }
    if (visibility !== undefined && !Array.isArray(visibility)) {
      this._error = 'visibility is a list of conditions, each starting with “- condition:”';
      return;
    }
    this._fire('change', item);
  }

  private _applyCard(): void {
    if (this._cardYaml === undefined) return;
    let card: unknown;
    try {
      card = load(this._cardYaml);
    } catch (e) {
      this._cardError = yamlError(e);
      return;
    }
    if (!card || typeof card !== 'object' || Array.isArray(card) || typeof (card as { type?: unknown }).type !== 'string') {
      this._cardError = 'A card needs a type, such as “type: thermostat”';
      return;
    }
    this._set({ card: card as Record<string, unknown> });
  }

  /** What it opens, in words. */
  private _opens(item: QuickDockConfig): string {
    switch (dockKind(item)) {
      case 'media':
        return 'What’s playing, with its controls.';
      case 'entity':
        return `${resolve(this.hass, item.entity!).name}’s controls, as its details show them.`;
      case 'card':
        return 'A Home Assistant card.';
      case 'tile':
        return `LuxFrame’s ${tileLabel(this.hass, item.tile!).toLowerCase()} tile.`;
      default:
        return '';
    }
  }

  private _renderCard(item: QuickDockConfig, card: Record<string, unknown>) {
    const typed = typeof card.type === 'string' && !!card.type;
    const visual = this._mode === 'visual' && !this._noVisual && typed;
    const glassy = item.glass !== false;
    return html`
      <h3>Card</h3>
      <div class="row" role="group" aria-label="Edit the card">
        <button class="chip ${visual ? 'on' : ''}" aria-pressed=${visual} ?disabled=${!!this._noVisual || !typed}
          @click=${() => (this._mode = 'visual')}>Visual editor</button>
        <button class="chip ${visual ? '' : 'on'}" aria-pressed=${!visual}
          @click=${() => (this._mode = 'yaml')}>YAML</button>
      </div>
      ${visual
        ? html`<luxframe-card-visual
            .hass=${this.hass}
            .card=${card}
            @change=${(e: CustomEvent<{ card: Record<string, unknown> }>) => this._set({ card: e.detail.card })}
            @unavailable=${(e: CustomEvent<{ message: string }>) => (this._noVisual = e.detail.message)}
          ></luxframe-card-visual>`
        : html`<textarea
              aria-label="Card YAML"
              spellcheck="false"
              autocapitalize="off"
              placeholder=${'type: thermostat\nentity: climate.living_room'}
              .value=${this._cardYaml ?? (typed ? dump(card, { lineWidth: -1 }) : '')}
              @input=${(e: Event) => {
                this._cardYaml = (e.target as HTMLTextAreaElement).value;
                this._cardError = undefined;
              }}
            ></textarea>
            <p class="hint muted">
              Paste a card from Home Assistant: open the card’s editor there and choose Show code editor.
            </p>
            ${this._cardError ? html`<p class="error" role="alert">${this._cardError}</p>` : nothing}
            <div class="row">
              <button class="chip on" ?disabled=${this._cardYaml === undefined} @click=${this._applyCard}>Apply</button>
            </div>`}
      ${this._noVisual ? html`<p class="hint muted">${this._noVisual}</p>` : nothing}

      <h3>Background</h3>
      <div class="row" role="group" aria-label="Background">
        <button class="chip ${glassy ? 'on' : ''}" aria-pressed=${glassy}
          @click=${() => this._set({ glass: undefined })}>Glass</button>
        <button class="chip ${glassy ? '' : 'on'}" aria-pressed=${!glassy}
          @click=${() => this._set({ glass: false })}>The card’s own</button>
      </div>
    `;
  }

  protected render() {
    const item = this.item;
    if (!item) return nothing;
    const kind = dockKind(item);
    const fallback = dockLabel(this.hass, { ...item, name: undefined });

    return html`
      <h3>Name</h3>
      <input
        type="text"
        aria-label="Name"
        placeholder=${fallback}
        .value=${item.name ?? ''}
        @change=${(e: Event) => this._set({ name: (e.target as HTMLInputElement).value.trim() })}
      />
      <p class="hint muted">${this._opens(item)}</p>

      <h3>Icon</h3>
      <input
        type="text"
        aria-label="Icon"
        autocapitalize="off"
        spellcheck="false"
        placeholder="mdi:coffee"
        .value=${item.icon ?? ''}
        @change=${(e: Event) => this._set({ icon: (e.target as HTMLInputElement).value.trim() })}
      />
      <p class="hint muted">
        Any Material Design icon. Left empty, it shows
        ${kind === 'media' ? 'a speaker, or the artwork playing' : 'its own'}.
      </p>

      <h3>When the panel comes down</h3>
      <div class="row" role="group" aria-label="When the panel comes down">
        <button class="chip ${item.open ? '' : 'on'}" aria-pressed=${!item.open}
          @click=${() => this._set({ open: undefined })}>In its turn</button>
        <button class="chip ${item.open ? 'on' : ''}" aria-pressed=${!!item.open}
          @click=${() => this._set({ open: true })}>Open this first</button>
      </div>
      <p class="hint muted">
        ${!item.visibility?.length
          ? 'The first item opens unless another is set to open first.'
          : item.open
            ? 'It shows only while its visibility conditions are met, and opens first only then.'
            : 'It shows only while its visibility conditions are met.'}
      </p>

      ${kind === 'card' ? this._renderCard(item, item.card!) : nothing}

      <h3>YAML</h3>
      <textarea
        aria-label="Dock item YAML"
        spellcheck="false"
        autocapitalize="off"
        .value=${this._yaml ?? dump(normalizeDock(compactDock(item)), { lineWidth: -1 })}
        @input=${(e: Event) => {
          this._yaml = (e.target as HTMLTextAreaElement).value;
          this._error = undefined;
        }}
      ></textarea>
      <p class="hint muted">
        ${kind === 'card' ? 'The whole item, its card included. ' : nothing}Add <code>visibility</code> to show it
        only sometimes, as on a dashboard card${kind === 'tile'
          ? html`, change the <code>tile</code>, or set its <code>height</code> in pixels`
          : nothing}.
      </p>
      ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
      <div class="row">
        <button class="chip on" ?disabled=${this._yaml === undefined} @click=${this._applyYaml}>Apply</button>
      </div>

      <h3>Position</h3>
      <div class="row">
        <button class="chip" ?disabled=${this.first} @click=${() => this._fire('move', -1)}>Move earlier</button>
        <button class="chip" ?disabled=${this.last} @click=${() => this._fire('move', 1)}>Move later</button>
      </div>

      <div class="row end">
        <button class="chip danger" @click=${() => this._fire('remove')}>Remove from the dock</button>
      </div>
    `;
  }

  static styles = [
    editorStyles,
    css`
      .hint {
        margin: 8px 0 0;
        font-size: 14px;
      }

      .end {
        margin-top: 24px;
      }

      textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 160px;
        padding: 12px 14px;
        border: 0;
        border-radius: 14px;
        background: rgb(127 127 127 / 16%);
        color: inherit;
        font: 14px/1.5 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        resize: vertical;
        tab-size: 2;
      }

      textarea::placeholder {
        color: var(--lf-faint);
      }

      .row + textarea {
        margin-top: 12px;
      }

      code {
        font: 13px ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      }

      .error {
        margin: 8px 0 0;
        color: #ff6961;
        font-size: 15px;
      }
    `,
  ];
}

define('luxframe-dock-editor', LuxFrameDockEditor);
