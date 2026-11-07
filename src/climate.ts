import type { ReactiveControllerHost } from 'lit';
import type { IconName } from './icons';
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

/** The icon for each mode, drawn by LuxFrame (see icons.ts). */
export const HVAC_ICONS: Record<string, IconName> = {
  off: 'power',
  heat: 'flame',
  cool: 'snow',
  heat_cool: 'range',
  auto: 'auto',
  dry: 'drop',
  fan_only: 'fan',
};

const MODE_COLORS: Record<string, string> = {
  heat: '#ff9f0a',
  cool: '#64d2ff',
  heat_cool: '#bf5af2',
  auto: '#30d158',
  dry: '#ffd60a',
  fan_only: '#5ac8fa',
};

/**
 * The color a thermostat shows: what it's doing when it says (heating is
 * orange even in auto), else its mode. Undefined when it's off.
 */
export function climateColor(stateObj: HassEntity): string | undefined {
  const action = stateObj.attributes.hvac_action;
  if (action === 'heating' || action === 'preheating') return MODE_COLORS.heat;
  if (action === 'cooling') return MODE_COLORS.cool;
  return MODE_COLORS[stateObj.state];
}

/** A fan mode or preset as words: "away_indefinitely" → "Away indefinitely". */
export function modeLabel(mode: string): string {
  const words = mode.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

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
