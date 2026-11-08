import { css } from 'lit';

// Design tokens live on the frame's host and inherit into every page's shadow
// root, so a page only ever reads var(--lf-*) and never picks its own colors.
//
// Each token resolves in this order:
//   1. --luxframe-<name>, which any Home Assistant theme can set;
//   2. with `theme: ha`, the matching Home Assistant theme variable;
//   3. LuxFrame's own glass look, in its light or dark variant.
//
// The glass takes on the background's color through --lf-tint: the card's
// `tint` option (--lf-tint-config), else a theme's luxframe-tint, else the
// average color of the background image (--lf-tint-auto), else a default
// matched to the built-in gradient.
export const tokens = css`
  :host {
    --lf-backdrop: var(
      --luxframe-backdrop,
      radial-gradient(110% 80% at 12% 8%, #d2a882 0%, transparent 58%),
      radial-gradient(90% 75% at 92% 92%, #6d8193 0%, transparent 60%),
      linear-gradient(160deg, #8e7d6c 0%, #5c5955 100%)
    );
    --lf-tint: var(--lf-tint-config, var(--luxframe-tint, var(--lf-tint-auto, #a77d58)));
    --lf-surface: var(
      --luxframe-surface,
      color-mix(in srgb, var(--lf-tint) 38%, rgb(255 255 255 / 16%))
    );
    --lf-surface-active: var(--luxframe-surface-active, rgb(255 255 255 / 92%));
    --lf-blur: var(--luxframe-blur, blur(20px) saturate(140%));
    /* Sheets and panels over the pages blur harder and sit on a darker glass. */
    --lf-blur-strong: var(--luxframe-blur-strong, blur(40px) saturate(150%));
    --lf-sheet: var(
      --luxframe-sheet,
      color-mix(in srgb, var(--lf-tint, #000) 45%, rgb(20 20 20 / 62%))
    );
    --lf-shadow: var(
      --luxframe-shadow,
      inset 0.5px 0.5px 1px rgb(255 255 255 / 40%),
      inset -0.5px -0.5px 1px rgb(255 255 255 / 10%),
      0 1px 2px rgb(0 0 0 / 10%)
    );
    --lf-text: var(--luxframe-text, rgb(255 255 255 / 96%));
    --lf-muted: var(--luxframe-muted, rgb(255 255 255 / 68%));
    --lf-faint: var(--luxframe-faint, rgb(255 255 255 / 38%));
    --lf-text-active: var(--luxframe-text-active, #1c1b1a);
    --lf-muted-active: var(--luxframe-muted-active, #66615a);
    --lf-accent: var(--luxframe-accent, #ff9f0a);

    --lf-radius: var(--luxframe-radius, 22px);
    --lf-font: var(
      --luxframe-font,
      'Inter',
      system-ui,
      -apple-system,
      'Segoe UI',
      Roboto,
      sans-serif
    );
    --lf-gap: 14px;
    --lf-pad: clamp(20px, 4vw, 48px);

    color-scheme: dark;
  }

  :host([dark]) {
    --lf-backdrop: var(
      --luxframe-backdrop,
      radial-gradient(110% 80% at 18% 0%, #3a2f4d 0%, transparent 58%),
      radial-gradient(90% 75% at 88% 100%, #17384a 0%, transparent 56%),
      linear-gradient(160deg, #19181b 0%, #09090b 100%)
    );
    --lf-tint: var(--lf-tint-config, var(--luxframe-tint, var(--lf-tint-auto, #3b3150)));
    --lf-surface: var(
      --luxframe-surface,
      color-mix(in srgb, var(--lf-tint) 30%, rgb(255 255 255 / 7%))
    );
    --lf-surface-active: var(--luxframe-surface-active, rgb(255 255 255 / 86%));
  }

  /* style: flat, or a device too slow to blur: solid tiles, no blur. */
  :host([flat]) {
    --lf-blur: var(--luxframe-blur, none);
    --lf-blur-strong: var(--luxframe-blur-strong, none);
    --lf-surface: var(--luxframe-surface, color-mix(in srgb, var(--lf-tint) 62%, rgb(70 66 62)));
    --lf-sheet: var(--luxframe-sheet, color-mix(in srgb, var(--lf-tint) 32%, rgb(24 24 24)));
  }

  :host([dark][flat]) {
    --lf-surface: var(--luxframe-surface, color-mix(in srgb, var(--lf-tint) 32%, rgb(34 34 38)));
    --lf-sheet: var(--luxframe-sheet, color-mix(in srgb, var(--lf-tint) 22%, rgb(16 16 18)));
  }

  /* theme: ha borrows the active Home Assistant theme's own variables. */
  :host([ha-theme]) {
    --lf-backdrop: var(
      --luxframe-backdrop,
      var(--lovelace-background, var(--primary-background-color))
    );
    --lf-surface: var(
      --luxframe-surface,
      var(--ha-card-background, var(--card-background-color))
    );
    --lf-surface-active: var(
      --luxframe-surface-active,
      color-mix(in srgb, var(--lf-accent) 22%, var(--lf-surface))
    );
    --lf-blur: var(--luxframe-blur, var(--ha-card-backdrop-filter, none));
    --lf-shadow: var(--luxframe-shadow, var(--ha-card-box-shadow, none));
    --lf-text: var(--luxframe-text, var(--primary-text-color));
    --lf-muted: var(--luxframe-muted, var(--secondary-text-color));
    --lf-faint: var(--luxframe-faint, var(--disabled-text-color));
    --lf-text-active: var(--luxframe-text-active, var(--primary-text-color));
    --lf-muted-active: var(--luxframe-muted-active, var(--secondary-text-color));
    --lf-accent: var(
      --luxframe-accent,
      var(--state-icon-active-color, var(--state-light-active-color, var(--primary-color)))
    );
    --lf-radius: var(--luxframe-radius, var(--ha-card-border-radius, 12px));
    --lf-font: var(--luxframe-font, var(--ha-font-family-body, Roboto, sans-serif));

    color-scheme: normal;
  }
`;

/** A frosted panel: tiles, the weather pill, anything that sits on the backdrop. */
export const glass = css`
  .glass {
    background: var(--lf-surface);
    -webkit-backdrop-filter: var(--lf-blur);
    backdrop-filter: var(--lf-blur);
    box-shadow: var(--lf-shadow);
  }
`;

/** The box every tile kind shares; pair with `glass` for the frosted ones. */
export const tileBase = css`
  :host {
    display: block;
    height: 100%;
    min-height: 0;
  }

  .tile {
    position: relative;
    box-sizing: border-box;
    height: 100%;
    overflow: hidden;
    border-radius: var(--lf-radius);
    color: var(--lf-text);
    font-family: var(--lf-font);
    -webkit-tap-highlight-color: transparent;
  }

  .tile.active {
    background: var(--lf-surface-active);
    color: var(--lf-text-active);
  }

  .muted {
    color: var(--lf-muted);
  }

  .active .muted {
    color: var(--lf-muted-active);
  }
`;

/** Shared page chrome: padding, title row and the tile grid. */
export const pageStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    height: 100%;
    padding: var(--lf-pad);
    overflow-y: auto;
    color: var(--lf-text);
    font-family: var(--lf-font);
  }

  .head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 12px 20px;
    margin-bottom: 28px;
  }

  h1 {
    margin: 0;
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
    gap: var(--lf-gap);
  }
`;
