import { LitElement, css, html, nothing, svg, type TemplateResult } from 'lit';
import { numberRange, optionLabel, selectOption, setNumber } from '../../detail/helpers';
import { formatNumber } from '../../history';
import { icon } from '../../icons';
import { Pending } from '../../pending';
import '../../slider';
import type { HassEntity, HomeAssistant } from '../../types';

// What every part of the xBloom Studio view shares: finding the integration's
// entities, its recipe format, its services, a base element with the
// entity helpers, and the look (recipe art, number tiles, the pour timeline).

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

export const BUSY = ['grinding', 'brewing'];
export const UNUSABLE = ['unavailable', 'unknown', ''];

// ── Recipes ─────────────────────────────────────────────────────────────

export interface Pour {
  name?: string;
  volume_ml?: number;
  temperature_c?: number;
  flow_rate?: number;
  /** 1 centered, 2 spiral, 3 circular; or the name. */
  pattern?: number | string;
  pause_s?: number;
}

/** A recipe as xBloom Studio keeps it (`xbloom.list_recipes`, the Recipe select's attributes). */
export interface Recipe {
  id?: string | number;
  name: string;
  dose_g?: number;
  /** The ratio's denominator (16 for 1:16), or the total water in ml; see ratioOf. */
  water_ratio?: number;
  ratio?: string | number;
  grinder_size?: number;
  grind_size?: number;
  rpm?: number;
  grinder_speed_rpm?: number;
  /** 1 xPod, 2 Omni dripper, 3 Other, 4 Tea. */
  cup_type?: number;
  pours?: Pour[];
  /** 1 on, 2 off. */
  bypass_water_enabled?: number | boolean;
  bypass_volume_ml?: number;
  bypass_temp_c?: number;
  source?: string;
  [key: string]: unknown;
}

export const CUPS: Record<number, string> = { 1: 'xPod', 2: 'Omni dripper', 3: 'Other', 4: 'Tea' };
/** Each cup's dose range in grams, as xBloom allows. */
export const CUP_DOSE: Record<number, [number, number]> = { 1: [15, 15], 2: [5, 18], 3: [5, 25], 4: [1, 5] };

export const isTea = (r: Recipe): boolean => Number(r.cup_type) === 4;

/**
 * The ratio's denominator. xBloom's `water_ratio` holds it for recipes from
 * the cloud and total water for ones made locally; a ratio is never above 25
 * and water never below it, which tells them apart.
 */
export function ratioOf(r: Recipe): number | undefined {
  if (typeof r.ratio === 'string' && r.ratio.includes(':')) return Number(r.ratio.split(':')[1]) || undefined;
  if (typeof r.ratio === 'number') return r.ratio;
  const water = Number(r.water_ratio);
  if (!(water > 0)) return undefined;
  if (water <= 25) return water;
  const dose = Number(r.dose_g);
  return dose > 0 ? Math.round((water / dose) * 2) / 2 : undefined;
}

export const grindOf = (r: Recipe): number | undefined => r.grinder_size ?? r.grind_size;
export const rpmOf = (r: Recipe): number | undefined => r.rpm ?? r.grinder_speed_rpm;
export const pourTotal = (r: Recipe): number => (r.pours ?? []).reduce((t, p) => t + Number(p.volume_ml ?? 0), 0);
export const hasBypass = (r: Recipe): boolean =>
  (r.bypass_water_enabled === 1 || r.bypass_water_enabled === true) && Number(r.bypass_volume_ml) > 0;

/** "88°", or RT and BP at the machine's room-temperature and boiling ends. */
export function tempLabel(hass: HomeAssistant | undefined, c: unknown): string {
  const v = Number(c);
  if (c == null || !Number.isFinite(v)) return '–';
  if (v <= 20) return 'RT';
  if (v >= 98) return 'BP';
  return `${formatNumber(hass, v, '0')}°`;
}

// ── Calling the integration ─────────────────────────────────────────────

/** An `xbloom` service that answers, and its answer. */
export async function xbAsk<T = Record<string, any>>(
  hass: HomeAssistant | undefined,
  service: string,
  data: Record<string, unknown> = {},
): Promise<T | undefined> {
  if (!hass?.callWS) return undefined;
  const result = await hass.callWS<{ response?: T }>({
    type: 'call_service',
    domain: 'xbloom',
    service,
    service_data: data,
    return_response: true,
  });
  return result?.response;
}

