import { LitElement } from 'lit';
import type { HomeAssistant, TileSize } from '../types';

/** A tile element that takes `hass`, its config and a size. */
export class SizedTile extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    size: { reflect: true },
  };

  declare hass?: HomeAssistant;
  declare size: TileSize;

  constructor() {
    super();
    this.size = 's';
  }
}
