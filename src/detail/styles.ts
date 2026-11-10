import { css } from 'lit';
import { controls } from '../theme';

/**
 * Shared by every detail view. A view is a status line under the header,
 * then a layout that fills the rest: stacked in portrait, the main control
 * beside the rest in landscape.
 */
export const detailStyles = [
  controls,
  css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      width: 100%;
      min-height: 100%;
      color: var(--lf-text);
      font-family: var(--lf-font);
    }

    .status {
      font-size: 24px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }

    .status .muted,
    .muted {
      color: var(--lf-muted);
      font-weight: 400;
    }

    .layout {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
    }

    .side {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
    }

    @media (orientation: landscape) {
      .layout {
        flex-direction: row;
        gap: 56px;
      }
    }

    .big {
      width: var(--lf-detail-big-width, clamp(112px, 13vw, 150px));
      height: var(--lf-detail-big-height, min(50vh, 440px));
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
    }

    /* A large round icon for things with no slider: a lock, a plain switch. */
    .orb {
      display: grid;
      place-items: center;
      width: 148px;
      height: 148px;
      padding: 0;
      border-radius: 50%;
      --mdc-icon-size: 64px;
      --state-icon-color: currentColor;
    }

    .orb.on {
      color: var(--tile-color, var(--lf-accent));
    }

    .glyph {
      font-size: 48px;
      font-weight: 600;
    }

    .swatch {
      width: 44px;
      height: 44px;
      padding: 0;
      border-radius: 50%;
      box-shadow:
        inset 0 0 0 2px rgb(255 255 255 / 70%),
        0 1px 4px rgb(0 0 0 / 25%);
    }

    .swatch.selected {
      box-shadow:
        0 0 0 3px var(--lf-text),
        0 1px 4px rgb(0 0 0 / 25%);
    }

    .wide {
      width: min(360px, 80vw);
    }
  `,
];
