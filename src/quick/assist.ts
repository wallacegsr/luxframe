import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { define } from '../define';
import { editorStyles } from '../editor/sheet';
import type { HomeAssistant } from '../types';

interface Turn {
  who: 'you' | 'home';
  text: string;
  error?: boolean;
}

interface ConversationResult {
  conversation_id?: string;
  response?: {
    response_type?: string;
    speech?: { plain?: { speech?: string } };
  };
}

/**
 * Typing a request to Home Assistant's Assist (`conversation/process`) and
 * reading the answer. The conversation carries on until the sheet closes, so
 * "turn it off" after "turn on the kitchen" works. Voice belongs to Kiosk
 * Satellite or Voice Satellite.
 */
export class LuxFrameAssist extends LitElement {
  static properties = {
    hass: { attribute: false },
    agentId: { attribute: false },
    _turns: { state: true },
    _busy: { state: true },
  };

  declare hass?: HomeAssistant;
  declare agentId?: string;
  declare _turns: Turn[];
  declare _busy: boolean;

  private _conversationId?: string;

  constructor() {
    super();
    this._turns = [];
    this._busy = false;
  }

  protected firstUpdated(): void {
    this._input?.focus();
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has('_turns')) {
      this.renderRoot.querySelector('.turn:last-child')?.scrollIntoView({ block: 'nearest' });
    }
  }

  private get _input(): HTMLInputElement | null {
    return this.renderRoot.querySelector('input');
  }

  private async _send(e?: Event): Promise<void> {
    e?.preventDefault();
    const input = this._input;
    const text = input?.value.trim();
    if (!text || this._busy) return;
    input!.value = '';
    this._turns = [...this._turns, { who: 'you', text }];

    if (!this.hass?.callWS) {
      this._turns = [...this._turns, { who: 'home', text: "Assist isn't reachable from here.", error: true }];
      return;
    }
    this._busy = true;
    try {
      const result = await this.hass.callWS<ConversationResult>({
        type: 'conversation/process',
        text,
        conversation_id: this._conversationId,
        language: this.hass.language,
        ...(this.agentId ? { agent_id: this.agentId } : {}),
      });
      this._conversationId = result.conversation_id ?? this._conversationId;
      const speech = result.response?.speech?.plain?.speech?.trim();
      this._turns = [
        ...this._turns,
        {
          who: 'home',
          text: speech || 'Done.',
          error: result.response?.response_type === 'error',
        },
      ];
    } catch (err) {
      const message = (err as Error)?.message;
      this._turns = [
        ...this._turns,
        { who: 'home', text: message ? `Assist couldn't answer: ${message}` : "Assist couldn't answer.", error: true },
      ];
    } finally {
      this._busy = false;
      this._input?.focus();
    }
  }

  protected render() {
    return html`
      <div class="log" aria-live="polite">
        ${this._turns.length
          ? this._turns.map(
              (turn) => html`<div class="turn ${turn.who} ${turn.error ? 'error' : ''}">${turn.text}</div>`,
            )
          : html`<p class="muted hint">Try “Turn off the kitchen lights” or “What's the temperature inside?”</p>`}
        ${this._busy ? html`<div class="turn home busy" aria-label="Thinking"><span></span><span></span><span></span></div>` : nothing}
      </div>
      <form @submit=${this._send}>
        <input type="text" enterkeyhint="send" autocomplete="off" aria-label="Ask Home Assistant"
          placeholder="Ask Home Assistant…" />
        <button class="chip on" type="submit" ?disabled=${this._busy}>Send</button>
      </form>
    `;
  }

  static styles = [
    editorStyles,
    css`
      .log {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 120px;
        max-height: 46vh;
        overflow-y: auto;
        padding: 4px 0 12px;
      }

      .hint {
        margin: auto 0;
        font-size: 17px;
        text-align: center;
      }

      .turn {
        max-width: 82%;
        padding: 10px 16px;
        border-radius: 20px;
        font-size: 17px;
        line-height: 1.35;
        user-select: text;
      }

      .turn.you {
        align-self: flex-end;
        color: var(--lf-text-active);
        background: var(--lf-surface-active);
        border-bottom-right-radius: 6px;
      }

      .turn.home {
        align-self: flex-start;
        background: var(--lf-control);
        border-bottom-left-radius: 6px;
      }

      .turn.error {
        background: color-mix(in srgb, var(--lf-danger) 55%, transparent);
      }

      .busy {
        display: flex;
        gap: 5px;
      }

      .busy span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
        animation: blink 1s infinite;
      }

      .busy span:nth-child(2) {
        animation-delay: 0.15s;
      }

      .busy span:nth-child(3) {
        animation-delay: 0.3s;
      }

      form {
        display: flex;
        gap: 10px;
      }

      input {
        flex: 1;
      }

      @keyframes blink {
        50% {
          opacity: 0.3;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .busy span {
          animation: none;
        }
      }
    `,
  ];
}

define('luxframe-assist', LuxFrameAssist);
