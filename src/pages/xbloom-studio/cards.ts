import { css, html, nothing, type TemplateResult } from 'lit';
import '../../confirm-button';
import { define } from '../../define';
import '../../fit';
import { formatNumber } from '../../history';
import { icon } from '../../icons';
import { controls, sectionLabel } from '../../theme';
import type { HassEntity, XBloomCardName } from '../../types';
import './graph';
import {
  BACK,
  BUSY,
  CHEVRON,
  DOTS,
  PATTERN_ICONS,
  StudioBase,
  UNUSABLE,
  clock,
  grindOf,
  hasBypass,
  humanize,
  metricTiles,
  pourTimeline,
  pourTotal,
  ratioOf,
  recipeArt,
  studioStyles,
  tempLabel,
  type Recipe,
} from './shared';

/**
 * One card of the Brew or Manual tab, laid out on the tab's grid.
 *
 * Brew tab:
 * - `machine`: what the machine is doing: the scale in a ring that fills
 *   toward the recipe's water, the stages of a brew (beans, grind, pour,
 *   enjoy), and Pause, Resume and Cancel; or the grinder, brewer or scale
 *   screen the machine is on. After a brew, Coffee Lab asks how it was.
 * - `graph`: the brew's weight and flow over time.
 * - `recipe`: the recipe's banner, picker, numbers and pours.
 * - `brew`: the bag of coffee, taste, and Start Brew once the recipe's ready.
 *
 * Manual tab: `grinder`, `pour` and `scale`, run on their own.
 *
 * The contents shrink to fit the card (`fit: shrink`) or scroll (`scroll`),
 * drawn at most `scale` times their normal size.
 */

/** What each card is called, in the editor. */
export const CARD_NAMES: Record<XBloomCardName, string> = {
  machine: 'Machine',
  graph: 'Brew graph',
  recipe: 'Recipe',
  brew: 'Start brew',
  grinder: 'Grinder',
  pour: 'Pour',
  scale: 'Scale',
};

/** Why the recipe isn't ready, from Recipe Ready's `reason`. */
const NOT_READY: Record<string, string> = {
  no_recipe: 'Pick a recipe to brew.',
  no_bag: 'Pick the bag of coffee you’re brewing.',
  brewing: 'The machine is busy.',
  machine_not_found: 'The machine is out of range.',
};

/** What the steppers under the recipe's numbers are called. */
const ADJUST: Record<string, string> = {
  'number.brew_dose': 'Dose',
  'number.brew_ratio': 'Ratio',
  'number.brew_grind_size': 'Grind',
};

const STAGES = ['beans', 'grind', 'pour', 'enjoy'] as const;
const STAGE_NAMES = { beans: 'Beans', grind: 'Grind', pour: 'Pour', enjoy: 'Enjoy' };
const RING = 2 * Math.PI * 54;

export class LuxFrameXBloomCard extends StudioBase {
  static properties = {
    ...StudioBase.properties,
    card: { reflect: true },
    fit: {},
    scale: { type: Number },
    _picking: { state: true },
    _adjusting: { state: true },
  };

  declare card: XBloomCardName;
  declare fit: 'shrink' | 'scroll';
  declare scale: number;

  /** The recipe list is open over the picked recipe. */
  declare _picking: boolean;
  /** The number whose stepper is open under the recipe's numbers. */
  declare _adjusting?: string;

  constructor() {
    super();
    this.card = 'machine';
    this.fit = 'shrink';
    this.scale = 1;
    this._picking = false;
  }

