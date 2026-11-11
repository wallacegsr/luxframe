import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { changedAgo, domainOf, openDetail } from '../entity';
import { formatClock } from '../time';
import type { HassEntity, HomeAssistant } from '../types';
import { detailStyles } from './styles';
import { batteryOf } from './vacuum';

/** Where someone is: Home, Away, or the zone they're in. */
export function whereLabel(hass: HomeAssistant | undefined, s: HassEntity): string {
  if (s.state === 'home') return 'Home';
  if (s.state === 'not_home') return 'Away';
  if (s.state === 'unknown' || s.state === 'unavailable') return 'Unknown';
  return hass?.formatEntityState?.(s) ?? s.state;
}

/** A person's picture in a circle, or their initial. */
export function avatar(s: HassEntity, size: number) {
  const name: string = s.attributes.friendly_name ?? s.entity_id;
  const picture: string | undefined = s.attributes.entity_picture;
  return html`<span class="avatar ${s.state === 'home' ? 'home' : ''}" style="--size: ${size}px">
    ${picture ? html`<img src=${picture} alt="" />` : html`<span>${name.charAt(0).toUpperCase()}</span>`}
  </span>`;
}

export const avatarStyles = css`
  .avatar {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: var(--lf-control);
    font-size: calc(var(--size) * 0.42);
    font-weight: 600;
    box-shadow: 0 0 0 3px transparent;
    transition: box-shadow var(--lf-move);
  }

  .avatar.home {
    box-shadow: 0 0 0 3px var(--lf-color-switch);
  }

  .avatar img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
`;

/**
 * A person: their picture, where they are and since when, what tracks them
 * and its battery, and everyone else to switch to.
 */
export class LuxFramePersonDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const a = s.attributes;
    const source = typeof a.source === 'string' ? this.hass?.states[a.source] : undefined;
    const battery = source ? batteryOf(this.hass, source) : batteryOf(this.hass, s);
    const since = s.last_changed ? new Date(s.last_changed) : undefined;
    const lang = this.hass?.locale?.language;
    const rows = [
      { label: 'Where', value: whereLabel(this.hass, s) },
      since
        ? {
            label: 'Since',
            value: `${since.toDateString() === new Date().toDateString() ? 'Today' : since.toLocaleDateString(lang, { weekday: 'long' })} ${formatClock(this.hass, since)}`,
          }
        : undefined,
      source ? { label: 'Tracked by', value: source.attributes.friendly_name ?? source.entity_id } : undefined,
      battery !== undefined ? { label: 'Phone battery', value: `${Math.round(battery)}%` } : undefined,
      typeof a.gps_accuracy === 'number' ? { label: 'Accuracy', value: `${Math.round(a.gps_accuracy)} m` } : undefined,
    ].filter((r): r is { label: string; value: string } => !!r);
    const others = Object.values(this.hass?.states ?? {}).filter(
      (o) => domainOf(o.entity_id) === 'person' && o.entity_id !== s.entity_id,
    );
    const ago = changedAgo(this.hass, s.last_changed);

    return html`
      <div class="status" aria-live="polite">
        ${whereLabel(this.hass, s)} ${ago ? html`<span class="muted">· ${ago}</span>` : nothing}
      </div>
      <div class="layout">
        ${avatar(s, 180)}
        <div class="side">
          <dl class="glass">
            ${rows.map((r) => html`<div><dt class="muted">${r.label}</dt><dd>${r.value}</dd></div>`)}
          </dl>
          ${others.length
            ? html`<div class="others" role="group" aria-label="Everyone else">
                ${others.map(
                  (o) => html`<button class="who" @click=${() => openDetail(this, o.entity_id)}>
                    ${avatar(o, 52)}
                    <span>${(o.attributes.friendly_name ?? o.entity_id).split(' ')[0]}</span>
                    <span class="muted">${whereLabel(this.hass, o)}</span>
                  </button>`,
                )}
              </div>`
            : nothing}
        </div>
      </div>
    `;
  }

  static styles = [
    detailStyles,
    avatarStyles,
    css`
      dl {
        box-sizing: border-box;
        width: min(380px, 86vw);
        margin: 0;
        padding: 6px 20px;
        border-radius: var(--lf-radius);
      }

      dl div {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        min-height: 50px;
        align-items: center;
        font-size: 17px;
      }

      dl div + div {
        border-top: 1px solid var(--lf-control-row);
      }

      dd {
        margin: 0;
        font-weight: 600;
        text-align: right;
      }

      .others {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 18px;
      }

      .who {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 6px;
        border-radius: var(--lf-radius-s);
        background: none;
        font-size: 15px;
      }

      .who .muted {
        font-size: 13px;
      }
    `,
  ];
}

define('luxframe-person-detail', LuxFramePersonDetail);
