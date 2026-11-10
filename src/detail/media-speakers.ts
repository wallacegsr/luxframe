import { LitElement, css, html, nothing } from 'lit';
import { define } from '../define';
import { openDetail } from '../entity';
import { icon } from '../icons';
import { MEDIA, groupOf, isMusicAssistant, massTransfer, playerName, speakers, supports } from '../media';
import { Pending, near } from '../pending';
import { controls } from '../theme';
import type { HassEntity, HomeAssistant } from '../types';

/** How long a tick shows before the group says it changed. */
const JOIN_HOLD_MS = 6000;

function names(hass: HomeAssistant | undefined, ids: string[]): string {
  const list = ids.map((id) => (hass?.states[id] ? playerName(hass.states[id]) : id));
  try {
    return new Intl.ListFormat(hass?.locale?.language, { type: 'conjunction' }).format(list);
  } catch {
    return list.join(', ');
  }
}

/** What a speaker is up to, in a few words. */
function statusOf(hass: HomeAssistant | undefined, s: HassEntity, me: boolean, joined: boolean): string {
  if (s.state === 'unavailable') return 'Unavailable';
  if (s.state === 'off') return 'Off';
  const others = groupOf(s).filter((id) => id !== s.entity_id);
  if (joined) return 'Playing along';
  const a = s.attributes;
  const what = [a.media_title, a.media_artist].filter(Boolean).join(' – ');
  const doing =
    s.state === 'playing' || s.state === 'paused'
      ? [s.state === 'playing' ? 'Playing' : 'Paused', what].filter(Boolean).join(' · ')
      : s.state === 'idle'
        ? 'Idle'
        : s.state.charAt(0).toUpperCase() + s.state.slice(1);
  if (!others.length) return doing;
  return me ? `With ${names(hass, others)}` : `With ${names(hass, others)} · ${doing}`;
}

/**
 * Every speaker, for the media details. A tick plays one along with the
 * speaker shown, as a group; speakers in the group get their own volume.
 * With Music Assistant, Move here takes what's playing, queue and all, to
 * another speaker. Tapping a speaker shows it instead.
 */
export class LuxFrameMediaSpeakers extends LitElement {
  static properties = {
    hass: { attribute: false },
    player: {},
  };

  declare hass?: HomeAssistant;
  /** The speaker the details are showing. */
  declare player?: string;

  private _volumes = new Map<string, Pending<number>>();
  private _joins = new Map<string, Pending<boolean>>();

  private _pending<T>(map: Map<string, Pending<T>>, id: string): Pending<T> {
    let pending = map.get(id);
    if (!pending) {
      pending = new Pending<T>(this);
      map.set(id, pending);
    }
    return pending;
  }

  private _toggle(id: string, joined: boolean): void {
    const current = this.player ? this.hass?.states[this.player] : undefined;
    if (!this.hass || !current) return;
    this._pending(this._joins, id).release(!joined, JOIN_HOLD_MS);
    if (joined) this.hass.callService('media_player', 'unjoin', { entity_id: id });
    // A group takes new speakers through its leader, which Home Assistant lists first.
    else this.hass.callService('media_player', 'join', { entity_id: groupOf(current)[0], group_members: [id] });
  }

  private _move(id: string): void {
    const current = this.player ? this.hass?.states[this.player] : undefined;
    if (!this.hass || !current) return;
    // A speaker playing along plays its leader's queue.
    void massTransfer(this.hass, id, groupOf(current)[0]);
    openDetail(this, id);
  }

