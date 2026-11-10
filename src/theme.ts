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
    --lf-danger: var(--luxframe-danger, #ff453a);
    --lf-success: var(--luxframe-success, #30d158);
    /* Icons of things that are on, by kind, as Apple's Home app colors them. */
    --lf-color-light: var(--luxframe-color-light, #ffd60a);
    --lf-color-fan: var(--luxframe-color-fan, #5ac8fa);
    --lf-color-switch: var(--luxframe-color-switch, #30d158);
    --lf-color-lock: var(--luxframe-color-lock, #0a84ff);
    --lf-color-cover: var(--luxframe-color-cover, #64d2ff);
    --lf-color-media: var(--luxframe-color-media, #bf5af2);
    /* A button, chip or field on glass or a sheet; a list row pressed. */
    --lf-control: var(--luxframe-control, rgb(255 255 255 / 12%));
    --lf-control-row: var(--luxframe-control-row, rgb(255 255 255 / 8%));

    --lf-radius: var(--luxframe-radius, 22px);
    /* Fields, list rows and small artwork; icon squares such as the dock's. */
    --lf-radius-s: var(--luxframe-radius-s, 12px);
    --lf-radius-icon: var(--luxframe-radius-icon, 16px);
    /* A press or a fade; something moving into place. */
    --lf-fast: 150ms;
    --lf-move: 220ms;
    --lf-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
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
    --lf-danger: var(--luxframe-danger, var(--error-color, #ff453a));
    --lf-success: var(--luxframe-success, var(--success-color, #30d158));
    --lf-color-light: var(--luxframe-color-light, var(--state-light-active-color, #ffd60a));
    --lf-color-fan: var(--luxframe-color-fan, var(--state-fan-active-color, #5ac8fa));
    --lf-color-switch: var(--luxframe-color-switch, var(--state-switch-active-color, #30d158));
    --lf-color-lock: var(--luxframe-color-lock, var(--state-lock-unlocked-color, #0a84ff));
    --lf-color-cover: var(--luxframe-color-cover, var(--state-cover-active-color, #64d2ff));
    --lf-color-media: var(--luxframe-color-media, var(--state-media_player-active-color, #bf5af2));
    --lf-control: var(--luxframe-control, color-mix(in srgb, var(--lf-text) 10%, transparent));
    --lf-control-row: var(--luxframe-control-row, color-mix(in srgb, var(--lf-text) 6%, transparent));
    --lf-radius: var(--luxframe-radius, var(--ha-card-border-radius, 12px));
    --lf-radius-s: var(--luxframe-radius-s, min(12px, var(--lf-radius)));
    --lf-radius-icon: var(--luxframe-radius-icon, min(16px, var(--lf-radius)));
    --lf-font: var(--luxframe-font, var(--ha-font-family-body, Roboto, sans-serif));

    color-scheme: normal;
  }
`;

/**
 * The buttons every part of LuxFrame shares: chips (a choice), pills (the
 * main action), round ones (an icon), and how they press, disable and focus.
 * `.on` is the chosen or active one; `.glass` makes one frosted instead of
 * flat.
 */
export const controls = css`
  button {
    font: inherit;
    color: inherit;
    border: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 3px solid var(--lf-accent);
    outline-offset: 2px;
  }

  .chip,
  .pill,
  .round {
    transition:
      transform var(--lf-fast),
      background-color var(--lf-move),
      color var(--lf-move);
  }

  .chip:active:not(:disabled),
  .pill:active:not(:disabled),
  .round:active:not(:disabled) {
    transform: scale(0.96);
  }

  .chip {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 999px;
    font-size: 17px;
    font-weight: 500;
    background: var(--lf-control);
  }

  .pill {
    min-width: 220px;
    min-height: 56px;
    padding: 0 28px;
    border-radius: 999px;
    font-size: 17px;
    font-weight: 600;
    background: var(--lf-control);
  }

  .round {
    flex: none;
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    padding: 0;
    border-radius: 50%;
    background: var(--lf-control);
  }

  .round.small {
    width: 44px;
    height: 44px;
  }

  .round.big {
    width: 72px;
    height: 72px;
  }

  /* An icon button with nothing behind it. */
  .round.plain {
    background: none;
    color: var(--lf-muted);
  }

  .on {
    color: var(--lf-text-active);
    background: var(--lf-surface-active);
  }

  .glass {
    background: var(--lf-surface);
    -webkit-backdrop-filter: var(--lf-blur);
    backdrop-filter: var(--lf-blur);
    box-shadow: var(--lf-shadow);
  }

  .danger {
    color: #fff;
    background: var(--lf-danger);
  }

  .muted {
    color: var(--lf-muted);
  }
`;

/** A small uppercase label over a group of controls. */
export const sectionLabel = css`
  h3,
  h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--lf-muted);
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
    overscroll-behavior-y: contain;
    color: var(--lf-text);
    font-family: var(--lf-font);
  }

  /* Room for the edit bar above the title. */
  :host([editing]) {
    padding-top: max(var(--lf-pad), 84px);
  }

  .head {
    position: relative;
    min-height: 38px;
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
