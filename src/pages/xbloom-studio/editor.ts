import { LitElement, css, html, nothing } from 'lit';
import { define } from '../../define';
import { formatNumber } from '../../history';
import { icon } from '../../icons';
import { controls, sectionLabel } from '../../theme';
import type { HomeAssistant } from '../../types';
import {
  BACK,
  CHEVRON,
  CUPS,
  CUP_DOSE,
  PATTERN_API,
  PATTERN_ICONS,
  UP,
  grindOf,
  hasBypass,
  humanize,
  patternOf,
  ratioOf,
  rpmOf,
  studioStyles,
  tempLabel,
  xbAsk,
  type Recipe,
} from './shared';

/**
 * Making or changing a recipe: its name, cup, dose, ratio, grind and grinder
 * speed, each pour (water, temperature, flow, pattern, wait), and bypass
 * water. Saved through xBloom Studio's `add_recipe` or `update_recipe`, which
 * check it the way the xBloom app does: the pours must add up to the dose
 * times the ratio. Fires `saved` (detail: the name) or `close`.
 */

interface DraftPour {
  name?: string;
  volume_ml: number;
  temperature_c: number;
  flow_rate: number;
  pause_s: number;
  pattern: number;
}

interface Draft {
  id?: string | number;
  name: string;
  cup_type: number;
  dose_g: number;
  ratio: number;
  grind: number;
  rpm: number;
  pours: DraftPour[];
  bypass: boolean;
  bypass_volume_ml: number;
  bypass_temp_c: number;
}

const MAX_POURS = 9;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const round = (v: number, step: number) => Math.round(v / step) * step;

/** A recipe as the editor holds it, with every field filled. */
export function draftOf(r: Recipe | undefined, copy = false): Draft {
  const cup = Number(r?.cup_type) in CUPS ? Number(r!.cup_type) : 2;
  return {
    id: copy ? undefined : r?.id,
    name: r ? (copy ? `${r.name} copy` : r.name) : '',
    cup_type: cup,
    dose_g: Number(r?.dose_g ?? 15),
    ratio: ratioOf(r ?? { name: '' }) ?? 16,
    grind: Number(r ? grindOf(r) ?? 40 : 40),
    rpm: Number(r ? rpmOf(r) ?? 90 : 90),
    pours: (r?.pours?.length ? r.pours : [{}, {}, {}]).map((p, i, all) => ({
      name: p.name,
      volume_ml: Number(p.volume_ml ?? Math.round(240 / all.length)),
      temperature_c: Number(p.temperature_c ?? 92),
      flow_rate: Number(p.flow_rate ?? 3),
      pause_s: Math.round(Number(p.pause_s ?? (i === 0 ? 30 : 0))),
      pattern: PATTERN_API[patternOf(p.pattern) ?? 'spiral'],
    })),
    bypass: r ? hasBypass(r) : false,
    bypass_volume_ml: Number(r?.bypass_volume_ml ?? 30),
    bypass_temp_c: Number(r?.bypass_temp_c ?? 92),
  };
}

