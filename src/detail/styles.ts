import { css } from 'lit';

/**
 * Shared by every detail view. A view is a status line, then a layout that
 * stacks in portrait and puts the main control beside the rest in landscape.
 */
export const detailStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    width: 100%;
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
    display: flex;
    flex-direction: column;
    align-items: center;
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

  button {
    font: inherit;
    color: inherit;
    border: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  button:focus-visible {
    outline: 3px solid var(--lf-accent);
    outline-offset: 2px;
  }

  .glass {
    background: var(--lf-surface);
    -webkit-backdrop-filter: var(--lf-blur);
    backdrop-filter: var(--lf-blur);
    box-shadow: var(--lf-shadow);
  }

  .on {
    background: var(--lf-surface-active);
    color: var(--lf-text-active);
  }

  /* The main action: Turn On, Lock, Run. */
  .pill {
    min-width: 220px;
    min-height: 56px;
    padding: 0 28px;
    border-radius: 999px;
    font-size: 18px;
    font-weight: 600;
  }

  .chip {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 999px;
    font-size: 16px;
    font-weight: 500;
  }

  .round {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    padding: 0;
    border-radius: 50%;
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
    color: var(--lf-accent);
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
    box-shadow: inset 0 0 0 2px rgb(255 255 255 / 70%), 0 1px 4px rgb(0 0 0 / 25%);
  }

  .swatch.selected {
    box-shadow: 0 0 0 3px var(--lf-text), 0 1px 4px rgb(0 0 0 / 25%);
  }

  .wide {
    width: min(360px, 80vw);
  }
`;