  protected render() {
    const status = this._state('sensor.brew_status')?.state ?? 'unknown';
    const fitted = (body: unknown, className = '', center = false) => html`
      <section class="panel glass ${className}">
        <luxframe-fit .mode=${this.fit === 'scroll' ? 'scroll' : 'shrink'} .size=${this.scale} ?center=${center}>
          ${body}
        </luxframe-fit>
      </section>
    `;
    switch (this.card) {
      case 'graph':
        return html`<section class="panel glass graph" style="zoom: ${this.scale}">
          <luxframe-xbloom-graph .hass=${this.hass}></luxframe-xbloom-graph>
        </section>`;
      case 'recipe': {
        const recipe = this._state('select.recipe');
        return fitted(recipe ? this._recipe(recipe, status) : html`<p class="note pad">No Recipe select.</p>`, 'recipe');
      }
      case 'brew':
        return fitted(html`${this._bag()}${this._settings()}${this._start(status)}`);
      case 'grinder':
        return fitted(this._manualGrinder(status));
      case 'pour':
        return fitted(this._manualPour(status));
      case 'scale':
        return fitted(this._manualScale(status), '', true);
      default:
        return fitted(html`<div class="hero">${this._hero(status)}</div>`, '', true);
    }
  }

  // ── Manual: the grinder, the brewer and the scale on their own ─────────

  private _manualGrinder(status: string) {
    const busy = BUSY.includes(status);
    return html`
      <h2>${DOTS.grind} Grinder</h2>
      ${this._slider('number.grind_size', 'Grind size')}
      ${this._slider('number.grind_speed', 'Speed')}
      <p class="note">Starts straight away. Put the grounds bin or a cup in place first.</p>
      <div class="actions">
        <button class="pill on" ?disabled=${busy || !this.entities['button.grind']}
          @click=${() => this._press('button.grind')}>Grind</button>
      </div>
    `;
  }

  private _manualPour(status: string) {
    const busy = BUSY.includes(status);
    const pattern = this._state('select.brew_pattern');
    return html`
      <h2>${DOTS.pour} Pour</h2>
      ${this._slider('number.brew_volume', 'Water')}
      ${this._slider('number.brew_temperature', 'Temperature', this._temp)}
      ${this._slider('number.brew_flow_rate', 'Flow rate')}
      ${pattern ? html`<h4 class="gap">Pattern</h4>${this._chips(pattern, true, PATTERN_ICONS)}` : nothing}
      <div class="actions">
        <button class="pill on" ?disabled=${busy || !this.entities['button.brew_standalone']}
          @click=${() => this._press('button.brew_standalone')}>Pour</button>
      </div>
    `;
  }

  private _manualScale(status: string) {
    const busy = BUSY.includes(status);
    const module = this._usable('sensor.current_module')?.state ?? 'home';
    const w = Number(this._usable('sensor.scale_weight')?.state);
    return html`
      <div class="hero">
        <h2>${DOTS.enjoy} Scale</h2>
        <div class="big weigh" aria-live="polite">${Number.isFinite(w) ? formatNumber(this.hass, w, '0.1') : '–'}<small>g</small></div>
        <div class="actions">
          <button class="pill glass" @click=${() => this._press('button.tare_scale')}>Tare</button>
          ${module === 'scale'
            ? html`<button class="pill glass" @click=${() => this._press('button.back_to_home')}>Leave scale mode</button>`
            : html`<button class="pill glass" ?disabled=${busy || !this.entities['button.go_to_scale']}
                @click=${() => this._press('button.go_to_scale')}>Scale mode</button>`}
        </div>
      </div>
    `;
  }

  // ── What the machine is doing ──────────────────────────────────────────

