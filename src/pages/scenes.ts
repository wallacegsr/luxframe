import { LitElement, html, nothing } from 'lit';
import { type BadgeItem } from '../badges';
import { define } from '../define';
import { pageStyles } from '../theme';
import type { HomeAssistant, ScenesPageConfig } from '../types';

/** One-tap scenes and scripts. */
export class LuxFrameScenes extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    badges: { attribute: false },
    editing: { type: Boolean, reflect: true },
  };

  declare hass?: HomeAssistant;
  declare config?: ScenesPageConfig;
  /** The title bar's badges, worked out by the frame. */
  declare badges?: BadgeItem[];
  declare editing?: boolean;

  protected render() {
    if (!this.config) return nothing;
    return html`
      <div class="head"><h1>${this.config.title ?? 'Scenes'}</h1>
        ${this.editing || this.badges?.length ? html`<luxframe-badges .hass=${this.hass} .items=${this.badges ?? []} ?editing=${this.editing}></luxframe-badges>` : nothing}
      </div>
      <div class="grid">
        ${(this.config.scenes ?? []).map(
          (scene) => html`<luxframe-tile .hass=${this.hass} .entity=${scene} subtitle="state"></luxframe-tile>`,
        )}
      </div>
    `;
  }

  static styles = pageStyles;
}

define('luxframe-scenes', LuxFrameScenes);
