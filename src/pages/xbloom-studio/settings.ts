import { css, html, nothing } from 'lit';
import { define } from '../../define';
import { icon } from '../../icons';
import { controls, sectionLabel } from '../../theme';
import { BUSY, CHEVRON, StudioBase, isTea, studioStyles, xbDo, type Recipe } from './shared';

/**
 * The Settings tab: the connection and the machine's mode and units, the
 * three Easy slots on the machine's own buttons, refreshing and restoring
 * recipes, how-tos for descaling and calibrating the scale, and the firmware.
 */

/** Maintenance, step by step, in our own words. */
const GUIDES: Array<{ title: string; when: string; steps: string[] }> = [
  {
    title: 'Descale',
    when: 'Every month or two, sooner with hard water, or when the machine asks.',
    steps: [
      'Mix descaler with water in the tank, as the descaler’s pack says.',
      'Put a large jug under the brewer, without a dripper.',
      'Start descaling from the machine’s own settings menu and let it run through.',
      'Empty the tank, rinse it, fill it with clean water and run the rinse it asks for.',
    ],
  },
  {
    title: 'Calibrate the scale',
    when: 'When weights look off, or after moving the machine.',
    steps: [
      'Clear the scale and set the machine on a level, steady surface.',
      'Start scale calibration from the machine’s own settings menu.',
      'When it asks, put the weight it names in the middle of the scale.',
      'Wait for it to finish, take the weight off, and tare.',
    ],
  },
];

export class LuxFrameXBloomSettings extends StudioBase {
  static properties = {
    ...StudioBase.properties,
    recipes: { attribute: false },
    _slot: { state: true },
    _slotRecipe: { state: true },
    _guide: { state: true },
    _message: { state: true },
  };

  declare recipes?: Recipe[];
  declare _slot: string;
  declare _slotRecipe?: string;
  declare _guide?: string;
  declare _message?: string;

  constructor() {
    super();
    this._slot = 'A';
  }

  protected render() {
    return html`
      <div class="cols">
        <div class="stack">${this._connection()}${this._slots()}</div>
        <div class="stack">${this._recipes()}${this._maintenance()}${this._device()}</div>
      </div>
    `;
  }

  private _switchRow(key: string, label: string, note?: string) {
    const s = this._state(key);
    if (!s) return nothing;
    const on = s.state === 'on';
    return html`<div class="row">
      <span>${label}${note ? html`<span class="sub muted">${note}</span>` : nothing}</span>
      <button class="chip ${on ? 'on' : ''}" role="switch" aria-checked=${on} ?disabled=${s.state === 'unavailable'}
        @click=${() => this._toggle(key)}>${on ? 'On' : 'Off'}</button>
    </div>`;
  }

  private _selectRow(key: string, label: string) {
    const s = this._state(key);
    if (!s) return nothing;
    return html`<div class="row"><span>${label}</span>${this._chips(s, true)}</div>`;
  }

  private _connection() {
    const range = this._state('binary_sensor.in_range');
    return html`<section class="panel glass">
      <h2>Connection</h2>
      ${range
        ? html`<div class="kv"><span>Bluetooth</span><span>${range.state === 'on' ? 'In range' : 'Out of range'}</span></div>`
        : nothing}
      ${this._switchRow('switch.connect', 'Stay connected', 'Keeps the Bluetooth link open between brews.')}
      ${this._switchRow('switch.machine_control', 'Control from Home Assistant', 'Off leaves the machine to its own buttons.')}
      ${this._selectRow('select.mode', 'Mode')}
      ${this._selectRow('select.water_source', 'Water')}
      ${this._selectRow('select.temperature_unit', 'Temperature')}
      ${this._selectRow('select.weight_unit', 'Weight')}
      <div class="actions">
        ${this.entities['button.refresh_status']
          ? html`<button class="pill glass" @click=${() => this._press('button.refresh_status')}>Refresh status</button>`
          : nothing}
        ${this.entities['button.ble_connect']
          ? html`<button class="pill glass" @click=${() => this._press('button.ble_connect')}>Reconnect</button>`
          : nothing}
        ${this.entities['button.ble_disconnect']
          ? html`<button class="pill glass" @click=${() => this._press('button.ble_disconnect')}>Disconnect</button>`
          : nothing}
      </div>
    </section>`;
  }

