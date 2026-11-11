import { css, html, nothing, type PropertyValues } from 'lit';
import { define } from '../../define';
import { controls, pageStyles, sectionLabel } from '../../theme';
import './brew';
import './manual';
import './recipes';
import type { LuxFrameXBloomRecipes } from './recipes';
import './settings';
import { DOTS, RELOAD_EVENT, StudioBase, TAB_EVENT, xbAsk, type Recipe } from './shared';

export { studioEntities, type StudioEntities } from './shared';

/**
 * The xBloom page with the xBloom Studio integration (Alshekhi/xbloom-studio),
 * which has no panel of its own: built from its entities and services, in
 * four tabs. Brew: the machine now and the recipe to brew. Recipes: My
 * recipes and the community hub. Manual: the grinder, brewer and scale on
 * their own. Settings: connection, Easy slots, archived recipes, maintenance
 * and firmware.
 */

const TABS = ['brew', 'recipes', 'manual', 'settings'] as const;
type Tab = (typeof TABS)[number];
const TAB_NAMES: Record<Tab, string> = { brew: 'Brew', recipes: 'Recipes', manual: 'Manual', settings: 'Settings' };

/** Machine Status problems, in words. */
const PROBLEMS: Record<string, string> = {
  no_water: 'The water tank is empty. Fill it to brew.',
  no_beans: 'The grinder is out of beans.',
  dose_water_error: 'The machine couldn’t dose the water. Check the tank and the water line.',
  gear_position_error: 'The grinder’s gear is out of place. Check the grinder.',
};

export class LuxFrameXBloomStudio extends StudioBase {
  static properties = {
    ...StudioBase.properties,
    tab: {},
    _tab: { state: true },
    _recipes: { state: true },
    _loadError: { state: true },
  };

  /** The tab to open on. */
  declare tab?: string;
  declare _tab: Tab;
  declare _recipes?: Recipe[];
  declare _loadError?: string;

  /** The Recipe select's options when the recipes were last fetched. */
  private _fetchedFor?: string;
  private _loading = false;

  constructor() {
    super();
    this._tab = 'brew';
    this.addEventListener(TAB_EVENT, (e) => {
      const tab = (e as CustomEvent<string>).detail as Tab;
      if (TABS.includes(tab)) this._show(tab);
    });
    this.addEventListener(RELOAD_EVENT, () => this._fetch());
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('tab') && TABS.includes(this.tab as Tab)) this._tab = this.tab as Tab;
    if (changed.has('hass') && this.hass) {
      // xBloom Studio's Recipe select lists every recipe by name, so a change
      // there means recipes were added, renamed or removed.
      const options = JSON.stringify(this._state('select.recipe')?.attributes.options ?? []);
      if (options !== this._fetchedFor) {
        this._fetchedFor = options;
        this._fetch();
      }
    }
  }

  private _show(tab: Tab): void {
    this._tab = tab;
    this.scrollIntoView?.({ block: 'start' });
  }

  private async _fetch(): Promise<void> {
    if (this._loading) return;
    this._loading = true;
    try {
      const result = await xbAsk<{ recipes?: Recipe[] }>(this.hass, 'list_recipes');
      this._recipes = (result?.recipes ?? []).filter((r) => r && typeof r.name === 'string');
      this._loadError = undefined;
    } catch (err) {
      this._loadError = `Recipes didn’t load: ${err instanceof Error ? err.message : err}`;
    } finally {
      this._loading = false;
    }
  }

  protected render() {
    return html`
      <div class="head">
        <h1>xBloom</h1>
        ${this._presence()}
      </div>
      <nav class="tabs" role="tablist" aria-label="xBloom" data-no-swipe>
        ${TABS.map(
          (t) => html`<button role="tab" class="chip ${this._tab === t ? 'on' : ''}" aria-selected=${this._tab === t}
            @click=${() => {
              if (t === 'recipes' && this._tab === 'recipes') {
                this.renderRoot.querySelector<LuxFrameXBloomRecipes>('luxframe-xbloom-recipes')?.openRecipe('');
              }
              this._show(t);
            }}>${DOTS[t]}${TAB_NAMES[t]}</button>`,
        )}
      </nav>
      ${this._problem()}
      ${this._page()}
    `;
  }

  private _page() {
    switch (this._tab) {
      case 'recipes':
        return html`<luxframe-xbloom-recipes .hass=${this.hass} .entities=${this.entities} .recipes=${this._recipes}
          .loadError=${this._loadError}></luxframe-xbloom-recipes>`;
      case 'manual':
        return html`<luxframe-xbloom-manual .hass=${this.hass} .entities=${this.entities}></luxframe-xbloom-manual>`;
      case 'settings':
        return html`<luxframe-xbloom-settings .hass=${this.hass} .entities=${this.entities}
          .recipes=${this._recipes}></luxframe-xbloom-settings>`;
      default:
        return html`<luxframe-xbloom-brew .hass=${this.hass} .entities=${this.entities}></luxframe-xbloom-brew>`;
    }
  }

  /** In range or not, and the connection switch. */
  private _presence() {
    const range = this._state('binary_sensor.in_range');
    const connect = this._state('switch.connect');
    const near = range?.state === 'on';
    return html`
      <div class="presence">
        ${range
          ? html`<span class="dot ${near ? 'near' : ''}"></span>
              <span class="muted">${near ? 'In range' : 'Out of range'}</span>`
          : nothing}
        ${connect
          ? html`<button class="chip ${connect.state === 'on' ? 'on' : ''}" aria-pressed=${connect.state === 'on'}
              ?disabled=${connect.state === 'unavailable'} @click=${() => this._toggle('switch.connect')}>
              ${connect.state === 'on' ? 'Connected' : 'Connect'}
            </button>`
          : nothing}
      </div>
    `;
  }

  private _problem() {
    const machine = this._usable('sensor.machine_status');
    if (!machine || machine.state === 'ok') return nothing;
    const text = PROBLEMS[machine.state] ?? this._label(machine, machine.state);
    return html`<div class="banner" role="alert">${text}</div>`;
  }

  static styles = [
    pageStyles,
    controls,
    sectionLabel,
    css`
      :host {
        display: block;
        padding-bottom: 64px;
      }

      .head {
        align-items: center;
      }

      .presence {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-left: auto;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--lf-faint);
      }

      .dot.near {
        background: var(--lf-success);
      }

      .tabs {
        display: flex;
        gap: 8px;
        margin-bottom: var(--lf-gap);
        overflow-x: auto;
        scrollbar-width: none;
      }

      .tabs .chip {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding-inline: 18px;
      }

      .tabs .dots {
        width: 16px;
        height: 16px;
        opacity: 0.75;
      }

      .tabs .chip.on .dots {
        opacity: 1;
      }

      .banner {
        margin-bottom: var(--lf-gap);
        padding: 14px 18px;
        border-radius: var(--lf-radius-s);
        color: #fff;
        background: color-mix(in srgb, var(--lf-danger) 82%, transparent);
        font-weight: 500;
      }
    `,
  ];
}

define('luxframe-xbloom-studio', LuxFrameXBloomStudio);