/** An `xbloom` service run for what it does. */
export function xbDo(hass: HomeAssistant | undefined, service: string, data: Record<string, unknown> = {}) {
  return hass?.callService('xbloom', service, data);
}

// ── Words ───────────────────────────────────────────────────────────────

/** "less_sour" → "Less sour". */
export const humanize = (value: string): string => {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** "3:05". */
export const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

// ── Glyphs ──────────────────────────────────────────────────────────────

const PATTERN_CODES: Record<string, string> = { '1': 'centered', '2': 'spiral', '3': 'circular' };
export const PATTERN_API: Record<string, number> = { centered: 1, spiral: 2, circular: 3 };

/** A pour's pattern by name, from the machine's code or a name. */
export const patternOf = (value: unknown): string | undefined => {
  if (value == null || value === '') return undefined;
  const name = PATTERN_CODES[String(value)] ?? String(value).toLowerCase();
  return name in PATTERN_ICONS ? name : undefined;
};

export const glyph = (paths: unknown) =>
  html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const PATTERN_ICONS: Record<string, TemplateResult> = {
  centered: glyph(svg`<circle cx="12" cy="12" r="2.5" fill="currentColor" />`),
  circular: glyph(svg`<circle cx="12" cy="12" r="7" />`),
  spiral: glyph(svg`<path d="M12 12a1.6 1.6 0 0 1 3.2 0 3.2 3.2 0 0 1-6.4 0 4.8 4.8 0 0 1 9.6 0 6.4 6.4 0 0 1-12.8 0" />`),
};

export const CHEVRON = glyph(svg`<path d="M7 10l5 5 5-5" />`);
export const BACK = glyph(svg`<path d="M15 6l-6 6 6 6" />`);
export const UP = glyph(svg`<path d="M7 14l5-5 5 5" />`);

/** A picture drawn in dots, one row per string, `#` a dot. */
export function dots(rows: string[], className = 'dots', r = 0.34): TemplateResult {
  const w = Math.max(...rows.map((row) => row.length));
  const circles = rows.flatMap((row, y) =>
    [...row].map((c, x) => (c === '#' ? svg`<circle cx=${x + 0.5} cy=${y + 0.5} r=${r} />` : nothing)),
  );
  return html`<svg class=${className} viewBox="0 0 ${w} ${rows.length}" fill="currentColor" aria-hidden="true">${circles}</svg>`;
}

export const DROP_ROWS = ['....#....', '...###...', '..#####..', '.#######.', '#########', '#########', '.#######.', '..#####..', '...###...'];
const LEAF_ROWS = ['......###', '....#####', '..######.', '.######..', '#####....', '###......', '#........'];

/** The tabs' and stages' dot pictures. */
export const DOTS = {
  brew: dots(['...#...', '..###..', '.#####.', '#######', '#######', '.#####.', '..###..']),
  recipes: dots(['#.#####', '.......', '#.#####', '.......', '#.#####', '.......', '#.#####']),
  manual: dots(['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..###..']),
  settings: dots(['.#.....', '#######', '.#.....', '.......', '.....#.', '#######', '.....#.']),
  beans: dots(['..##..', '.####.', '##.###', '###.##', '.####.', '..##..']),
  grind: dots(['#.#.#', '.#.#.', '#.#.#', '.#.#.', '#.#.#']),
  pour: dots(['..#..', '.###.', '#####', '#####', '.###.']),
  enjoy: dots(['......', '#####.', '#####.', '####.#', '.###..', '......']),
};

/** A recipe's banner or card art: tinted by its name, with its dose (or water, for tea). */
export function recipeArt(hass: HomeAssistant | undefined, r: Recipe, className = 'art', dose?: number) {
  const tea = isTea(r);
  const g = dose ?? Number(r.dose_g);
  const figure = tea
    ? html`${formatNumber(hass, pourTotal(r), '0')}<small>ml</small>`
    : Number.isFinite(g)
      ? html`${formatNumber(hass, g, '0.5')}<small>g</small>`
      : nothing;
  return html`
    <div class=${`${className}${tea ? ' tea' : ''}`} style="--hue: ${hueOf(r.name, tea)}" aria-hidden="true">
      ${dots(tea ? LEAF_ROWS : DROP_ROWS, 'drop', 0.33)}
      <div class="figure">${figure}</div>
    </div>
  `;
}

/** A warm hue for a coffee, green for a tea; the same each time for the same name. */
export function hueOf(name: string, tea = false): number {
  let h = 7;
  for (const ch of name) h = (h * 33 + (ch.codePointAt(0) ?? 0)) % 1009;
  return tea ? 90 + (h % 50) : 16 + (h % 28);
}

export interface Metric {
  label: string;
  value: unknown;
  /** Makes the tile a button. */
  onClick?: () => void;
  on?: boolean;
}

/** A row of number tiles: a serif value over a small label. */
export function metricTiles(cells: Metric[]) {
  return html`<div class="metrics">
    ${cells.map(({ label, value, onClick, on }) => {
      const body = html`<span class="value">${value}</span><span class="label">${label}</span>`;
      return onClick
        ? html`<button class="metric ${on ? 'on' : ''}" aria-expanded=${Boolean(on)} aria-label="Change ${label.toLowerCase()}"
            @click=${onClick}>${body}</button>`
        : html`<div class="metric">${body}</div>`;
    })}
  </div>`;
}

/** Dose, ratio, water, grind and temperature of a recipe, as they are saved. */
export function recipeMetrics(hass: HomeAssistant | undefined, r: Recipe): Metric[] {
  const n = (v: unknown, like = '0') => (v != null && Number.isFinite(Number(v)) ? formatNumber(hass, Number(v), like) : '–');
  const temp = tempLabel(hass, r.pours?.[0]?.temperature_c);
  if (isTea(r)) {
    return [
      { label: 'Water', value: html`${n(pourTotal(r))}<small>ml</small>` },
      { label: 'Temp', value: temp },
      { label: 'Pours', value: n(r.pours?.length ?? 0) },
    ];
  }
  const ratio = ratioOf(r);
  const dose = Number(r.dose_g);
  return [
    { label: 'Dose', value: html`${n(dose, '0.5')}<small>g</small>` },
    { label: 'Ratio', value: `1:${n(ratio, '0.5')}` },
    { label: 'Water', value: html`${n(ratio ? dose * ratio : pourTotal(r))}<small>ml</small>` },
    { label: 'Grind', value: n(grindOf(r)) },
    { label: 'Temp', value: temp },
  ];
}

/** Each pour with the running total, then any bypass water. */
export function pourTimeline(hass: HomeAssistant | undefined, r: Recipe) {
  const pours = r.pours ?? [];
  if (!pours.length) return nothing;
  const n = (v: unknown, like = '0') => formatNumber(hass, Number(v), like);
  let total = 0;
  return html`
    <ol class="timeline">
      ${pours.map((p, i) => {
        total += Number(p.volume_ml ?? 0);
        const pattern = patternOf(p.pattern);
        return html`<li>
          <span class="step">${i + 1}</span>
          <div class="pour">
            <div class="vol">
              ${p.name ? html`<span class="pour-name">${p.name}</span>` : nothing}
              ${n(p.volume_ml ?? 0)} ml <span class="muted">→ ${n(total)} ml</span>
            </div>
            <div class="meta">
              ${p.temperature_c != null ? html`<span>${tempLabel(hass, p.temperature_c)}</span>` : nothing}
              ${p.flow_rate != null ? html`<span>${n(p.flow_rate, '0.1')} ml/s</span>` : nothing}
              ${pattern ? html`<span class="with-icon">${PATTERN_ICONS[pattern]}${humanize(pattern)}</span>` : nothing}
              ${Number(p.pause_s) ? html`<span class="with-icon">${icon('timer', 15)}${n(p.pause_s)}s</span>` : nothing}
            </div>
          </div>
        </li>`;
      })}
      ${hasBypass(r)
        ? html`<li class="bypass">
            <span class="step">+</span>
            <div class="pour">
              <div class="vol">Bypass ${n(r.bypass_volume_ml)} ml</div>
              ${r.bypass_temp_c != null ? html`<div class="meta"><span>${tempLabel(hass, r.bypass_temp_c)}</span></div>` : nothing}
            </div>
          </li>`
        : nothing}
    </ol>
  `;
}

// ── The base every part of the view builds on ───────────────────────────

/** Asks the view to change tab: `detail` is the tab. */
export const TAB_EVENT = 'xbloom-tab';
/** Asks the view to fetch the recipes again. */
export const RELOAD_EVENT = 'xbloom-reload';

export class StudioBase extends LitElement {
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

  protected _state(key: string): HassEntity | undefined {
    const id = this.entities[key];
    return id ? this.hass?.states[id] : undefined;
  }

  protected _usable(key: string): HassEntity | undefined {
    const s = this._state(key);
    return s && !UNUSABLE.includes(s.state) ? s : undefined;
  }

  protected _press(key: string): void {
    const id = this.entities[key];
    if (id) this.hass?.callService('button', 'press', { entity_id: id });
  }

  protected _toggle(key: string): void {
    const id = this.entities[key];
    if (id) this.hass?.callService('switch', 'toggle', { entity_id: id });
  }

  protected _go(tab: string): void {
    this.dispatchEvent(new CustomEvent(TAB_EVENT, { detail: tab, bubbles: true, composed: true }));
  }

  protected _reload(): void {
    this.dispatchEvent(new CustomEvent(RELOAD_EVENT, { bubbles: true, composed: true }));
  }

  /** An option as the integration words it, else in plain words. */
  protected _label(s: HassEntity, option: string): string {
    const shown = optionLabel(this.hass, s, option);
    return shown === option ? humanize(option) : shown;
  }

  protected _chosen(s: HassEntity): string {
    return (this._pending(s.entity_id).get(s.state) as string | undefined) ?? s.state;
  }

  protected _choose(s: HassEntity, option: string): void {
    this._pending(s.entity_id).release(option);
    selectOption(this.hass, s, option);
  }

  protected _pending(id: string): Pending<number | string> {
    let p = this._sent.get(id);
    if (!p) this._sent.set(id, (p = new Pending<number | string>(this)));
    return p;
  }

  protected _number(s: HassEntity, reported: number): number {
    const held = this._pending(s.entity_id).get(reported);
    return typeof held === 'number' ? held : reported;
  }

  /** A number entity's value, held while it's being changed, else `fallback`. */
  protected _value(key: string, fallback?: unknown): number {
    const s = this._usable(key);
    return s ? this._number(s, Number(s.state)) : Number(fallback ?? NaN);
  }

  protected _setNumber(s: HassEntity, value: number): void {
    const { min, max } = numberRange(s);
    const next = Math.max(min, Math.min(max, value));
    this._pending(s.entity_id).release(next);
    setNumber(this.hass, s, next);
  }

  protected _weight(): string {
    const w = this._usable('sensor.scale_weight');
    return w ? `${formatNumber(this.hass, Number(w.state), '0.1')} g` : '– g';
  }

  /** A select's options as chips, the chosen one lit. */
  protected _chips(s: HassEntity, wrap = false, icons?: Record<string, unknown>) {
    const options: string[] = s.attributes.options ?? [];
    const chosen = this._chosen(s);
    return html`
      <div class="chips ${wrap ? 'wrap' : ''}" role="radiogroup" aria-label=${s.attributes.friendly_name ?? ''} data-no-swipe>
        ${options.map(
          (o) => html`<button class="chip ${o === chosen ? 'on' : ''} ${icons?.[o] ? 'with-icon' : ''}" role="radio"
            aria-checked=${o === chosen} ?disabled=${s.state === 'unavailable'} @click=${() => this._choose(s, o)}>
            ${icons?.[o] ?? nothing}${this._label(s, o)}</button>`,
        )}
      </div>
    `;
  }

  protected _numberParts(key: string, format?: (v: number) => string) {
    const s = this._state(key);
    if (!s) return undefined;
    const { min, max, step, value: reported, unit } = numberRange(s);
    const value = this._number(s, reported);
    const text = format ?? ((v: number) => `${formatNumber(this.hass, v, String(step))}${unit ? ` ${unit}` : ''}`);
    const unavailable = UNUSABLE.includes(s.state) || !Number.isFinite(value);
    const by = (n: number) => Math.round((value + n * step) / step) * step;
    return { s, min, max, step, value, text, unavailable, by };
  }

  /** A number with a step down and up, in a row. */
  protected _stepper(key: string, label: string, format?: (v: number) => string) {
    const n = this._numberParts(key, format);
    if (!n) return nothing;
    return html`
      <div class="adjust">
        <span class="muted">${label}</span>
        <div class="stepper">
          <button class="round small" aria-label="Less ${label.toLowerCase()}" ?disabled=${n.unavailable || n.value <= n.min}
            @click=${() => this._setNumber(n.s, n.by(-1))}>${icon('minus', 20)}</button>
          <strong aria-live="polite">${n.unavailable ? '–' : n.text(n.value)}</strong>
          <button class="round small" aria-label="More ${label.toLowerCase()}" ?disabled=${n.unavailable || n.value >= n.max}
            @click=${() => this._setNumber(n.s, n.by(1))}>${icon('plus', 20)}</button>
        </div>
      </div>
    `;
  }

  /** A number as a wide slider, its value over it. */
  protected _slider(key: string, label: string, format?: (v: number) => string) {
    const n = this._numberParts(key, format);
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

  /** The brewer's temperature, with its ends as the machine names them. */
  protected _temp = (v: number): string => {
    const s = this._state('number.brew_temperature');
    const { min, max } = s ? numberRange(s) : { min: -Infinity, max: Infinity };
    if (v <= min) return 'RT';
    if (v >= max) return 'BP';
    return `${formatNumber(this.hass, v, '0')} °C`;
  };
}

// ── The look ────────────────────────────────────────────────────────────

const SERIF = css`var(--luxframe-serif, 'Iowan Old Style', 'New York', ui-serif, 'Palatino Linotype', Palatino, Georgia, serif)`;
const GOLD = css`var(--luxframe-xbloom-gold, #e8cd8f)`;

export const studioStyles = css`
  :host {
    display: block;
    color: var(--lf-text);
    font-family: var(--lf-font);
  }

  .panel {
    box-sizing: border-box;
    min-width: 0;
    padding: 22px;
    border-radius: var(--lf-radius);
  }

  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr));
    gap: var(--lf-gap);
    align-items: start;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--lf-gap);
    min-width: 0;
  }

  .gap {
    margin-top: 24px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 14px;
    font-size: 20px;
    font-weight: 600;
  }

  h2 .dots {
    width: 20px;
    height: 20px;
    color: ${GOLD};
  }

  h4 {
    margin-bottom: 10px;
  }

  h3 + * {
    margin-top: 12px;
  }

  p {
    line-height: 1.45;
  }

  .row-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
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

  .chip.with-icon {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .chip.with-icon svg {
    width: 18px;
    height: 18px;
  }

  .note {
    margin: 12px 0 0;
    color: var(--lf-muted);
    font-size: 15px;
  }

  .error {
    margin: 12px 0 0;
    color: var(--lf-danger);
    font-size: 15px;
  }

  .slide {
    margin-top: 16px;
  }

  .slide .muted {
    font-size: 14px;
  }

  .slide strong {
    font-variant-numeric: tabular-nums;
  }

  .slide luxframe-slider {
    display: block;
    margin-top: 8px;
  }

  /* Rows of settings: words on the left, the control on the right. */
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px 16px;
    min-height: 56px;
    padding: 6px 0;
  }

  .row + .row {
    border-top: 1px solid var(--lf-control-row);
  }

  .row > span:first-child {
    font-size: 17px;
  }

  .kv {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 0;
    font-size: 16px;
  }

  .kv + .kv {
    border-top: 1px solid var(--lf-control-row);
  }

  .kv span:last-child {
    color: var(--lf-muted);
    text-align: right;
    overflow-wrap: anywhere;
  }

  .badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 999px;
    /* Dark enough behind the gold for it to read on light glass too. */
    background: color-mix(in srgb, ${GOLD} 20%, rgb(0 0 0 / 34%));
    color: ${GOLD};
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .badge.tea {
    background: color-mix(in srgb, #a5d38a 20%, rgb(0 0 0 / 34%));
    color: #b9e0a0;
  }

  /* Recipe art: a banner tinted per recipe, a dotted drop, the dose. */
  .art,
  .art-card,
  .art-hero {
    position: relative;
    overflow: hidden;
    color: rgb(255 255 255 / 92%);
    background:
      radial-gradient(90% 130% at 85% 0%, hsl(var(--hue) 50% 40% / 90%), transparent 62%),
      linear-gradient(165deg, hsl(var(--hue) 32% 22%), hsl(var(--hue) 22% 9%));
  }

  .art {
    height: 128px;
  }

  .art-card {
    aspect-ratio: 16 / 9;
  }

  .art-hero {
    height: 180px;
    border-radius: var(--lf-radius-icon);
  }

  .drop {
    position: absolute;
    right: 7%;
    top: 50%;
    height: 76%;
    transform: translateY(-50%);
    opacity: 0.24;
  }

  .figure {
    position: absolute;
    left: 20px;
    bottom: 14px;
    font-size: 40px;
    letter-spacing: -0.01em;
  }

  .art-card .figure {
    left: 16px;
    bottom: 10px;
    font-size: 28px;
  }

  .figure,
  .metric .value,
  .serif,
  .big {
    font-family: ${SERIF};
    font-variant-numeric: tabular-nums;
  }

  .figure small,
  .metric small,
  .big small {
    margin-left: 3px;
    font-family: var(--lf-font);
    font-size: 13px;
    opacity: 0.7;
  }

  .big {
    font-size: clamp(52px, 8vw, 72px);
    font-weight: 400;
    letter-spacing: -0.02em;
    line-height: 1;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
    gap: 8px;
    margin-top: 18px;
  }

  .metric {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 14px 4px 12px;
    border-radius: var(--lf-radius-icon);
    background: var(--lf-control-row);
    color: inherit;
  }

  button.metric {
    background: var(--lf-control);
    transition:
      transform var(--lf-fast),
      background-color var(--lf-move),
      color var(--lf-move);
  }

  button.metric.on {
    color: var(--lf-text-active);
    background: var(--lf-surface-active);
  }

  button.metric:active {
    transform: scale(0.96);
  }

  .metric .value {
    font-size: 28px;
    line-height: 1.1;
    white-space: nowrap;
  }

  .metric .label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--lf-muted);
  }

  .metric.on .label {
    color: var(--lf-muted-active);
  }

  .adjust {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
    padding: 8px 8px 8px 16px;
    border-radius: var(--lf-radius-icon);
    background: var(--lf-control-row);
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .stepper strong {
    min-width: 64px;
    text-align: center;
    font-size: 20px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* Each pour as a numbered step, joined by a dotted line. */
  .timeline {
    display: flex;
    flex-direction: column;
    margin: 22px 0 0;
    padding: 0;
    list-style: none;
  }

  .timeline li {
    position: relative;
    display: flex;
    gap: 14px;
    padding-bottom: 14px;
  }

  .timeline li:last-child {
    padding-bottom: 0;
  }

  .timeline li:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 15px;
    top: 36px;
    bottom: 4px;
    border-left: 2px dotted var(--lf-faint);
  }

  .step {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    /* Dark enough for the gold to read on light glass too. */
    background: rgb(0 0 0 / 26%);
    color: ${GOLD};
    font-size: 14px;
    font-weight: 700;
  }

  .bypass .step {
    color: var(--lf-muted);
  }

  .pour {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding-top: 4px;
  }

  .vol {
    font-size: 17px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .pour-name {
    margin-right: 8px;
    color: ${GOLD};
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: 15px;
    color: var(--lf-muted);
    font-variant-numeric: tabular-nums;
  }

  .with-icon {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .with-icon svg {
    width: 17px;
    height: 17px;
  }

  /* A list of choices, the chosen one lit. */
  .options {
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
    max-height: 320px;
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

  /* A text box. */
  .field {
    box-sizing: border-box;
    width: 100%;
    min-height: 50px;
    padding: 0 16px;
    border: 0;
    border-radius: var(--lf-radius-s);
    background: var(--lf-control);
    color: var(--lf-text);
    font: inherit;
    font-size: 17px;
  }

  .field::placeholder {
    color: var(--lf-faint);
  }

  .link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    padding: 0 12px 0 4px;
    border-radius: 999px;
    background: none;
    color: var(--lf-muted);
    font-size: 17px;
  }

  .link svg {
    width: 22px;
    height: 22px;
  }
`;