  /** Easy slots: a recipe on each of the machine's own A, B and C buttons. */
  private _slots() {
    const recipes = (this.recipes ?? []).filter((r) => !isTea(r)).sort((a, b) => a.name.localeCompare(b.name));
    const busy = BUSY.includes(this._state('sensor.brew_status')?.state ?? '');
    return html`<section class="panel glass">
      <h2>Easy slots</h2>
      <p class="note top">The machine’s A, B and C buttons each brew a saved recipe, no phone needed. Pick a slot and a recipe to put there.</p>
      <div class="chips gap-s" role="radiogroup" aria-label="Slot">
        ${['A', 'B', 'C'].map(
          (slot) => html`<button class="chip slot ${this._slot === slot ? 'on' : ''}" role="radio" aria-checked=${this._slot === slot}
            @click=${() => (this._slot = slot)}>Slot ${slot}</button>`,
        )}
      </div>
      ${!this.recipes
        ? html`<p class="note">Loading recipes…</p>`
        : recipes.length
          ? html`<ul class="options" role="radiogroup" aria-label="Recipe for slot ${this._slot}" data-no-swipe>
              ${recipes.map(
                (r) => html`<li>
                  <button role="radio" aria-checked=${r.name === this._slotRecipe} class=${r.name === this._slotRecipe ? 'chosen' : ''}
                    @click=${() => (this._slotRecipe = r.name)}>
                    <span>${r.name}</span>${r.name === this._slotRecipe ? icon('check', 22) : nothing}
                  </button>
                </li>`,
              )}
            </ul>`
          : html`<p class="note">No coffee recipes yet.</p>`}
      <div class="actions">
        <button class="pill on" ?disabled=${!this._slotRecipe || busy} @click=${() => this._write()}>
          Write to slot ${this._slot}
        </button>
      </div>
      ${this._message ? html`<p class="note" role="status">${this._message}</p>` : nothing}
    </section>`;
  }

  private async _write(): Promise<void> {
    const slot = this._slot;
    const name = this._slotRecipe;
    if (!name) return;
    this._message = `Writing “${name}” to slot ${slot}…`;
    try {
      await xbDo(this.hass, 'write_slot', { slot, recipe_name: name });
      this._message = `Slot ${slot} now brews “${name}”.`;
    } catch (err) {
      this._message = `Slot ${slot} wasn’t written: ${err instanceof Error ? err.message : err}`;
    }
  }

  private _recipes() {
    const archived = this._state('select.archived_recipe');
    const options: string[] = archived?.attributes.options ?? [];
    const chosen = archived ? this._chosen(archived) : undefined;
    const usable = archived && options.includes(chosen ?? '');
    return html`<section class="panel glass">
      <h2>Recipes</h2>
      <div class="row">
        <span>Recipes from xBloom<span class="sub muted">Fetches your recipes again from the xBloom cloud.</span></span>
        <button class="pill glass" ?disabled=${!this.entities['button.refresh_recipes']} @click=${() => {
          this._press('button.refresh_recipes');
          window.setTimeout(() => this._reload(), 1500);
        }}>Refresh</button>
      </div>
      ${archived
        ? html`<h3 class="gap">Archived</h3>
            ${options.length
              ? html`<ul class="options" role="radiogroup" aria-label="Archived recipe" data-no-swipe>
                  ${options.map(
                    (o) => html`<li>
                      <button role="radio" aria-checked=${o === chosen} class=${o === chosen ? 'chosen' : ''}
                        @click=${() => this._choose(archived, o)}>
                        <span>${this._label(archived, o)}</span>${o === chosen ? icon('check', 22) : nothing}
                      </button>
                    </li>`,
                  )}
                </ul>
                <div class="actions">
                  <button class="pill glass" ?disabled=${!usable || !this.entities['button.restore_archived_recipe']}
                    @click=${() => {
                      this._press('button.restore_archived_recipe');
                      window.setTimeout(() => this._reload(), 1500);
                    }}>Restore</button>
                </div>`
              : html`<p class="note">Nothing archived. Archive a recipe from its page to tuck it away here.</p>`}`
        : nothing}
    </section>`;
  }

