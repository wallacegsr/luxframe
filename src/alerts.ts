import { domainOf, resolve, stateLabel } from './entity';
import type { AlertConfig, HassEntity, HomeAssistant } from './types';

/** An alert as written: a bare entity id, or one with its own states or message. */
export function alertOf(raw: string | AlertConfig): AlertConfig {
  return typeof raw === 'string' ? { entity: raw } : raw;
}

/** The states that raise an alert when it doesn't name its own. */
function defaultStates(entity: string): string[] {
  switch (domainOf(entity)) {
    case 'alarm_control_panel':
      return ['triggered'];
    case 'lock':
      return ['unlocked', 'jammed'];
    case 'cover':
    case 'valve':
      return ['open'];
    default:
      return ['on'];
  }
}

export function alertStates(alert: AlertConfig): string[] {
  if (Array.isArray(alert.state)) return alert.state.map(String);
  return alert.state !== undefined ? [String(alert.state)] : defaultStates(alert.entity);
}

/** A state as Home Assistant words it for this entity: "on" is "Open" for a door. */
function wording(hass: HomeAssistant | undefined, s: HassEntity | undefined, state: string): string {
  const format = hass?.formatEntityState as ((s: HassEntity, state?: string) => string) | undefined;
  if (s && format) {
    try {
      return format(s, state);
    } catch {
      // Falls through to the plain state.
    }
  }
  return (state.charAt(0).toUpperCase() + state.slice(1)).replace(/_/g, ' ');
}

/** "While open", "While unlocked or jammed": when an alert shows, for its row in Customize. */
export function alertWhen(hass: HomeAssistant | undefined, alert: AlertConfig): string {
  const s = hass?.states[alert.entity];
  if (!s) return 'Not found in Home Assistant';
  return `While ${alertStates(alert)
    .map((state) => wording(hass, s, state).toLowerCase())
    .join(' or ')}`;
}

export interface ActiveAlert {
  entity: string;
  /** Changes when the alert clears and comes back, so a dismissed one shows again. */
  key: string;
  text: string;
}

/** The alerts that are up right now, in the order they're listed. */
export function activeAlerts(
  hass: HomeAssistant | undefined,
  alerts: Array<string | AlertConfig> | undefined,
): ActiveAlert[] {
  if (!hass || !alerts?.length) return [];
  const active: ActiveAlert[] = [];
  for (const raw of alerts) {
    const alert = alertOf(raw);
    const s = hass.states[alert.entity];
    if (!s || !alertStates(alert).includes(s.state)) continue;
    active.push({
      entity: alert.entity,
      key: `${alert.entity}@${s.last_changed}`,
      text: alert.message ?? `${resolve(hass, alert.entity).name} · ${stateLabel(hass, s)}`,
    });
  }
  return active;
}
