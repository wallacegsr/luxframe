import { LitElement, css, html, nothing, type TemplateResult } from 'lit';
import '../confirm-button';
import { define } from '../define';
import { numberRange, optionLabel, selectOption, setNumber } from '../detail/helpers';
import { formatNumber } from '../history';
import { icon } from '../icons';
import { Pending } from '../pending';
import '../slider';
import { controls, pageStyles, sectionLabel } from '../theme';
import type { HassEntity, HomeAssistant } from '../types';

/**
 * The xBloom page for the xBloom Studio integration (Alshekhi/xbloom-studio),
 * which has no sidebar panel to show: a LuxFrame view of the machine built
 * from the integration's own entities.
 *
 * On the left is what the machine is doing: a brew or grind under way, the
 * grinder, brewer or scale screen it's on, or the scale when it's idle. On
 * the right is the next brew: a rating for the last one when Coffee Lab asks,
 * the bag of coffee, the recipe and its dose, ratio and grind, and Start
 * Brew once the machine has the recipe ready.
 */

/** xBloom Studio's entities on one machine, by `domain.translation_key`. */
export type StudioEntities = Record<string, string>;

/**
 * xBloom Studio's entities, if it's installed: those of the first machine
 * with a Brew Status sensor. The older ha-xbloom integration shares the
 * `xbloom` platform name but has neither that sensor nor Start Brew.
 */
export function studioEntities(hass: HomeAssistant | undefined): StudioEntities | undefined {
  const all = Object.values(hass?.entities ?? {}).filter((e) => e.platform === 'xbloom' && e.translation_key);
  const anchor = all.find((e) => e.entity_id.startsWith('sensor.') && e.translation_key === 'brew_status');
  if (!anchor || !all.some((e) => e.entity_id.startsWith('button.') && e.translation_key === 'start_brew')) {
    return undefined;
  }
  const found: StudioEntities = {};
  for (const e of all) {
    if (anchor.device_id && e.device_id !== anchor.device_id) continue;
    const key = `${e.entity_id.split('.')[0]}.${e.translation_key}`;
    found[key] ??= e.entity_id;
  }
  return found;
}

const BUSY = ['grinding', 'brewing'];
const UNUSABLE = ['unavailable', 'unknown', ''];

/** Machine Status problems, in words. */
const PROBLEMS: Record<string, string> = {
  no_water: 'The water tank is empty. Fill it to brew.',
  no_beans: 'The grinder is out of beans.',
  dose_water_error: 'The machine couldn’t dose the water. Check the tank and the water line.',
  gear_position_error: 'The grinder’s gear is out of place. Check the grinder.',
};

/** Why the recipe isn't ready, from Recipe Ready's `reason`. */
const NOT_READY: Record<string, string> = {
  no_recipe: 'Pick a recipe to brew.',
  no_bag: 'Pick the bag of coffee you’re brewing.',
  brewing: 'The machine is busy.',
  machine_not_found: 'The machine is out of range.',
};