export class LuxFrameXBloomEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    recipe: { attribute: false },
    copy: { type: Boolean },
    _draft: { state: true },
    _saving: { state: true },
    _error: { state: true },
  };

  declare hass?: HomeAssistant;
  /** The recipe to change, or to copy; none for a new one. */
  declare recipe?: Recipe;
  declare copy: boolean;
  declare _draft: Draft;
  declare _saving: boolean;
  declare _error?: string;

  constructor() {
    super();
    this.copy = false;
    this._saving = false;
    this._draft = draftOf(undefined);
  }

  protected willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('recipe') || changed.has('copy')) this._draft = draftOf(this.recipe, this.copy);
  }

  private _set(patch: Partial<Draft>): void {
    this._draft = { ...this._draft, ...patch };
    this._error = undefined;
  }

  private _setPour(i: number, patch: Partial<DraftPour>): void {
    const pours = this._draft.pours.map((p, j) => (j === i ? { ...p, ...patch } : p));
    this._set({ pours });
  }

  private _movePour(i: number, by: number): void {
    const pours = [...this._draft.pours];
    const [p] = pours.splice(i, 1);
    pours.splice(i + by, 0, p);
    this._set({ pours });
  }

  private get _water(): number {
    return Math.round(this._draft.dose_g * this._draft.ratio * 10) / 10;
  }

  private get _poured(): number {
    return this._draft.pours.reduce((t, p) => t + p.volume_ml, 0);
  }

  /** Make the last pour take up the difference, so the pours add up. */
  private _fit(): void {
    const pours = [...this._draft.pours];
    const last = pours.length - 1;
    const rest = this._poured - pours[last].volume_ml;
    pours[last] = { ...pours[last], volume_ml: clamp(Math.round(this._water - rest), 0, 240) };
    this._set({ pours });
  }

  private async _save(): Promise<void> {
    const d = this._draft;
    if (!d.name.trim()) {
      this._error = 'Give the recipe a name.';
      return;
    }
    const recipe = {
      ...(this.copy ? {} : this.recipe ?? {}),
      ...(d.id != null ? { id: d.id } : {}),
      name: d.name.trim(),
      cup_type: d.cup_type,
      dose_g: d.dose_g,
      ratio: `1:${d.ratio}`,
      // Saved locally, water_ratio is the total water (see ratioOf).
      water_ratio: this._water,
      grind_size: d.grind,
      grinder_size: d.grind,
      grinder_speed_rpm: d.rpm,
      rpm: d.rpm,
      pour_count: d.pours.length,
      pours: d.pours.map((p) => ({ ...(p.name ? { name: p.name } : {}), ...p })),
      bypass_water_enabled: d.bypass ? 1 : 2,
      bypass_volume_ml: d.bypass ? d.bypass_volume_ml : undefined,
      bypass_temp_c: d.bypass ? d.bypass_temp_c : undefined,
    };
    if (this.copy) delete (recipe as Record<string, unknown>).id;
    this._saving = true;
    try {
      const updating = !this.copy && this.recipe != null && d.id != null;
      const result = await xbAsk<{ ok: boolean; error?: string; name?: string }>(
        this.hass,
        updating ? 'update_recipe' : 'add_recipe',
        { recipe_json: JSON.stringify(recipe) },
      );
      if (result && !result.ok) {
        this._error = result.error ?? 'xBloom Studio didn’t take the recipe.';
        return;
      }
      this.dispatchEvent(new CustomEvent('saved', { detail: recipe.name }));
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._saving = false;
    }
  }

  /** A number with a step down and up. */
  private _num(label: string, value: number, min: number, max: number, step: number, set: (v: number) => void,
    shown = (v: number) => formatNumber(this.hass, v, String(step))) {
    const by = (n: number) => set(clamp(round(value + n * step, step), min, max));
    return html`
      <div class="adjust">
        <span class="muted">${label}</span>
        <div class="stepper">
          <button class="round small" aria-label="Less ${label.toLowerCase()}" ?disabled=${value <= min} @click=${() => by(-1)}>
            ${icon('minus', 20)}
          </button>
          <strong>${shown(value)}</strong>
          <button class="round small" aria-label="More ${label.toLowerCase()}" ?disabled=${value >= max} @click=${() => by(1)}>
            ${icon('plus', 20)}
          </button>
        </div>
      </div>
    `;
  }

  protected render() {
    const d = this._draft;
    const [doseMin, doseMax] = CUP_DOSE[d.cup_type] ?? [1, 25];
    const temp = (v: number) => tempLabel(this.hass, v);
    const off = Math.round((this._poured - this._water) * 10) / 10;
    return html`
      <button class="link" @click=${() => this.dispatchEvent(new CustomEvent('close'))}>${BACK} Back</button>
      <div class="cols">
        <section class="panel glass">
          <h2>${this.recipe && !this.copy ? 'Edit recipe' : 'New recipe'}</h2>
          <input class="field" type="text" aria-label="Name" placeholder="Name" .value=${d.name}
            @input=${(e: Event) => this._set({ name: (e.target as HTMLInputElement).value })} />
          <h3 class="gap">Cup</h3>
          <div class="chips wrap" role="radiogroup" aria-label="Cup">
            ${Object.entries(CUPS).map(([code, label]) => {
              const on = d.cup_type === Number(code);
              return html`<button class="chip ${on ? 'on' : ''}" role="radio" aria-checked=${on}
                @click=${() => {
                  const [min, max] = CUP_DOSE[Number(code)];
                  this._set({ cup_type: Number(code), dose_g: clamp(d.dose_g, min, max) });
                }}>${label}</button>`;
            })}
          </div>
          <h3 class="gap">Brew</h3>
          ${this._num('Dose', d.dose_g, doseMin, doseMax, 0.5, (v) => this._set({ dose_g: v }), (v) => `${formatNumber(this.hass, v, '0.5')} g`)}
          ${this._num('Ratio', d.ratio, 5, 25, 0.5, (v) => this._set({ ratio: v }), (v) => `1:${formatNumber(this.hass, v, '0.5')}`)}
          ${this._num('Grind', d.grind, 1, 80, 1, (v) => this._set({ grind: v }))}
          ${this._num('Grinder speed', d.rpm, 60, 120, 10, (v) => this._set({ rpm: v }), (v) => `${v} rpm`)}
          <div class="water">Water <strong>${formatNumber(this.hass, this._water, '0.1')} ml</strong></div>

          <h3 class="gap">Bypass water</h3>
          <div class="chips" role="radiogroup" aria-label="Bypass water">
            <button class="chip ${d.bypass ? '' : 'on'}" role="radio" aria-checked=${!d.bypass} @click=${() => this._set({ bypass: false })}>None</button>
            <button class="chip ${d.bypass ? 'on' : ''}" role="radio" aria-checked=${d.bypass} @click=${() => this._set({ bypass: true })}>Add bypass</button>
          </div>
          ${d.bypass
            ? html`${this._num('Bypass', d.bypass_volume_ml, 5, 100, 1, (v) => this._set({ bypass_volume_ml: v }), (v) => `${v} ml`)}
                ${this._num('Bypass temp', d.bypass_temp_c, 20, 98, 1, (v) => this._set({ bypass_temp_c: v }), temp)}`
            : nothing}
        </section>

        <section class="panel glass">
          <div class="row-head">
            <h2>Pours</h2>
            <span class="muted">${formatNumber(this.hass, this._poured, '0.1')} of ${formatNumber(this.hass, this._water, '0.1')} ml</span>
          </div>
          <ol class="pour-list">
            ${d.pours.map(
              (p, i) => html`<li class="pour-edit">
                <div class="pour-head">
                  <span class="step">${i + 1}</span>
                  <span class="spacer"></span>
                  <button class="round small plain" aria-label="Move pour ${i + 1} up" ?disabled=${i === 0}
                    @click=${() => this._movePour(i, -1)}>${UP}</button>
                  <button class="round small plain" aria-label="Move pour ${i + 1} down" ?disabled=${i === d.pours.length - 1}
                    @click=${() => this._movePour(i, 1)}>${CHEVRON}</button>
                  <button class="round small plain" aria-label="Remove pour ${i + 1}" ?disabled=${d.pours.length <= 1}
                    @click=${() => this._set({ pours: d.pours.filter((_, j) => j !== i) })}>${icon('backspace', 18)}</button>
                </div>
                ${this._num('Water', p.volume_ml, 0, 240, 5, (v) => this._setPour(i, { volume_ml: v }), (v) => `${v} ml`)}
                ${this._num('Temperature', p.temperature_c, 20, 98, 1, (v) => this._setPour(i, { temperature_c: v }), temp)}
                ${this._num('Flow', p.flow_rate, 3, 3.5, 0.1, (v) => this._setPour(i, { flow_rate: Math.round(v * 10) / 10 }), (v) => `${v.toFixed(1)} ml/s`)}
                ${this._num('Wait', p.pause_s, 0, 59, 1, (v) => this._setPour(i, { pause_s: v }), (v) => `${v} s`)}
                <div class="chips wrap pattern" role="radiogroup" aria-label="Pattern">
                  ${Object.entries(PATTERN_API).map(([name, code]) => {
                    const on = p.pattern === code;
                    return html`<button class="chip with-icon ${on ? 'on' : ''}" role="radio" aria-checked=${on}
                      @click=${() => this._setPour(i, { pattern: code })}>${PATTERN_ICONS[name]}${humanize(name)}</button>`;
                  })}
                </div>
              </li>`,
            )}
          </ol>
          <div class="actions">
            <button class="pill glass" ?disabled=${d.pours.length >= MAX_POURS}
              @click=${() => this._set({ pours: [...d.pours, { ...d.pours[d.pours.length - 1], volume_ml: 0, pause_s: 0 }] })}>
              ${icon('plus', 20)} Add pour
            </button>
            ${off !== 0
              ? html`<button class="pill glass" @click=${() => this._fit()}>Make them add up</button>`
              : nothing}
          </div>
          ${off !== 0
            ? html`<p class="note">The pours come to ${formatNumber(this.hass, this._poured, '0.1')} ml, but the dose and
                ratio make ${formatNumber(this.hass, this._water, '0.1')} ml. xBloom needs them to match.</p>`
            : nothing}
        </section>
      </div>
      ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
      <div class="actions save">
        <button class="pill on" ?disabled=${this._saving} @click=${() => this._save()}>${this._saving ? 'Saving…' : 'Save'}</button>
        <button class="pill glass" @click=${() => this.dispatchEvent(new CustomEvent('close'))}>Cancel</button>
      </div>
    `;
  }

  static styles = [
    controls,
    sectionLabel,
    studioStyles,
    css`
      .water {
        display: flex;
        justify-content: space-between;
        margin-top: 12px;
        padding: 0 16px;
        color: var(--lf-muted);
      }

      .water strong {
        color: var(--lf-text);
        font-variant-numeric: tabular-nums;
      }

      .pour-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin: 14px 0 0;
        padding: 0;
        list-style: none;
      }

      .pour-edit {
        padding: 10px;
        border-radius: var(--lf-radius-icon);
        background: var(--lf-control-row);
      }

      .pour-head {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .pour-head .spacer {
        flex: 1;
      }

      .pour-head .round.plain:nth-of-type(-n + 2) svg {
        width: 22px;
        height: 22px;
      }

      .pour-edit .adjust {
        background: none;
        padding-left: 6px;
      }

      .pattern {
        margin-top: 8px;
      }

      .save {
        justify-content: flex-end;
      }
    `,
  ];
}

define('luxframe-xbloom-editor', LuxFrameXBloomEditor);