  private _hero(status: string): TemplateResult {
    const module = this._usable('sensor.current_module')?.state ?? 'home';
    if (!BUSY.includes(status)) {
      if (module === 'grinder') return this._grinder();
      if (module === 'brewer') return this._brewer();
      if (module === 'scale') return this._scale();
    }
    const paused = this._state('binary_sensor.brew_paused')?.state === 'on';
    const busy = BUSY.includes(status);
    const recipe = this._usable('sensor.current_recipe');
    const pour = this._usable('sensor.current_pour');
    const total = Number(pour?.attributes.total_pours ?? recipe?.attributes.total_pours ?? 0);
    const time = this._usable('sensor.brew_time');
    const word = busy
      ? paused ? 'Paused' : status === 'grinding' ? 'Grinding' : 'Brewing'
      : status === 'done' ? 'Enjoy' : 'Ready';
    const picked = this._state('select.recipe');
    const target = busy && picked && !UNUSABLE.includes(picked.state) ? this._target(picked.attributes as Recipe) : 0;
    return html`
      ${this._ring(word, target, busy ? recipe?.state : status === 'done' ? this._usable('sensor.last_recipe_card')?.state : undefined)}
      ${this._stages(status)}
      ${!busy && this._rating() !== nothing ? html`<div class="rating">${this._rating()}</div>` : nothing}
      ${busy
        ? html`<div class="stats">
            ${pour && Number(pour.state) > 0 ? this._stat('Pour', total ? `${pour.state} of ${total}` : pour.state) : nothing}
            ${time ? this._stat('Time', clock(Number(time.state))) : nothing}
          </div>
          <div class="actions">
            ${paused
              ? html`<button class="pill on" @click=${() => this._press('button.resume_brew')}>${icon('play', 22)} Resume</button>`
              : html`<button class="pill glass" @click=${() => this._press('button.pause_brew')}>${icon('pause', 22)} Pause</button>`}
            <luxframe-confirm-button label="Cancel" confirm-label="Tap again to cancel"
              @confirm=${() => this._press('button.cancel_brew')}></luxframe-confirm-button>
          </div>`
        : html`<div class="actions">
              <button class="pill glass" ?disabled=${!this.entities['button.tare_scale']}
                @click=${() => this._press('button.tare_scale')}>Tare</button>
            </div>
            <div class="chips machine">
              ${this._goTo('button.go_to_grinder', 'Grinder', DOTS.grind)}
              ${this._goTo('button.go_to_brewer', 'Brewer', DOTS.pour)}
              ${this._goTo('button.go_to_scale', 'Scale', DOTS.enjoy)}
            </div>`}
    `;
  }

  /** The water a recipe pours, bypass and all: what the scale fills toward. */
  private _target(r: Recipe): number {
    return pourTotal(r) + (hasBypass(r) ? Number(r.bypass_volume_ml) : 0);
  }

  /** The scale in a ring, filling toward `target` grams when there is one. */
  private _ring(word: string, target: number, below?: string) {
    const w = Number(this._usable('sensor.scale_weight')?.state);
    const fraction = target > 0 && Number.isFinite(w) ? Math.max(0, Math.min(1, w / target)) : 0;
    return html`
      <div class="ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="track" cx="60" cy="60" r="54" />
          <circle class="bar" cx="60" cy="60" r="54" stroke-dasharray=${RING} stroke-dashoffset=${RING * (1 - fraction)} />
        </svg>
        <div class="ring-center">
          <div class="big" aria-live="polite">${Number.isFinite(w) ? formatNumber(this.hass, w, '0.1') : '–'}<small>g</small></div>
          <div class="sub">${word}</div>
          ${below ? html`<div class="sub muted">${below}</div>` : nothing}
          ${target ? html`<div class="sub muted">Target ${formatNumber(this.hass, target, '0')} ml</div>` : nothing}
        </div>
      </div>
    `;
  }

  /** Beans, grind, pour, enjoy: where a brew is. */
  private _stages(status: string) {
    const ready = this._state('binary_sensor.recipe_ready');
    const at =
      status === 'grinding' ? 1
      : status === 'brewing' ? 2
      : status === 'done' ? 3
      : ready?.state === 'on' || ready?.attributes.preparing ? 0
      : -1;
    return html`<ol class="stages">
      ${STAGES.map(
        (s, i) => html`<li class=${i === at ? 'active' : i < at ? 'done' : ''} aria-current=${i === at ? 'step' : 'false'}>
          ${DOTS[s]}<span>${STAGE_NAMES[s]}</span>
        </li>`,
      )}
    </ol>`;
  }

  private _stat(label: string, value: string) {
    return html`<div class="stat"><span class="label">${label}</span><strong>${value}</strong></div>`;
  }

