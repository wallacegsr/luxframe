import { css, html, nothing } from 'lit';
import { define } from '../../define';
import { formatNumber } from '../../history';
import { controls, sectionLabel } from '../../theme';
import { BUSY, DOTS, PATTERN_ICONS, StudioBase, studioStyles } from './shared';

/**
 * The Manual tab: the grinder, the brewer and the scale on their own, as on
 * the machine's own screens. Grind and Pour run at once with the settings
 * here; Scale mode opens the scale on the machine.
 */
export class LuxFrameXBloomManual extends StudioBase {
  protected render() {
    const status = this._state('sensor.brew_status')?.state ?? 'unknown';
    const busy = BUSY.includes(status);
    const module = this._usable('sensor.current_module')?.state ?? 'home';
    const pattern = this._state('select.brew_pattern');
    const w = Number(this._usable('sensor.scale_weight')?.state);
    return html`
      <p class="hint muted">Grind and Pour start straight away with these settings. Put a cup or the grounds bin in place first.</p>
      <div class="cols">
        <section class="panel glass">
          <h2>${DOTS.grind} Grinder</h2>
          ${this._slider('number.grind_size', 'Grind size')}
          ${this._slider('number.grind_speed', 'Speed')}
          <div class="actions">
            <button class="pill on" ?disabled=${busy || !this.entities['button.grind']}
              @click=${() => this._press('button.grind')}>Grind</button>
          </div>
        </section>

        <section class="panel glass">
          <h2>${DOTS.pour} Pour</h2>
          ${this._slider('number.brew_volume', 'Water')}
          ${this._slider('number.brew_temperature', 'Temperature', this._temp)}
          ${this._slider('number.brew_flow_rate', 'Flow rate')}
          ${pattern ? html`<h4 class="gap">Pattern</h4>${this._chips(pattern, true, PATTERN_ICONS)}` : nothing}
          <div class="actions">
            <button class="pill on" ?disabled=${busy || !this.entities['button.brew_standalone']}
              @click=${() => this._press('button.brew_standalone')}>Pour</button>
          </div>
        </section>

        <section class="panel glass scale">
          <h2>${DOTS.enjoy} Scale</h2>
          <div class="big center" aria-live="polite">${Number.isFinite(w) ? formatNumber(this.hass, w, '0.1') : '–'}<small>g</small></div>
          <div class="actions">
            <button class="pill glass" @click=${() => this._press('button.tare_scale')}>Tare</button>
            ${module === 'scale'
              ? html`<button class="pill glass" @click=${() => this._press('button.back_to_home')}>Leave scale mode</button>`
              : html`<button class="pill glass" ?disabled=${busy || !this.entities['button.go_to_scale']}
                  @click=${() => this._press('button.go_to_scale')}>Scale mode</button>`}
          </div>
        </section>
      </div>
    `;
  }

  static styles = [
    controls,
    sectionLabel,
    studioStyles,
    css`
      .hint {
        margin: 0 0 var(--lf-gap);
        font-size: 15px;
      }

      .center {
        margin: 18px 0 6px;
        text-align: center;
      }

      .scale .actions {
        justify-content: center;
      }
    `,
  ];
}

define('luxframe-xbloom-manual', LuxFrameXBloomManual);