  private _renderRow(s: HassEntity, current: HassEntity, group: string[]) {
    const hass = this.hass;
    const id = s.entity_id;
    const name = playerName(s);
    const me = id === current.entity_id;
    const unavailable = s.state === 'unavailable';
    const canGroup = supports(current, MEDIA.GROUPING);
    const reportedJoin = group.includes(id);
    const joined = !me && (this._pending(this._joins, id).get(reportedJoin) ?? reportedJoin);
    const active = current.state === 'playing' || current.state === 'paused';
    const canMove =
      !me && !joined && !unavailable && active && isMusicAssistant(hass, current) && isMusicAssistant(hass, s);
    const reported = typeof s.attributes.volume_level === 'number' ? Math.round(s.attributes.volume_level * 100) : undefined;
    const volumes = this._pending(this._volumes, id);
    const volume = volumes.get(reported, near(1)) ?? reported ?? 0;
    const showVolume = (me || joined) && !unavailable && s.state !== 'off' && supports(s, MEDIA.VOLUME_SET);

    return html`<li class="speaker ${me ? 'me' : ''} ${joined ? 'joined' : ''} ${canGroup ? 'ticks' : ''}">
      <div class="row">
        ${canGroup
          ? me
            ? html`<span class="check me" aria-hidden="true">${icon('speaker', 20)}</span>`
            : html`<button
                class="check ${joined ? 'on' : ''}"
                role="checkbox"
                aria-checked=${joined}
                aria-label="Play on ${name} too"
                ?disabled=${unavailable || !supports(s, MEDIA.GROUPING)}
                @click=${() => this._toggle(id, joined)}
              >
                ${joined ? icon('check', 20) : nothing}
              </button>`
          : nothing}
        <button class="who" ?disabled=${me} aria-label=${me ? name : `Show ${name}`} @click=${() => openDetail(this, id)}>
          <span class="name">${name}</span>
          <span class="status">${statusOf(hass, s, me, joined)}</span>
        </button>
        ${canMove ? html`<button class="chip move" @click=${() => this._move(id)}>Move here</button>` : nothing}
      </div>
      ${showVolume
        ? html`<div class="volume">
            ${icon('speaker', 20)}
            <luxframe-slider
              filled
              label="${name} volume"
              .value=${volume}
              .valueText=${`${volume}%`}
              @input=${(e: CustomEvent<number>) => volumes.hold(e.detail)}
              @change=${(e: CustomEvent<number>) => {
                volumes.release(e.detail);
                this.hass?.callService('media_player', 'volume_set', { entity_id: id, volume_level: e.detail / 100 });
              }}
            ></luxframe-slider>
          </div>`
        : nothing}
    </li>`;
  }

  protected render() {
    const current = this.player ? this.hass?.states[this.player] : undefined;
    if (!current) return nothing;
    const list = speakers(this.hass);
    // The speaker shown, even when it isn't one the list would offer.
    if (!list.some((s) => s.entity_id === current.entity_id)) list.unshift(current);
    const group = groupOf(current);
    return html`
      <ul class="list">
        ${list.map((s) => this._renderRow(s, current, group))}
      </ul>
      ${supports(current, MEDIA.GROUPING) && list.length > 1
        ? html`<p class="hint">Tick a speaker to play on it too.</p>`
        : nothing}
    `;
  }

  static styles = [
    controls,
    css`
    :host {
      display: block;
      color: var(--lf-text);
      font-family: var(--lf-font);
    }

    :host([hidden]) {
      display: none;
    }

    .list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .speaker {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px 14px;
      border-radius: var(--lf-radius);
      background: var(--lf-control-row);
    }

    .speaker.me,
    .speaker.joined {
      background: var(--lf-control);
    }

    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 52px;
    }

    /* A round tick: empty, or full with a check while it plays along. */
    .check {
      flex: none;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      padding: 0;
      border-radius: 50%;
      background: none;
      box-shadow: inset 0 0 0 2px var(--lf-faint);
      transition: transform var(--lf-fast);
    }

    .check:active:not(:disabled) {
      transform: scale(0.96);
    }

    .check.on {
      color: var(--lf-text-active);
      background: var(--lf-surface-active);
      box-shadow: none;
    }

    .check.me {
      color: var(--lf-text-active);
      background: var(--lf-surface-active);
      box-shadow: none;
    }

    .check:disabled {
      opacity: 0.35;
      cursor: default;
    }

    .who {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      min-width: 0;
      padding: 4px 0;
      text-align: left;
      background: none;
    }

    .who:disabled {
      cursor: default;
    }

    .name {
      max-width: 100%;
      font-size: 17px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status {
      max-width: 100%;
      font-size: 15px;
      color: var(--lf-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .move {
      flex: none;
      font-weight: 600;
    }

    .volume {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--lf-muted);
    }

    /* Under the name, past the tick. */
    .ticks .volume {
      padding-left: 56px;
    }

    .volume luxframe-slider {
      flex: 1;
      height: 44px;
      --slider-fill: var(--lf-surface-active);
    }

    .hint {
      margin: 12px 4px 0;
      font-size: 15px;
      color: var(--lf-muted);
    }
  `,
  ];
}

define('luxframe-media-speakers', LuxFrameMediaSpeakers);
