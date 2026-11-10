import { LitElement, html, nothing } from 'lit';
import { type BadgeItem } from '../badges';
import { define } from '../define';
import { pageStyles } from '../theme';
import type { HomeAssistant, RoomPageConfig } from '../types';

/** A room: its title, its sensors and badges beside it, and a grid of tiles. */
export class LuxFrameRoom extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    badges: { attribute: false },
    editing: { type: Boolean, reflect: true },
  };

  declare hass?: HomeAssistant;
  declare config?: RoomPageConfig;
  /** The title bar's badges, worked out by the frame. */
  declare badges?: BadgeItem[];
  declare editing?: boolean;

  protected render() {
    if (!this.config) return nothing;
    return html`
      <div class="head">
        <h1>${this.config.title}</h1>
        ${this.editing || this.badges?.length ? html`<luxframe-badges .hass=${this.hass} .items=${this.badges ?? []} ?editing=${this.editing}></luxframe-badges>` : nothing}
      </div>
      <div class="grid">
        ${(this.config.entities ?? []).map(
          (entity) => html`<luxframe-tile .hass=${this.hass} .entity=${entity} subtitle="state"></luxframe-tile>`,
        )}
      </div>
    `;
  }

  static styles = pageStyles;
}

define('luxframe-room', LuxFrameRoom);