  private _goTo(key: string, label: string, picture: unknown) {
    return this.entities[key]
      ? html`<button class="chip with-icon" @click=${() => this._press(key)}>${picture}${label}</button>`
      : nothing;
  }

  private _scale() {
    return html`
      ${this._ring('Scale', 0)}
      <div class="actions">
        <button class="pill glass" @click=${() => this._press('button.tare_scale')}>Tare</button>
      </div>
      ${this._back()}
    `;
  }

  private _grinder() {
    return html`
      <h2>${DOTS.grind} Grinder</h2>
      <div class="controls">
        ${this._slider('number.grind_size', 'Grind size')}
        ${this._slider('number.grind_speed', 'Speed')}
      </div>
      <div class="actions">
        <button class="pill on" ?disabled=${!this.entities['button.grind']} @click=${() => this._press('button.grind')}>Grind</button>
      </div>
      ${this._back()}
    `;
  }

  private _brewer() {
    const pattern = this._state('select.brew_pattern');
    return html`
      <h2>${DOTS.pour} Brewer</h2>
      <div class="controls">
        ${this._slider('number.brew_volume', 'Water')}
        ${this._slider('number.brew_temperature', 'Temperature', this._temp)}
        ${this._slider('number.brew_flow_rate', 'Flow rate')}
        ${pattern ? html`<div class="gap">${this._chips(pattern, true, PATTERN_ICONS)}</div>` : nothing}
      </div>
      <div class="actions">
        <button class="pill on" ?disabled=${!this.entities['button.brew_standalone']}
          @click=${() => this._press('button.brew_standalone')}>Pour</button>
      </div>
      ${this._back()}
    `;
  }

  private _back() {
    return this.entities['button.back_to_home']
      ? html`<button class="link back" @click=${() => this._press('button.back_to_home')}>${BACK} Home screen</button>`
      : nothing;
  }

  // ── The next brew ──────────────────────────────────────────────────────

  /** Coffee Lab asking how the last brew was. */
  private _rating() {
    const question = this._usable('sensor.coffee_lab_rating_question');
    const rate = this._state('select.coffee_lab_rate_brew');
    if (!question || !rate) return nothing;
    const issue = this._usable('select.coffee_lab_cup_issue');
    return html`
      <h3>How was it?</h3>
      <p class="asked">${question.state}${question.attributes.bag ? html` <span class="muted">· ${question.attributes.bag}</span>` : nothing}</p>
      ${this._chips(rate, true)}
      ${issue ? html`<h4 class="gap">Anything off?</h4>${this._chips(issue, true)}` : nothing}
    `;
  }

  private _bag() {
    const bag = this._state('select.coffee_lab_active_bag');
    if (!bag) return nothing;
    const options: string[] = bag.attributes.options ?? [];
    if (!options.length) return nothing;
    const left = Number(bag.attributes.remaining_g ?? this._usable('sensor.coffee_lab_remaining')?.state);
    return html`
      <div class="opt">
        <span class="label">Coffee</span>
        <div>
          ${this._chips(bag, true)}
          ${Number.isFinite(left) && !UNUSABLE.includes(bag.state)
            ? html`<span class="muted left">${formatNumber(this.hass, left, '0')} g left</span>`
            : nothing}
        </div>
      </div>
    `;
  }

