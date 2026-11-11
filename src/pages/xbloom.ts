import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { define } from '../define';
import type { HomeAssistant, XBloomPageConfig } from '../types';

/**
 * The xBloom integration's own panel (Brew, Recipes, Manual, Settings) as a
 * page in the frame.
 *
 * The integration ships the panel as one build-free web component,
 * `<xbloom-panel>`, and Home Assistant hands it `hass` like any panel. This
 * page loads that same module and gives it the frame's `hass`, so it looks
 * and works exactly as the sidebar panel does, and keeps up with the
 * integration's updates. A few rules are added to the panel's shadow root so
 * it fits a page: no sidebar button, the frame's page scrolls it, and its
 * phone tab bar stays on this page instead of floating over every page.
 */

const TAG = 'xbloom-panel';
/** The integration's panel bundle, when Home Assistant doesn't say where it is. */
const FALLBACK_URL = '/xbloom_static/xbloom-panel.js';
const TABS = ['home', 'recipes', 'manual', 'settings'];

/** What this page reaches into on the panel element. */
interface XBloomPanelElement extends HTMLElement {
  hass?: HomeAssistant;
  narrow?: boolean;
  /** The panel's open tab; set before it renders, to open on another one. */
  _tab?: string;
}

interface PanelInfo {
  config?: { _panel_custom?: { module_url?: string } } | null;
}

/**
 * The panel module's URL as Home Assistant registered it, version query and
 * all. Loading that exact URL shares one module with the sidebar, so the
 * element is never defined twice. Undefined when the integration hasn't
 * registered a panel (an older release, or it hasn't started yet).
 */
function moduleUrl(hass: HomeAssistant): string | undefined {
  const panels = (hass as HomeAssistant & { panels?: Record<string, PanelInfo> }).panels;
  if (!panels) return FALLBACK_URL;
  const panel = panels.xbloom;
  if (!panel) return undefined;
  return panel.config?._panel_custom?.module_url ?? FALLBACK_URL;
}

let loading: Promise<void> | undefined;

function loadPanel(url: string): Promise<void> {
  if (customElements.get(TAG)) return Promise.resolve();
  // Built at run time so the bundler leaves the import to the browser.
  loading ??= import(/* @vite-ignore */ new URL(url, location.origin).href)
    .then(() => customElements.whenDefined(TAG))
    .then(() => undefined)
    .catch((err: unknown) => {
      loading = undefined;
      throw err;
    });
  return loading;
}

/** Rules added inside the panel's shadow root so it sits in a page. */
const FIT = css`
  :host {
    min-height: 100% !important;
  }

  /* The sidebar's menu button: there's no sidebar in the frame. */
  ha-menu-button {
    display: none !important;
  }

  .toolbar {
    padding-left: 16px !important;
  }

  /* Room under the last card for the frame's page dots. */
  .content {
    padding-bottom: 64px !important;
  }

  /*
   * On a phone-sized screen the panel docks its tabs to the bottom with
   * position: fixed, which would float them over every page of the frame.
   * Here they stick to the bottom of this page instead, with room under them
   * for the page dots.
   */
  @media (max-width: 720px) {
    :host {
      display: flex !important;
      flex-direction: column;
      --xb-nav-h: calc(96px + env(safe-area-inset-bottom, 0px)) !important;
    }

    .content {
      order: 1;
      flex: 1 0 auto;
      width: 100%;
      padding-bottom: 24px !important;
    }

    .nav {
      order: 2;
      position: sticky !important;
      left: auto !important;
      right: auto !important;
      bottom: 0;
      padding-bottom: calc(38px + env(safe-area-inset-bottom, 0px)) !important;
    }
  }
`;

type Status = 'waiting' | 'loading' | 'ready' | 'missing' | 'failed';

export class LuxFrameXBloomPage extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    _status: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: XBloomPageConfig;
  declare _status: Status;

  private _panel?: XBloomPanelElement;

  constructor() {
    super();
    this._status = 'waiting';
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (!this.hass || !changed.has('hass')) return;
    // Waiting, or the integration may have registered its panel since.
    if (this._status === 'waiting' || this._status === 'missing') this._start(this.hass);
  }

  protected updated(): void {
    const panel = this._panel;
    if (!panel || !this.hass) return;
    if (panel.hass !== this.hass) panel.hass = this.hass;
    // The panel follows Home Assistant's dark mode each time it gets hass;
    // a page that sets its own theme puts it back.
    const theme = this.config?.theme;
    if (theme === 'light' || theme === 'dark') panel.toggleAttribute('dark', theme === 'dark');
    if (this.config?.backdrop) panel.style.setProperty('--xb-bg', 'transparent');
    else panel.style.removeProperty('--xb-bg');
  }

  private async _start(hass: HomeAssistant): Promise<void> {
    const url = moduleUrl(hass);
    if (!url) {
      this._status = 'missing';
      return;
    }
    this._status = 'loading';
    try {
      await loadPanel(url);
    } catch (err) {
      console.warn('LuxFrame: the xBloom panel did not load', err);
      this._status = 'failed';
      return;
    }
    this._panel = this._makePanel();
    this._status = 'ready';
  }

  private _makePanel(): XBloomPanelElement {
    const panel = document.createElement(TAG) as XBloomPanelElement;
    const tab = this.config?.tab;
    if (tab && TABS.includes(tab)) panel._tab = tab;
    panel.narrow = true;
    const root = panel.shadowRoot;
    if (root && FIT.styleSheet) root.adoptedStyleSheets = [...root.adoptedStyleSheets, FIT.styleSheet];
    return panel;
  }

  protected render() {
    switch (this._status) {
      case 'ready':
        return html`${this._panel}`;
      case 'missing':
        return this._note(
          'Home Assistant has no xBloom panel yet. Update the xBloom integration to a release with the sidebar panel, then restart Home Assistant.',
        );
      case 'failed':
        return this._note(
          "The xBloom panel didn't load. Check that the xBloom integration is running, then reload this page.",
        );
      case 'loading':
        return this._note('Loading xBloom…');
      default:
        return nothing;
    }
  }

  private _note(text: string) {
    return html`<div class="note"><h1>xBloom</h1><p>${text}</p></div>`;
  }

  static styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      height: 100%;
      overflow-y: auto;
      overscroll-behavior-y: contain;
    }

    xbloom-panel {
      display: block;
    }

    .note {
      padding: var(--lf-pad);
      color: var(--lf-text);
      font-family: var(--lf-font);
    }

    h1 {
      margin: 0 0 12px;
      font-size: clamp(28px, 4vw, 40px);
      font-weight: 600;
      letter-spacing: -0.02em;
    }

    p {
      margin: 0;
      max-width: 36em;
      color: var(--lf-muted);
      line-height: 1.5;
    }
  `;
}

define('luxframe-xbloom-page', LuxFrameXBloomPage);
