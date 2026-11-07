import { LitElement, html, nothing } from 'lit';
import { define } from '../define';
import { pageStyles } from '../theme';
import type { HomeAssistant, ScenesPageConfig } from '../types';

/** One-tap scenes and scripts. */
export class LuxFrameScenes extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare config?: ScenesPageConfig;

  protected render() {
    if (!this.config) return nothing;
    return html`
      <div class="head"><h1>${this.config.title ?? 'Scenes'}</h1></div>
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