  private _maintenance() {
    return html`<section class="panel glass">
      <h2>Maintenance</h2>
      ${GUIDES.map((g) => {
        const open = this._guide === g.title;
        return html`<div class="guide">
          <button class="guide-head" aria-expanded=${open} @click=${() => (this._guide = open ? undefined : g.title)}>
            <span>${g.title}<span class="sub muted">${g.when}</span></span>
            <span class="turn ${open ? 'open' : ''}">${CHEVRON}</span>
          </button>
          ${open ? html`<ol class="steps">${g.steps.map((s) => html`<li>${s}</li>`)}</ol>` : nothing}
        </div>`;
      })}
      <p class="note">Both run from the machine itself; xBloom Studio can’t start them.</p>
    </section>`;
  }

  private _device() {
    const updateKey = Object.keys(this.entities).find((k) => k.startsWith('update.'));
    const update = updateKey ? this._state(updateKey) : undefined;
    const anyId = this.entities['sensor.brew_status'];
    const deviceId = anyId ? this.hass?.entities?.[anyId]?.device_id : undefined;
    const device = (deviceId ? this.hass?.devices?.[deviceId] : undefined) as
      | { name?: string; name_by_user?: string; model?: string; manufacturer?: string; sw_version?: string }
      | undefined;
    const installed = update?.attributes.installed_version ?? device?.sw_version;
    const latest = update?.attributes.latest_version;
    const available = update?.state === 'on';
    const installing = Boolean(update?.attributes.in_progress);
    if (!update && !device) return nothing;
    return html`<section class="panel glass">
      <h2>Machine</h2>
      ${device?.name_by_user || device?.name ? html`<div class="kv"><span>Name</span><span>${device.name_by_user || device.name}</span></div>` : nothing}
      ${device?.model ? html`<div class="kv"><span>Model</span><span>${device.model}</span></div>` : nothing}
      ${installed ? html`<div class="kv"><span>Firmware</span><span>${installed}</span></div>` : nothing}
      ${available && latest ? html`<div class="kv"><span>Available</span><span>${latest}</span></div>` : nothing}
      ${update
        ? html`<div class="actions">
            ${available
              ? html`<button class="pill on" ?disabled=${installing} @click=${() =>
                  this.hass?.callService('update', 'install', { entity_id: update.entity_id })}>
                  ${installing ? 'Installing…' : 'Install update'}
                </button>`
              : html`<span class="muted">${update.state === 'off' ? 'Up to date' : 'Update status unknown'}</span>`}
          </div>`
        : nothing}
    </section>`;
  }

  static styles = [
    controls,
    sectionLabel,
    studioStyles,
    css`
      .sub {
        display: block;
        margin-top: 2px;
        font-size: 14px;
      }

      .row > span:first-child {
        flex: 1 1 180px;
      }

      .note.top {
        margin: 0 0 14px;
      }

      .gap-s {
        margin-bottom: 4px;
      }

      .guide + .guide {
        border-top: 1px solid var(--lf-control-row);
      }

      .guide-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        min-height: 64px;
        padding: 8px 0;
        background: none;
        font-size: 17px;
        text-align: left;
      }

      .turn {
        display: grid;
        flex: none;
        color: var(--lf-muted);
        transform: rotate(-90deg);
        transition: transform var(--lf-move);
      }

      .turn svg {
        width: 24px;
        height: 24px;
      }

      .turn.open {
        transform: none;
      }

      .steps {
        margin: 0 0 14px;
        padding-left: 22px;
        color: var(--lf-muted);
        line-height: 1.5;
      }

      .steps li + li {
        margin-top: 6px;
      }

      .actions .muted {
        align-self: center;
      }
    `,
  ];
}

define('luxframe-xbloom-settings', LuxFrameXBloomSettings);