  /** The recipe card: its art, the picker, its numbers and its pours. */
  private _recipe(recipe: HassEntity, status: string) {
    const options: string[] = recipe.attributes.options ?? [];
    const chosen = this._chosen(recipe);
    const picked = !UNUSABLE.includes(recipe.state) && chosen === recipe.state;
    const locked = recipe.state === 'unavailable' || BUSY.includes(status);
    const open = this._picking || !picked;
    const r = { ...(recipe.attributes as Recipe), name: chosen };
    return html`
      ${picked ? recipeArt(this.hass, r, 'art', this._value('number.brew_dose', r.dose_g)) : nothing}
      <div class="inner">
        <div class="pick-head">
          <h3>${picked ? 'Selected recipe' : 'Pick a recipe'}</h3>
          ${picked
            ? html`<button class="picker" aria-expanded=${open} ?disabled=${locked}
                @click=${() => (this._picking = !this._picking)}>
                <span>${chosen}</span>${CHEVRON}
              </button>`
            : html`<button class="link" @click=${() => this._go('recipes')}>All recipes</button>`}
        </div>
        ${open && !locked
          ? html`<ul class="options" role="radiogroup" aria-label="Recipe" data-no-swipe>
              ${options.map(
                (o) => html`<li>
                  <button role="radio" aria-checked=${o === chosen} class=${o === chosen ? 'chosen' : ''}
                    @click=${() => {
                      this._picking = false;
                      this._adjusting = undefined;
                      if (o !== chosen) this._choose(recipe, o);
                    }}>
                    <span>${o}</span>${o === chosen ? icon('check', 22) : nothing}
                  </button>
                </li>`,
              )}
            </ul>`
          : nothing}
        ${picked && !this._picking ? html`${this._metrics(r, locked)}${pourTimeline(this.hass, r)}` : nothing}
      </div>
    `;
  }

