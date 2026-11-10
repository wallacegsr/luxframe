import { dump, load } from 'js-yaml';
import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { TOGGLEABLE, badgeRuns, badgeState } from '../badges';
import { define } from '../define';
import { domainOf, resolve } from '../entity';
import type { BadgeConfig, HomeAssistant } from '../types';
import { editorStyles } from './sheet';

/**
 * One badge's settings: its name, what a tap does, whether it shows on this
 * page or every page, its place, and removing it. Fires `change` with the
 * new badge, `scope` with 'page' or 'frame', `move` (-1 or 1) and `remove`.
 * The badge's YAML, below, takes everything else: visibility conditions,
 * an action and its data, an icon.
 */
export class LuxFrameBadgeEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    badge: { attribute: false },
    scope: {},
    first: { type: Boolean },
    last: { type: Boolean },
    _yaml: { state: true },
    _error: { state: true },
  };

  declare hass?: HomeAssistant;
  declare badge?: BadgeConfig;
  declare scope: 'page' | 'frame';
  declare first: boolean;
  declare last: boolean;
  /** The YAML while it's being edited, before Apply. */
  declare _yaml?: string;
  declare _error?: string;

  constructor() {
    super();
    this.scope = 'page';
    this.first = false;
    this.last = false;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('badge')) {
      this._yaml = undefined;
      this._error = undefined;
    }
  }

  private _applyYaml(): void {
    if (this._yaml === undefined) return;
    let badge: unknown;
    try {
      badge = load(this._yaml);
    } catch (e) {
      const reason = (e as { reason?: string }).reason;
      this._error = `That isn\u2019t valid YAML${reason ? ` (${reason})` : ''}`;
      return;
    }
    if (typeof badge === 'string' && /^\w+\.\w+$/.test(badge)) badge = { entity: badge };
    if (!badge || typeof badge !== 'object' || Array.isArray(badge)) {
      this._error = 'A badge needs an entity or an action, such as \u201centity: light.kitchen\u201d';
      return;
    }
    const { entity, action, visibility } = badge as BadgeConfig;
    if ((typeof entity !== 'string' || !entity) && (typeof action !== 'string' || !action)) {
      this._error = 'A badge needs an entity or an action, such as \u201centity: light.kitchen\u201d';
      return;
    }
    if (visibility !== undefined && !Array.isArray(visibility)) {
      this._error = 'visibility is a list of conditions, each starting with \u201c- condition:\u201d';
      return;
    }
    this._fire('change', badge);
  }

  private _fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /** The Shows chips: icon, name and state, each on or off, as Home Assistant's badges have them. */
  private _renderShows(badge: BadgeConfig) {
    const showState = badge.show_state !== false;
    const showName = badge.show_name ?? (!!badge.name || !showState);
    const showIcon = badge.show_icon !== false;
    const chip = (label: string, on: boolean, set: () => void) =>
      html`<button class="chip ${on ? 'on' : ''}" aria-pressed=${on} @click=${set}>${label}</button>`;
    // Something has to show: the last one on can't go off.
    const lastOn = (on: boolean) => on && [showIcon, showName, showState].filter(Boolean).length === 1;
    return html`<div class="row" role="group" aria-label="Shows">
      ${chip('Icon', showIcon, () => !lastOn(showIcon) && this._set({ show_icon: showIcon ? false : undefined }))}
      ${chip('Name', showName, () => !lastOn(showName) && this._set({ show_name: !showName }))}
      ${chip('State', showState, () => !lastOn(showState) && this._set({ show_state: showState ? false : undefined }))}
    </div>`;
  }

  /** What the state part says: the state, a time, or an attribute. */
  private _renderStateContent(badge: BadgeConfig) {
    const stateObj = badge.entity ? this.hass?.states[badge.entity] : undefined;
    const current = Array.isArray(badge.state_content)
      ? badge.state_content.join(',')
      : (badge.state_content ?? 'state');
    const attributes = Object.keys(stateObj?.attributes ?? {}).filter(
      (a) => !['friendly_name', 'icon', 'entity_picture', 'supported_features', 'event_types'].includes(a),
    );
    const options: Array<[string, string]> = [
      ['state', 'State'],
      ['last_changed', 'Last changed'],
      ['last_updated', 'Last updated'],
      ...attributes.map((a): [string, string] => [a, a.replace(/_/g, ' ')]),
    ];
    if (!options.some(([v]) => v === current)) options.push([current, current]);
    return html`<select
        aria-label="State shows"
        @change=${(e: Event) => {
          const value = (e.target as HTMLSelectElement).value;
          this._set({ state_content: value === 'state' ? undefined : value.includes(',') ? value.split(',') : value });
        }}
      >
        ${options.map(([value, label]) => html`<option value=${value} ?selected=${value === current}>${label}</option>`)}
      </select>
      ${stateObj ? html`<p class="hint muted">Now: ${badgeState(this.hass, stateObj, badge.state_content) || '—'}</p>` : nothing}`;
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
        placeholder=${runs || badge.show_name || badge.show_state === false ? entityName : 'Not shown, only the state'}
        .value=${badge.name ?? ''}
        @change=${(e: Event) => this._set({ name: (e.target as HTMLInputElement).value.trim() })}
      />

      ${runs
        ? nothing
        : html`<h3>Shows</h3>
            ${this._renderShows(badge)}
            ${badge.entity && badge.show_state !== false
              ? html`<h3>State shows</h3>
                  ${this._renderStateContent(badge)}`
              : nothing}`}

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

      <h3>YAML</h3>
      <textarea
        aria-label="Badge YAML"
        spellcheck="false"
        autocapitalize="off"
        .value=${this._yaml ?? dump(badge, { lineWidth: -1 })}
        @input=${(e: Event) => {
          this._yaml = (e.target as HTMLTextAreaElement).value;
          this._error = undefined;
        }}
      ></textarea>
      <p class="hint muted">
        ${badge.visibility?.length ? 'Shows only while its visibility conditions are met. ' : ''}Add
        <code>visibility</code> to show it only sometimes, as on a dashboard card; <code>action</code> and
        <code>data</code> to call a service; <code>icon</code> for another icon. Home Assistant's
        <code>show_name</code>, <code>show_state</code>, <code>show_icon</code> and
        <code>state_content</code> work as on its badges.
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
        <button class="chip danger" @click=${() => this._fire('remove')}>Remove badge</button>
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

      .end {
        margin-top: 24px;
      }

      select {
        box-sizing: border-box;
        width: 100%;
        height: 48px;
        padding: 0 14px;
        border: 0;
        border-radius: 14px;
        background: rgb(127 127 127 / 16%);
        color: inherit;
        font: inherit;
        font-size: 17px;
      }

      option {
        color: initial;
      }

      textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 140px;
        padding: 12px 14px;
        border: 0;
        border-radius: 14px;
        background: rgb(127 127 127 / 16%);
        color: inherit;
        font: 14px/1.5 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        resize: vertical;
        tab-size: 2;
      }

      code {
        font: 13px ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      }

      .error {
        margin: 8px 0 0;
        color: var(--lf-danger);
        font-size: 15px;
      }
    `,
  ];
}

define('luxframe-badge-editor', LuxFrameBadgeEditor);