/** "less_sour" → "Less sour". */
const humanize = (value: string): string => {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** "3:05". */
const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

interface Pour {
  name?: string;
  volume_ml?: number;
  temperature_c?: number;
  pause_s?: number;
}

export class LuxFrameXBloomStudio extends LitElement {
  static properties = {
    hass: { attribute: false },
    entities: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare entities: StudioEntities;

  /** Numbers and choices sent but not yet reported back, by entity id. */
  private _sent = new Map<string, Pending<number | string>>();

  constructor() {
    super();
    this.entities = {};
  }

  private _state(key: string): HassEntity | undefined {
    const id = this.entities[key];
    return id ? this.hass?.states[id] : undefined;
  }

  private _usable(key: string): HassEntity | undefined {
    const s = this._state(key);
    return s && !UNUSABLE.includes(s.state) ? s : undefined;
  }

  private _press(key: string): void {
    const id = this.entities[key];
    if (id) this.hass?.callService('button', 'press', { entity_id: id });
  }

  private _toggle(key: string): void {
    const id = this.entities[key];
    if (id) this.hass?.callService('switch', 'toggle', { entity_id: id });
  }

  /** An option as the integration words it, else in plain words. */
  private _label(s: HassEntity, option: string): string {
    const shown = optionLabel(this.hass, s, option);
    return shown === option ? humanize(option) : shown;
  }

  private _chosen(s: HassEntity): string {
    return (this._pending(s.entity_id).get(s.state) as string | undefined) ?? s.state;
  }

  private _choose(s: HassEntity, option: string): void {
    this._pending(s.entity_id).release(option);
    selectOption(this.hass, s, option);
  }

  private _pending(id: string): Pending<number | string> {
    let p = this._sent.get(id);
    if (!p) this._sent.set(id, (p = new Pending<number | string>(this)));
    return p;
  }

  private _number(s: HassEntity, reported: number): number {
    const held = this._pending(s.entity_id).get(reported);
    return typeof held === 'number' ? held : reported;
  }

  private _setNumber(s: HassEntity, value: number): void {
    const { min, max } = numberRange(s);
    const next = Math.max(min, Math.min(max, value));
    this._pending(s.entity_id).release(next);
    setNumber(this.hass, s, next);
  }

  protected render() {
    const status = this._state('sensor.brew_status')?.state ?? 'unknown';
    return html`
      <div class="head">
        <h1>xBloom</h1>
        ${this._presence()}
      </div>
      ${this._problem()}
      <div class="cols">
        <section class="panel glass now">${this._now(status)}</section>
        <section class="panel glass brew">${this._brew(status)}</section>
      </div>
    `;
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

  // ── What the machine is doing ──────────────────────────────────────────

  private _now(status: string): TemplateResult {
    if (BUSY.includes(status)) return this._running(status);
    const module = this._usable('sensor.current_module')?.state ?? 'home';
    if (module === 'grinder') return this._grinder();
    if (module === 'brewer') return this._brewer();
    if (module === 'scale') return this._scale('Scale', true);
    return this._home(status);
  }

  private _weight(): string {
    const w = this._usable('sensor.scale_weight');
    return w ? `${formatNumber(this.hass, Number(w.state), '0.1')} g` : '– g';
  }

  private _running(status: string) {
    const paused = this._state('binary_sensor.brew_paused')?.state === 'on';
    const recipe = this._usable('sensor.current_recipe');
    const pour = this._usable('sensor.current_pour');
    const total = Number(pour?.attributes.total_pours ?? recipe?.attributes.total_pours ?? 0);
    const time = this._usable('sensor.brew_time');
    const word = paused ? 'Paused' : status === 'grinding' ? 'Grinding' : 'Brewing';
    return html`
      <h3>Now</h3>
      <div class="status-word ${paused ? '' : 'live'}" aria-live="polite">${word}</div>
      ${recipe ? html`<div class="recipe-name">${recipe.state}</div>` : nothing}
      <div class="readouts">
        ${pour && Number(pour.state) > 0
          ? this._readout('Pour', total ? `${pour.state} of ${total}` : pour.state)
          : nothing}
        ${time ? this._readout('Time', clock(Number(time.state))) : nothing}
        ${this._readout('Weight', this._weight())}
      </div>
      <div class="actions">
        ${paused
          ? html`<button class="pill on" @click=${() => this._press('button.resume_brew')}>
              ${icon('play', 22)} Resume
            </button>`
          : html`<button class="pill glass" @click=${() => this._press('button.pause_brew')}>
              ${icon('pause', 22)} Pause
            </button>`}
        <luxframe-confirm-button label="Cancel" confirm-label="Tap again to cancel"
          @confirm=${() => this._press('button.cancel_brew')}></luxframe-confirm-button>
      </div>
    `;
  }

  private _readout(label: string, value: string) {
    return html`<div class="readout"><span class="muted">${label}</span><strong>${value}</strong></div>`;
  }

  private _home(status: string) {
    const done = status === 'done';
    const recipe = this._usable('sensor.current_recipe') ?? this._usable('sensor.last_recipe_card');
    return html`
      <h3>${done ? 'Done' : 'Scale'}</h3>
      <div class="big-weight" aria-live="polite">${this._weight()}</div>
      ${done && recipe ? html`<div class="recipe-name">${recipe.state} is ready.</div>` : nothing}
      <div class="actions">
        <button class="pill glass" ?disabled=${!this.entities['button.tare_scale']}
          @click=${() => this._press('button.tare_scale')}>Tare</button>
      </div>
      <h3 class="gap">On the machine</h3>
      <div class="chips">
        ${this._goTo('button.go_to_grinder', 'Grinder')}
        ${this._goTo('button.go_to_brewer', 'Brewer')}
        ${this._goTo('button.go_to_scale', 'Scale')}
      </div>
    `;
  }

  private _goTo(key: string, label: string) {
    return this.entities[key]
      ? html`<button class="chip" @click=${() => this._press(key)}>${label}</button>`
      : nothing;
  }

  private _scale(title: string, back: boolean) {
    return html`
      <h3>${title}</h3>
      <div class="big-weight" aria-live="polite">${this._weight()}</div>
      <div class="actions">
        <button class="pill glass" @click=${() => this._press('button.tare_scale')}>Tare</button>
      </div>
      ${back ? this._back() : nothing}
    `;
  }

  private _grinder() {
    return html`
      <h3>Grinder</h3>
      ${this._slider('number.grind_size', 'Grind size')}
      ${this._slider('number.grind_speed', 'Speed')}
      <div class="actions">
        <button class="pill on" ?disabled=${!this.entities['button.grind']}
          @click=${() => this._press('button.grind')}>Grind</button>
      </div>
      ${this._back()}
    `;
  }

  private _brewer() {
    const pattern = this._state('select.brew_pattern');
    return html`
      <h3>Brewer</h3>
      ${this._slider('number.brew_volume', 'Water')}
      ${this._slider('number.brew_temperature', 'Temperature')}
      ${this._slider('number.brew_flow_rate', 'Flow rate')}
      ${pattern ? html`<h4 class="gap">Pattern</h4>${this._chips(pattern)}` : nothing}
      <div class="actions">
        <button class="pill on" ?disabled=${!this.entities['button.brew_standalone']}
          @click=${() => this._press('button.brew_standalone')}>Pour</button>
      </div>
      ${this._back()}
    `;
  }

  private _back() {
    return this.entities['button.back_to_home']
      ? html`<button class="chip back" @click=${() => this._press('button.back_to_home')}>
          ${icon('previous', 18)} Home screen
        </button>`
      : nothing;
  }

  // ── The next brew ──────────────────────────────────────────────────────

  private _brew(status: string): TemplateResult {
    const recipe = this._state('select.recipe');
    return html`
      ${this._rating()}
      ${this._bag()}
      ${recipe ? this._recipes(recipe) : nothing}
      ${this._settings()}
      ${this._start(status)}
    `;
  }

  /** Coffee Lab asking how the last brew was. */
  private _rating() {
    const question = this._usable('sensor.coffee_lab_rating_question');
    const rate = this._state('select.coffee_lab_rate_brew');
    if (!question || !rate) return nothing;
    const issue = this._usable('select.coffee_lab_cup_issue');
    return html`
      <div class="ask">
        <h3>How was it?</h3>
        <p>${question.state}${question.attributes.bag ? html` <span class="muted">· ${question.attributes.bag}</span>` : nothing}</p>
        ${this._chips(rate, true)}
        ${issue ? html`<h4 class="gap">Anything off?</h4>${this._chips(issue)}` : nothing}
      </div>
    `;
  }

  private _bag() {
    const bag = this._state('select.coffee_lab_active_bag');
    if (!bag) return nothing;
    const options: string[] = bag.attributes.options ?? [];
    if (!options.length) return nothing;
    const left = Number(bag.attributes.remaining_g ?? this._usable('sensor.coffee_lab_remaining')?.state);
    return html`
      <div class="row-head">
        <h3>Coffee</h3>
        ${Number.isFinite(left) && !UNUSABLE.includes(bag.state)
          ? html`<span class="muted">${formatNumber(this.hass, left, '0')} g left</span>`
          : nothing}
      </div>
      ${this._chips(bag, true)}
    `;
  }

  private _recipes(recipe: HassEntity) {
    const options: string[] = recipe.attributes.options ?? [];
    const chosen = this._chosen(recipe);
    const a = recipe.attributes;
    const picked = !UNUSABLE.includes(recipe.state) && chosen === recipe.state;
    const pours: Pour[] = picked && Array.isArray(a.pours) ? a.pours : [];
    const water = this._water();
    return html`
      <h3 class="gap">Recipe</h3>
      <ul class="options" role="radiogroup" aria-label="Recipe" data-no-swipe>
        ${options.map(
          (o) => html`<li>
            <button role="radio" aria-checked=${o === chosen} class=${o === chosen ? 'chosen' : ''}
              ?disabled=${recipe.state === 'unavailable'} @click=${() => this._choose(recipe, o)}>
              <span>${o}</span>${o === chosen ? icon('check', 22) : nothing}
            </button>
          </li>`,
        )}
      </ul>
      ${picked ? this._facts() : nothing}
      ${pours.length
        ? html`<div class="row-head gap"><h4>Pours</h4>${water ? html`<span class="muted">${water} ml water</span>` : nothing}</div>
          <ol class="pours">
            ${pours.map(
              (p, i) => html`<li>
                <span>${p.name || (i === 0 ? 'Bloom' : `Pour ${i + 1}`)}</span>
                <span class="muted">
                  ${p.volume_ml ?? '–'} ml · ${p.temperature_c ?? '–'}°C${p.pause_s ? html` · wait ${clock(p.pause_s)}` : nothing}
                </span>
              </li>`,
            )}
          </ol>`
        : nothing}
    `;
  }

  /** The water the dose and ratio make, in ml. */
  private _water(): number | undefined {
    const dose = this._state('number.brew_dose');
    const ratio = this._state('number.brew_ratio');
    if (!dose || !ratio) return undefined;
    const water = this._number(dose, Number(dose.state)) * this._number(ratio, Number(ratio.state));
    return Number.isFinite(water) ? Math.round(water) : undefined;
  }

  /** Dose, ratio and grind for the picked recipe. */
  private _facts() {
    return html`
      <div class="facts">
        ${this._stepper('number.brew_dose', 'Dose')}
        ${this._stepper('number.brew_ratio', 'Ratio', (v) => `1:${formatNumber(this.hass, v, '0.5')}`)}
        ${this._stepper('number.brew_grind_size', 'Grind')}
      </div>
    `;
  }

  private _settings() {
    const taste = this._state('select.brew_taste');
    const grinder = this._state('switch.use_grinder');
    if (!taste && !grinder) return nothing;
    const grind = grinder?.state === 'on';
    const beans = (label: string, on: boolean) =>
      html`<button class="chip ${grind === on ? 'on' : ''}" role="radio" aria-checked=${grind === on}
        ?disabled=${grinder!.state === 'unavailable'} @click=${() => grind !== on && this._toggle('switch.use_grinder')}>
        ${label}
      </button>`;
    return html`
      ${taste ? html`<h3 class="gap">Taste</h3>${this._chips(taste)}` : nothing}
      ${grinder
        ? html`<h3 class="gap">Beans</h3>
            <div class="chips" role="radiogroup" aria-label="Beans" data-no-swipe>
              ${beans('Grind them', true)} ${beans('Already ground', false)}
            </div>`
        : nothing}
    `;
  }

  private _start(status: string) {
    const ready = this._state('binary_sensor.recipe_ready');
    const isReady = ready?.state === 'on';
    const busy = BUSY.includes(status);
    let note: string;
    if (busy) note = 'Brewing now.';
    else if (isReady) note = 'Ready to brew.';
    else if (ready?.attributes.preparing) note = 'Getting the recipe ready…';
    else {
      const reason = ready?.attributes.reason as string | null | undefined;
      note = reason ? NOT_READY[reason] ?? `The recipe isn’t ready (${humanize(reason)}).` : 'Pick a recipe to brew.';
    }
    const picked = this._usable('select.recipe');
    return html`
      <div class="start">
        <button class="pill on start-brew" ?disabled=${!isReady || busy}
          @click=${() => this._press('button.start_brew')}>
          ${icon('play', 22)} Start Brew
        </button>
        <p class="muted" aria-live="polite">${note}</p>
        ${picked && !busy && this.entities['button.cancel_preparation']
          ? html`<button class="chip" @click=${() => this._press('button.cancel_preparation')}>Clear recipe</button>`
          : nothing}
      </div>
    `;
  }

  // ── Shared controls ────────────────────────────────────────────────────

  /** A select's options as chips, the chosen one lit. */
  private _chips(s: HassEntity, wrap = false) {
    const options: string[] = s.attributes.options ?? [];
    const chosen = this._chosen(s);
    return html`
      <div class="chips ${wrap ? 'wrap' : ''}" role="radiogroup" aria-label=${s.attributes.friendly_name ?? ''} data-no-swipe>
        ${options.map(
          (o) => html`<button class="chip ${o === chosen ? 'on' : ''}" role="radio" aria-checked=${o === chosen}
            ?disabled=${s.state === 'unavailable'} @click=${() => this._choose(s, o)}>${this._label(s, o)}</button>`,
        )}
      </div>
    `;
  }

  private _numberParts(key: string, format?: (v: number) => string) {
    const s = this._state(key);
    if (!s) return undefined;
    const { min, max, step, value: reported, unit } = numberRange(s);
    const value = this._number(s, reported);
    const text = format ?? ((v: number) => `${formatNumber(this.hass, v, String(step))}${unit ? ` ${unit}` : ''}`);
    const unavailable = UNUSABLE.includes(s.state) || !Number.isFinite(value);
    const by = (n: number) => Math.round((value + n * step) / step) * step;
    return { s, min, max, step, value, text, unavailable, by };
  }

  /** A number with a step down and up. */
  private _stepper(key: string, label: string, format?: (v: number) => string) {
    const n = this._numberParts(key, format);
    if (!n) return nothing;
    return html`
      <div class="fact">
        <span class="muted">${label}</span>
        <div class="step">
          <button class="round small" aria-label="Less ${label.toLowerCase()}" ?disabled=${n.unavailable || n.value <= n.min}
            @click=${() => this._setNumber(n.s, n.by(-1))}>${icon('minus', 18)}</button>
          <strong>${n.unavailable ? '–' : n.text(n.value)}</strong>
          <button class="round small" aria-label="More ${label.toLowerCase()}" ?disabled=${n.unavailable || n.value >= n.max}
            @click=${() => this._setNumber(n.s, n.by(1))}>${icon('plus', 18)}</button>
        </div>
      </div>
    `;
  }

  /** A number as a wide slider, its value over it. */
  private _slider(key: string, label: string) {
    const n = this._numberParts(key);
    if (!n) return nothing;
    return html`
      <div class="slide">
        <div class="row-head"><span class="muted">${label}</span><strong>${n.unavailable ? '–' : n.text(n.value)}</strong></div>
        <luxframe-slider filled label=${label} .value=${n.value} .min=${n.min} .max=${n.max} .step=${n.step}
          .valueText=${n.text(n.value)} ?disabled=${n.unavailable}
          @input=${(e: CustomEvent<number>) => this._pending(n.s.entity_id).hold(e.detail)}
          @change=${(e: CustomEvent<number>) => this._setNumber(n.s, e.detail)}></luxframe-slider>
      </div>
    `;
  }

  static styles = [
    pageStyles,
    controls,
    sectionLabel,
    css`
      :host {
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

      .banner {
        margin-bottom: var(--lf-gap);
        padding: 14px 18px;
        border-radius: var(--lf-radius-s);
        color: #fff;
        background: color-mix(in srgb, var(--lf-danger) 82%, transparent);
        font-weight: 500;
      }

      .cols {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr));
        gap: var(--lf-gap);
        align-items: start;
      }

      .panel {
        box-sizing: border-box;
        min-width: 0;
        padding: 22px;
        border-radius: var(--lf-radius);
      }

      .gap {
        margin-top: 24px;
      }

      h4 {
        margin-bottom: 10px;
      }

      h3 + * {
        margin-top: 12px;
      }

      .row-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }

      .status-word {
        font-size: clamp(40px, 6vw, 56px);
        font-weight: 600;
        letter-spacing: -0.02em;
      }

      .status-word.live {
        color: var(--lf-accent);
      }

      .recipe-name {
        margin-top: 4px;
        font-size: 19px;
        color: var(--lf-muted);
      }

      .big-weight {
        font-size: clamp(56px, 9vw, 84px);
        font-weight: 600;
        letter-spacing: -0.03em;
        font-variant-numeric: tabular-nums;
      }

      .readouts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
        gap: 12px;
        margin-top: 22px;
      }

      .readout,
      .fact {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px 14px;
        border-radius: var(--lf-radius-s);
        background: var(--lf-control-row);
      }

      .readout strong,
      .fact strong {
        font-size: 22px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }

      .readout .muted,
      .fact .muted,
      .slide .muted {
        font-size: 14px;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 24px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 140px;
      }

      .chips {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        scrollbar-width: none;
      }

      .chips.wrap {
        flex-wrap: wrap;
      }

      .chips .chip {
        flex: none;
      }

      .chip.back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 20px;
        background: none;
        color: var(--lf-muted);
        padding-left: 6px;
      }

      .slide {
        margin-top: 16px;
      }

      .slide strong {
        font-variant-numeric: tabular-nums;
      }

      .slide luxframe-slider {
        display: block;
        margin-top: 8px;
      }

      .ask {
        margin-bottom: 24px;
        padding: 16px;
        border-radius: var(--lf-radius-s);
        background: var(--lf-control-row);
      }

      .ask p {
        margin: 6px 0 12px;
        font-size: 18px;
      }

      .options {
        margin: 12px 0 0;
        padding: 0;
        list-style: none;
        max-height: 264px;
        overflow-y: auto;
      }

      .options li + li {
        border-top: 1px solid var(--lf-control-row);
      }

      .options button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        min-height: 52px;
        padding: 0 14px;
        border-radius: var(--lf-radius-s);
        background: none;
        font-size: 17px;
        text-align: left;
      }

      .options .chosen {
        font-weight: 600;
        color: var(--lf-text-active);
        background: var(--lf-surface-active);
      }

      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
        gap: 10px;
        margin-top: 14px;
      }

      .step {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }

      .step strong {
        font-size: 19px;
        white-space: nowrap;
      }

      .step .round.small {
        width: 36px;
        height: 36px;
      }

      .pours {
        margin: 12px 0 0;
        padding: 0;
        list-style: none;
        font-size: 15px;
      }

      .pours li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 6px 2px;
      }

      .start {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        margin-top: 28px;
      }

      .start p {
        margin: 0;
      }

      .start-brew {
        width: 100%;
      }
    `,
  ];
}

define('luxframe-xbloom-studio', LuxFrameXBloomStudio);