  /** Dose, ratio, water, grind and temperature; dose, ratio and grind change on a tap. */
  private _metrics(r: Recipe, locked: boolean) {
    const dose = this._value('number.brew_dose', r.dose_g);
    const ratio = this._value('number.brew_ratio', ratioOf(r));
    const grind = this._value('number.brew_grind_size', grindOf(r));
    const fmt = (v: number, like = '0') => (Number.isFinite(v) ? formatNumber(this.hass, v, like) : '–');
    const tap = (key: string) =>
      locked || !this._usable(key)
        ? {}
        : { on: this._adjusting === key, onClick: () => (this._adjusting = this._adjusting === key ? undefined : key) };
    const adjusting = locked ? undefined : this._adjusting;
    return html`
      ${metricTiles([
        { label: 'Dose', value: html`${fmt(dose, '0.5')}<small>g</small>`, ...tap('number.brew_dose') },
        { label: 'Ratio', value: `1:${fmt(ratio, '0.5')}`, ...tap('number.brew_ratio') },
        { label: 'Water', value: html`${fmt(Math.round(dose * ratio))}<small>ml</small>` },
        { label: 'Grind', value: fmt(grind), ...tap('number.brew_grind_size') },
        { label: 'Temp', value: tempLabel(this.hass, r.pours?.[0]?.temperature_c) },
      ])}
      ${adjusting
        ? this._stepper(
            adjusting,
            ADJUST[adjusting] ?? 'Value',
            adjusting === 'number.brew_ratio' ? (v) => `1:${formatNumber(this.hass, v, '0.5')}` : undefined,
          )
        : nothing}
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
      ${taste ? html`<div class="opt"><span class="label">Taste</span>${this._chips(taste, true)}</div>` : nothing}
      ${grinder
        ? html`<div class="opt">
            <span class="label">Beans</span>
            <div class="chips wrap" role="radiogroup" aria-label="Beans" data-no-swipe>
              ${beans('Grind them', true)} ${beans('Already ground', false)}
            </div>
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
        <button class="pill on start-brew" ?disabled=${!isReady || busy} @click=${() => this._press('button.start_brew')}>
          ${icon('play', 22)} Start Brew
        </button>
        <div class="start-foot">
          <p class="muted" aria-live="polite">${note}</p>
          ${picked && !busy && this.entities['button.cancel_preparation']
            ? html`<button class="chip" @click=${() => {
                this._adjusting = undefined;
                this._press('button.cancel_preparation');
              }}>Clear recipe</button>`
            : nothing}
        </div>
      </div>
    `;
  }

  static styles = [
    controls,
    sectionLabel,
    studioStyles,
    css`
      :host {
        display: block;
        height: 100%;
      }

      .panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      luxframe-fit {
        flex: 1;
      }

      .pad {
        padding: 22px;
      }

      .panel.graph {
        padding: 18px 20px 16px;
      }

      .weigh {
        margin: 18px 0 6px;
      }

      .rating {
        align-self: stretch;
        margin-top: 22px;
        text-align: left;
      }

      /* The machine's side: centered, like the xBloom app's brew screen. */
      .hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .hero h2,
      .hero .controls {
        align-self: stretch;
        text-align: left;
      }

      .hero .actions {
        justify-content: center;
      }

      .ring {
        position: relative;
        width: min(260px, 70vw);
        aspect-ratio: 1;
      }

      .ring svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .ring circle {
        fill: none;
        stroke-width: 3;
      }

      .ring .track {
        stroke: var(--lf-control);
      }

      .ring .bar {
        stroke: var(--luxframe-xbloom-gold, #e8cd8f);
        stroke-linecap: round;
        transition: stroke-dashoffset 0.6s var(--lf-ease);
      }

      .ring-center {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }

      .sub {
        font-size: 17px;
      }

      .sub.muted {
        font-size: 15px;
      }

      .stages {
        display: flex;
        justify-content: space-between;
        gap: 6px;
        width: 100%;
        max-width: 380px;
        margin: 20px 0 0;
        padding: 0;
        list-style: none;
      }

      .stages li {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--lf-faint);
      }

      .stages .dots {
        width: 30px;
        height: 30px;
      }

      .stages li.done {
        color: color-mix(in srgb, var(--luxframe-xbloom-gold, #e8cd8f) 60%, transparent);
      }

      .stages li.active {
        color: var(--luxframe-xbloom-gold, #e8cd8f);
      }

      .stages li.active .dots {
        animation: pulse 1.6s ease-in-out infinite;
      }

      @keyframes pulse {
        50% {
          opacity: 0.45;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .stages li.active .dots {
          animation: none;
        }
      }

      .stats {
        display: flex;
        justify-content: center;
        gap: 40px;
        margin-top: 20px;
      }

      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }

      .stat .label {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--lf-muted);
      }

      .stat strong {
        font-size: 22px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }

      .chips.machine {
        justify-content: center;
        flex-wrap: wrap;
        margin-top: 18px;
      }

      .chips.machine .dots {
        width: 16px;
        height: 16px;
        color: var(--luxframe-xbloom-gold, #e8cd8f);
      }

      .back {
        margin-top: 16px;
      }

      .asked {
        margin: 6px 0 12px;
        font-size: 18px;
      }

      /* The recipe card: a banner on top, edge to edge. */
      .panel.recipe {
        padding: 0;
        overflow: hidden;
      }

      .inner {
        padding: 20px 22px 22px;
      }

      .pick-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
      }

      .pick-head h3 + * {
        margin-top: 0;
      }

      .picker {
        flex: 1 1 220px;
        max-width: 64%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 50px;
        padding: 0 16px 0 18px;
        border-radius: var(--lf-radius-s);
        background: var(--lf-control);
        font-size: 18px;
        text-align: left;
      }

      .picker span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .picker svg {
        flex: none;
        width: 20px;
        height: 20px;
        transition: transform var(--lf-move) var(--lf-ease);
      }

      .picker[aria-expanded='true'] svg {
        transform: rotate(180deg);
      }

      /* The next brew's settings: each one's name beside its chips. */
      .opt {
        display: grid;
        grid-template-columns: 78px 1fr;
        align-items: baseline;
        gap: 12px;
      }

      .opt + .opt {
        margin-top: 12px;
      }

      .opt .label {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--lf-muted);
      }

      .opt .left {
        display: block;
        margin-top: 6px;
        font-size: 14px;
      }

      .start {
        margin-top: 18px;
      }

      .start-brew {
        width: 100%;
      }

      .start-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        min-height: 44px;
        margin-top: 10px;
      }

      .start-foot p {
        margin: 0;
      }
    `,
  ];
}

define('luxframe-xbloom-card', LuxFrameXBloomCard);
