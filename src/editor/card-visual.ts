import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { define } from '../define';
import type { HomeAssistant } from '../types';

/** A card's own visual editor, as Home Assistant's card dialog shows it. */
interface ConfigEditor extends HTMLElement {
  hass?: HomeAssistant;
  lovelace?: unknown;
  setConfig(config: Record<string, unknown>): void;
}

interface CardClass {
  getConfigElement?: () => Promise<ConfigEditor> | ConfigEditor;
}

/** "thermostat" → "hui-thermostat-card"; "custom:mushroom-light-card" → "mushroom-light-card". */
function cardTag(type: string): string {
  return type.startsWith('custom:') ? type.slice(7) : `hui-${type}-card`;
}

const DEFINE_WAIT_MS = 4000;

/**
 * The dashboard's lovelace object, which some editors (stacks, conditional
 * cards) pass on to the editors of the cards inside them. It lives on
 * Home Assistant's `hui-root`, a few shadow roots up.
 */
function findLovelace(): unknown {
  const seen = new Set<Node>();
  const queue: Array<Document | ShadowRoot | Element> = [document];
  while (queue.length) {
    const root = queue.shift()!;
    const hit = root.querySelector?.('hui-root') as (Element & { lovelace?: unknown }) | null;
    if (hit?.lovelace) return hit.lovelace;
    for (const el of root.querySelectorAll?.('*') ?? []) {
      if (el.shadowRoot && !seen.has(el.shadowRoot)) {
        seen.add(el.shadowRoot);
        queue.push(el.shadowRoot);
      }
    }
    if (seen.size > 400) break;
  }
  return undefined;
}

/**
 * Shows a card's visual editor, the same one Home Assistant's card dialog
 * uses: built-in cards' and custom cards' own `getConfigElement()`. Fires
 * `change` with the card's new config, and `unavailable` when the card has
 * no visual editor or the editor can't show this config.
 */
export class LuxFrameCardVisual extends LitElement {
  static properties = {
    hass: { attribute: false },
    card: { attribute: false },
    _status: { state: true },
    _message: { state: true },
  };

  declare hass?: HomeAssistant;
  declare card?: Record<string, unknown>;
  declare _status: 'loading' | 'ready' | 'none';
  declare _message?: string;

  private _editor?: ConfigEditor;
  /** The card type the editor was made for. */
  private _type?: string;
  /** The config the editor last sent, so it isn't handed straight back. */
  private _sent?: string;

  constructor() {
    super();
    this._status = 'loading';
  }

  protected willUpdate(changed: PropertyValues): void {
    const type = typeof this.card?.type === 'string' ? this.card.type : undefined;
    if (type !== this._type) {
      this._type = type;
      void this._load(type);
      return;
    }
    if (changed.has('hass') && this._editor) this._editor.hass = this.hass;
    if (changed.has('card') && this._editor && this.card && JSON.stringify(this.card) !== this._sent) {
      this._configure(this.card);
    }
  }

  private _none(message: string): void {
    this._editor = undefined;
    this._status = 'none';
    this._message = message;
    this.dispatchEvent(new CustomEvent('unavailable', { detail: { message } }));
  }

  private async _load(type: string | undefined): Promise<void> {
    this._editor = undefined;
    this._status = 'loading';
    if (!type) return this._none('Paste the card’s YAML first.');
    const tag = cardTag(type);
    let cls = customElements.get(tag) as (CustomElementConstructor & CardClass) | undefined;
    if (!cls && window.loadCardHelpers) {
      // Home Assistant defines its own cards as they're first made.
      try {
        (await window.loadCardHelpers()).createCardElement({ ...this.card });
      } catch {
        // Still waiting on it below.
      }
      await Promise.race([
        customElements.whenDefined(tag),
        new Promise((r) => setTimeout(r, DEFINE_WAIT_MS)),
      ]);
      cls = customElements.get(tag) as (CustomElementConstructor & CardClass) | undefined;
    }
    if (type !== this._type) return;
    if (!cls?.getConfigElement) return this._none('This card has no visual editor.');

    let editor: ConfigEditor;
    try {
      editor = await cls.getConfigElement();
    } catch (e) {
      return this._none(`Its visual editor didn’t load (${(e as Error)?.message ?? e}).`);
    }
    if (type !== this._type) return;
    editor.hass = this.hass;
    editor.lovelace = findLovelace();
    editor.addEventListener('config-changed', (e) => {
      e.stopPropagation();
      const config = (e as CustomEvent<{ config?: Record<string, unknown> }>).detail?.config;
      if (!config || typeof config.type !== 'string') return;
      this._sent = JSON.stringify(config);
      this.dispatchEvent(new CustomEvent('change', { detail: { card: config } }));
    });
    this._editor = editor;
    if (this.card) this._configure(this.card);
  }

  /** Hands the editor a config; one it can't show sends the user to YAML. */
  private _configure(card: Record<string, unknown>): void {
    try {
      this._editor!.setConfig(structuredClone(card));
      this._status = 'ready';
      this._message = undefined;
    } catch (e) {
      this._none(`This card’s settings go beyond its visual editor (${(e as Error)?.message ?? e}).`);
    }
  }

  protected render() {
    if (this._status === 'loading') return html`<p class="muted">Loading the card’s editor…</p>`;
    if (this._status === 'none') return html`<p class="muted">${this._message} Use YAML instead.</p>`;
    return html`<div class="editor">${this._editor ?? nothing}</div>`;
  }

  /*
   * Home Assistant's editors read its theme variables; these keep them
   * readable on LuxFrame's sheet, whichever theme each side is in.
   */
  static styles = css`
    :host {
      display: block;
    }

    .muted {
      margin: 8px 0 0;
      color: var(--lf-muted);
      font-size: 15px;
    }

    .editor {
      --primary-text-color: var(--lf-text);
      --secondary-text-color: var(--lf-muted);
      --primary-background-color: var(--lf-sheet);
      --secondary-background-color: color-mix(in srgb, var(--lf-text) 8%, var(--lf-sheet));
      --card-background-color: var(--lf-sheet);
      --mdc-theme-surface: var(--lf-sheet);
      --input-fill-color: color-mix(in srgb, var(--lf-text) 8%, transparent);
      --divider-color: color-mix(in srgb, var(--lf-text) 14%, transparent);
      color: var(--lf-text);
    }
  `;
}

define('luxframe-card-visual', LuxFrameCardVisual);
