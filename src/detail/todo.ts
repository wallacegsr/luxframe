import { LitElement, css, html, nothing } from 'lit';
import { dayLabel, fetchTodo, type TodoItem } from '../data';
import { define } from '../define';
import { icon } from '../icons';
import { controls, glass } from '../theme';
import { formatClock } from '../time';
import type { HassEntity, HomeAssistant } from '../types';

// Home Assistant's to-do features, by bit.
const CREATE = 1;
const DELETE = 2;
const UPDATE = 4;

/**
 * A to-do list in full: add an item, tick items off (or back on), see when
 * each is due, and clear the done ones away.
 */
export class LuxFrameTodoDetail extends LitElement {
  static properties = {
    hass: { attribute: false },
    stateObj: { attribute: false },
    _items: { state: true },
    _text: { state: true },
    _showDone: { state: true },
  };

  declare hass?: HomeAssistant;
  declare stateObj?: HassEntity;
  declare _items?: TodoItem[];
  declare _text: string;
  declare _showDone: boolean;

  private _seen = '';

  constructor() {
    super();
    this._text = '';
    this._showDone = false;
  }

  protected willUpdate(): void {
    // The state is the open count; it changes whenever the list does.
    const s = this.stateObj;
    const key = s ? `${s.entity_id}|${s.state}|${s.last_updated ?? s.last_changed ?? ''}` : '';
    if (key && key !== this._seen) {
      this._seen = key;
      this._load();
    }
  }

  private _load(): void {
    fetchTodo(this.hass, this.stateObj!.entity_id)
      .then((items) => (this._items = items))
      .catch(() => (this._items = []));
  }

  private async _call(service: string, data: Record<string, unknown>): Promise<void> {
    await this.hass?.callService('todo', service, { entity_id: this.stateObj!.entity_id, ...data });
    this._load();
  }

  private _add(e?: Event): void {
    e?.preventDefault();
    const item = this._text.trim();
    if (!item) return;
    this._text = '';
    this._items = [...(this._items ?? []), { uid: `new-${Date.now()}`, summary: item, status: 'needs_action' }];
    void this._call('add_item', { item });
  }

  private _toggle(item: TodoItem): void {
    const status = item.status === 'completed' ? 'needs_action' : 'completed';
    this._items = this._items?.map((i) => (i.uid === item.uid ? { ...i, status } : i));
    void this._call('update_item', { item: item.uid, status });
  }

  private _due(item: TodoItem) {
    if (!item.due) return nothing;
    const timed = item.due.includes('T');
    const at = new Date(timed ? item.due : `${item.due}T00:00:00`);
    if (Number.isNaN(at.getTime())) return nothing;
    const late = (timed ? at.getTime() : at.getTime() + 86_400_000) < Date.now() && item.status !== 'completed';
    return html`<span class="due ${late ? 'late' : ''}">${dayLabel(this.hass, at)}${timed ? ` · ${formatClock(this.hass, at)}` : ''}</span>`;
  }

  private _row(item: TodoItem, canUpdate: boolean) {
    const done = item.status === 'completed';
    return html`<li class=${done ? 'done' : ''}>
      <button class="check" ?disabled=${!canUpdate} aria-label="${done ? 'Mark not done' : 'Mark done'}: ${item.summary}"
        @click=${() => this._toggle(item)}>${icon(done ? 'check' : 'circle', 26)}</button>
      <span class="text">
        <span class="summary">${item.summary}</span>
        ${item.description ? html`<span class="muted note">${item.description}</span>` : nothing}
      </span>
      ${this._due(item)}
    </li>`;
  }

  protected render() {
    const s = this.stateObj;
    if (!s) return nothing;
    const features: number = s.attributes.supported_features ?? 0;
    const items = this._items ?? [];
    const open = items.filter((i) => i.status === 'needs_action');
    const done = items.filter((i) => i.status === 'completed');
    const canUpdate = !!(features & UPDATE);

    return html`
      ${features & CREATE
        ? html`<form class="add glass" @submit=${this._add}>
            <input type="text" placeholder="Add an item" aria-label="Add an item" enterkeyhint="done"
              .value=${this._text} @input=${(e: Event) => (this._text = (e.target as HTMLInputElement).value)} />
            <button class="round small on" aria-label="Add" ?disabled=${!this._text.trim()}>${icon('plus', 22)}</button>
          </form>`
        : nothing}
      <div class="lists">
        ${this._items && !open.length
          ? html`<div class="muted empty">${icon('check', 28)} All done</div>`
          : open.length
            ? html`<ul class="glass">${open.map((i) => this._row(i, canUpdate))}</ul>`
            : nothing}
        ${done.length
          ? html`<div class="row">
                <button class="chip" aria-expanded=${this._showDone} @click=${() => (this._showDone = !this._showDone)}>
                  ${this._showDone ? 'Hide' : 'Show'} ${done.length} done
                </button>
                ${features & DELETE
                  ? html`<button class="chip" @click=${() => this._call('remove_completed_items', {})}>Clear done</button>`
                  : nothing}
              </div>
              ${this._showDone ? html`<ul class="glass">${done.map((i) => this._row(i, canUpdate))}</ul>` : nothing}`
          : nothing}
      </div>
    `;
  }

  static styles = [
    controls,
    glass,
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        width: 100%;
        height: 100%;
        min-height: 0;
        color: var(--lf-text);
        font-family: var(--lf-font);
      }

      .add {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 8px;
        width: min(640px, 100%);
        padding: 6px 6px 6px 20px;
        border-radius: 999px;
      }

      input {
        flex: 1;
        min-width: 0;
        min-height: 44px;
        border: 0;
        background: none;
        color: inherit;
        font: inherit;
        font-size: 18px;
      }

      input:focus-visible {
        outline: none;
      }

      .lists {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: min(640px, 100%);
        min-height: 0;
        overflow-y: auto;
        padding-bottom: 24px;
      }

      ul {
        margin: 0;
        padding: 4px 18px;
        list-style: none;
        border-radius: var(--lf-radius);
      }

      li {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 56px;
      }

      li + li {
        border-top: 1px solid var(--lf-control-row);
      }

      .check {
        flex: none;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        margin-left: -8px;
        padding: 0;
        border-radius: 50%;
        background: none;
        color: var(--lf-muted);
      }

      .done .check {
        color: var(--lf-color-switch);
      }

      .text {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .summary {
        font-size: 18px;
      }

      .done .summary {
        color: var(--lf-muted);
        text-decoration: line-through;
      }

      .note {
        font-size: 15px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .due {
        flex: none;
        font-size: 15px;
        color: var(--lf-muted);
      }

      .due.late {
        color: var(--lf-danger);
      }

      .row {
        display: flex;
        gap: 10px;
      }

      .empty {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 32px;
        font-size: 18px;
      }
    `,
  ];
}

define('luxframe-todo-detail', LuxFrameTodoDetail);
