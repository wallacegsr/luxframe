import type { ReactiveControllerHost } from 'lit';
import { Pending } from './pending';
import type { HassEntity, HomeAssistant } from './types';

// ▼/▲ taps are gathered and sent once they stop, so going from 68 to 72 is
// one call to Home Assistant rather than four.
const SEND_AFTER_MS = 700;

export const HVAC_LABELS: Record<string, string> = {
  off: 'Off',
  heat: 'Heat',
  cool: 'Cool',
  heat_cool: 'Heat/Cool',
  auto: 'Auto',
  dry: 'Dry',
  fan_only: 'Fan',
};

export const ACTION_LABELS: Record<string, string> = {
  heating: 'Heating',
  cooling: 'Cooling',
  drying: 'Drying',
  fan: 'Fan running',
  idle: 'Idle',
  off: 'Off',
  preheating: 'Preheating',
  defrosting: 'Defrosting',
};

export function formatTemp(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** One ▼/▲ press from `base`: the entity's step, kept inside its min and max. */
export function stepTarget(
  hass: HomeAssistant | undefined,
  stateObj: HassEntity,
  base: number,
  direction: 1 | -1,
): number {
  const a = stateObj.attributes;
  const unit = hass?.config?.unit_system?.temperature ?? '';
  const step: number = a.target_temp_step ?? (unit.includes('F') ? 1 : 0.5);
  let next = Math.round((base + direction * step) / step) * step;
  if (typeof a.min_temp === 'number') next = Math.max(a.min_temp, next);
  if (typeof a.max_temp === 'number') next = Math.min(a.max_temp, next);
  return Math.round(next * 10) / 10;
}

/** One target temperature driven by ▼/▲, shown at once and sent when the taps stop. */
export class TempSetter {
  private _pending: Pending<number>;
  private _timer?: number;

  constructor(
    host: ReactiveControllerHost,
    private readonly _send: (value: number) => void,
  ) {
    this._pending = new Pending(host);
  }

  /** What to show: the value being chosen, else what Home Assistant reports. */
  value(reported: number | undefined): number | undefined {
    return this._pending.get(reported) ?? reported;
  }

  step(
    hass: HomeAssistant | undefined,
    stateObj: HassEntity,
    reported: number | undefined,
    direction: 1 | -1,
  ): void {
    const base = this.value(reported);
    if (typeof base !== 'number') return;
    const next = stepTarget(hass, stateObj, base, direction);
    this._pending.hold(next);
    window.clearTimeout(this._timer);
    this._timer = window.setTimeout(() => {
      this._pending.release(next);
      this._send(next);
    }, SEND_AFTER_MS);
  }
}
