import { LitElement, css, html, nothing } from 'lit';
import { TOGGLEABLE, badgeRuns } from '../badges';
import { define } from '../define';
import { domainOf, resolve } from '../entity';
import type { BadgeConfig, HomeAssistant } from '../types';
import { editorStyles } from './sheet';

/**
 * One badge's settings: its name, what a tap does, whether it shows on this
 * page or every page, its place, and removing it. Fires `change` with the
 * new badge, `scope` with 'page' or 'frame', `move` (-1 or 1) and `remove`.
 * Visibility conditions and actions are YAML-only; they're noted here.
 */
export class LuxFrameBadgeEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    badge: { attribute: false },
    scope: {},
    first: { type: Boolean },
    last: { type: Boolean },
  };

  declare hass?: HomeAssistant;
  declare badge?: BadgeConfig;
  declare scope: 'page' | 'frame';
  declare first: boolean;
  declare last: boolean;

  constructor() {
    super();
    this.scope = 'page';
    this.first = false;
    this.last = false;
  }

  private _fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  private _set(changes: Partial<BadgeConfig>): void {
    const next: Record<string, unknown> = { ...this.badge!, ...changes };
    for (const [key, value] of Object.entries(changes)) if (value === undefined || value === '') delete next[key];
    this._fire('change', next);
  }

  protected render() {
    const badge = this.badge;
    if (!badge) return nothing;
    const runs = badgeRuns(badge);
    const domain = badge.entity ? domainOf(badge.entity) : '';
    const entityName = badge.entity ? resolve(this.hass, badge.entity).name : (badge.action ?? '');
    const toggleable = !runs && TOGGLEABLE.has(domain);
    const guarded = domain === 'lock' || domain === 'cover';
    const tap = badge.tap ?? 'details';

    return html`
      <h3>Name</h3>
      <input
        type="text"
        aria-label="Name"
        placeholder=${runs ? entityName : 'Not shown, only the state'}
        .value=${badge.name ?? ''}
        @change=${(e: Event) => this._set({ name: (e.target as HTMLInputElement).value.trim() })}
      />

      <h3>Tap</h3>
      ${runs
        ? html`<p class="hint muted">Runs ${entityName}, then shows Done.</p>`
        : html`<div class="row" role="group" aria-label="Tap">
              <button class="chip ${tap === 'details' ? 'on' : ''}" aria-pressed=${tap === 'details'}
                @click=${() => this._set({ tap: undefined })}>Open details</button>
              ${toggleable
                ? html`<button class="chip ${tap === 'toggle' ? 'on' : ''}" aria-pressed=${tap === 'toggle'}
                    @click=${() => this._set({ tap: 'toggle' })}>Switch on/off</button>`
                : nothing}
            </div>
            ${toggleable && guarded && tap === 'toggle'
              ? html`<p class="hint muted">Locks, garage doors and gates still open their details first.</p>`
              : nothing}`}

      <h3>Shows on</h3>
      <div class="row" role="group" aria-label="Shows on">
        <button class="chip ${this.scope === 'page' ? 'on' : ''}" aria-pressed=${this.scope === 'page'}
          @click=${() => this.scope !== 'page' && this._fire('scope', 'page')}>This page</button>
        <button class="chip ${this.scope === 'frame' ? 'on' : ''}" aria-pressed=${this.scope === 'frame'}
          @click=${() => this.scope !== 'frame' && this._fire('scope', 'frame')}>Every page</button>
      </div>

      ${badge.visibility?.length || badge.action
        ? html`<p class="hint muted">
            ${badge.visibility?.length ? 'Shows only while its visibility conditions are met. ' : ''}
            ${badge.action ? `Calls ${badge.action}. ` : ''}Change these in the YAML.
          </p>`
        : nothing}

      <h3>Position</h3>
      <div class="row">
        <button class="chip" ?disabled=${this.first} @click=${() => this._fire('move', -1)}>Move earlier</button>
        <button class="chip" ?disabled=${this.last} @click=${() => this._fire('move', 1)}>Move later</button>
      </div>

      <div class="row end">
        <button class="chip danger" @click=${() => this._fire('remove')}>Remove badge</button>
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
    `,
  ];
}

define('luxframe-badge-editor', LuxFrameBadgeEditor);
