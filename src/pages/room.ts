import { LitElement, html, nothing } from 'lit';
import { define } from '../define';
import { stateLabel } from '../entity';
import { pageStyles } from '../theme';
import type { HomeAssistant, RoomPageConfig } from '../types';

/** A room: its title, a few read-only sensor chips and a grid of tiles. */
export class LuxFrameRoom extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare config?: RoomPageConfig;

  protected render() {
    if (!this.config) return nothing;
    const sensors = (this.config.sensors ?? [])
      .map((id) => this.hass?.states[id])
      .filter((s) => s !== undefined);

    return html`
      <div class="head">
        <h1>${this.config.title}</h1>
        ${sensors.length
          ? html`<div class="chips">
              ${sensors.map((s) => html`<span>${stateLabel(this.hass, s)}</span>`)}
            </div>`
          : nothing}
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
