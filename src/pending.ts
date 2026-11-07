import type { ReactiveControllerHost } from 'lit';

const DEFAULT_MS = 5000;

/**
 * A value the user chose that Home Assistant hasn't confirmed yet.
 *
 * While a finger is down the chosen value always wins. After release it stays
 * on screen until the device reports it, or for a few seconds at most. A bulb
 * that fades reports every step of the fade, and following those would make
 * the control slide back through old values after you let go.
 */
export class Pending<T> {
  private _value?: T;
  private _until = 0;
  private _timer?: number;

  constructor(private readonly _host: ReactiveControllerHost) {}

  /** The finger is down: show `value` with no time limit. */
  hold(value: T): void {
    window.clearTimeout(this._timer);
    this._value = value;
    this._until = Infinity;
    this._host.requestUpdate();
  }

  /** The value was sent: show it until reported, or for `ms` at most. */
  release(value: T, ms = DEFAULT_MS): void {
    this._value = value;
    this._until = Date.now() + ms;
    window.clearTimeout(this._timer);
    this._timer = window.setTimeout(() => this._host.requestUpdate(), ms + 10);
    this._host.requestUpdate();
  }

  get holding(): boolean {
    return this._value !== undefined && this._until === Infinity;
  }

  /** The value to show instead of `reported`, or undefined to show `reported`. */
  get(reported: T | undefined, same: (a: T, b: T) => boolean = (a, b) => a === b): T | undefined {
    if (this._value === undefined) return undefined;
    if (this.holding) return this._value;
    if (Date.now() > this._until || (reported !== undefined && same(reported, this._value))) {
      this._value = undefined;
      return undefined;
    }
    return this._value;
  }

  clear(): void {
    window.clearTimeout(this._timer);
    this._value = undefined;
  }
}

/** Numbers within `tolerance` count as reported: brightness rounds through 0–255. */
export const near =
  (tolerance = 1) =>
  (a: number, b: number): boolean =>
    Math.abs(a - b) <= tolerance;
