import type { EntityRef, HassEntity, HomeAssistant } from './types';

const INACTIVE = new Set(['off', 'closed', 'locked', 'idle', 'standby', 'unavailable', 'unknown']);
const TOGGLES = new Set(['light', 'switch', 'fan', 'input_boolean', 'automation', 'cover']);
// Covers that guard the house open their detail view instead of moving on one tap.
const GUARDED_COVERS = new Set(['garage', 'door', 'gate']);

export interface ResolvedEntity {
  id: string;
  name: string;
  icon?: string;
  area?: string;
  stateObj?: HassEntity;
}

export function domainOf(entityId: string): string {
  return entityId.split('.', 1)[0];
}

/** The entity's area name, from its own registry entry or else its device's. */
export function areaName(hass: HomeAssistant | undefined, entityId: string): string | undefined {
  const entry = hass?.entities?.[entityId];
  if (!entry) return undefined;
  const areaId =
    entry.area_id ?? (entry.device_id ? hass?.devices?.[entry.device_id]?.area_id : undefined);
  return areaId ? hass?.areas?.[areaId]?.name : undefined;
}

export function resolve(hass: HomeAssistant | undefined, ref: EntityRef): ResolvedEntity {
  const { entity, name, icon } = typeof ref === 'string' ? { entity: ref } : ref;
  const stateObj = hass?.states[entity];
  const area = areaName(hass, entity);
  let display: string = name ?? stateObj?.attributes.friendly_name ?? entity;
  // "Bedroom Bedside Lamp" in the Bedroom reads better as "Bedside Lamp".
  if (!name && area && display.toLowerCase().startsWith(`${area.toLowerCase()} `)) {
    const rest = display.slice(area.length + 1);
    display = rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return { id: entity, name: display, icon, area, stateObj };
}

export function isActive(stateObj: HassEntity | undefined): boolean {
  if (!stateObj) return false;
  const domain = domainOf(stateObj.entity_id);
  if (domain === 'scene' || domain === 'script' || domain === 'sensor') return false;
  return !INACTIVE.has(stateObj.state);
}

export function isMomentary(stateObj: HassEntity | undefined): boolean {
  const domain = stateObj ? domainOf(stateObj.entity_id) : '';
  return domain === 'scene' || domain === 'script';
}

export function stateLabel(hass: HomeAssistant | undefined, stateObj: HassEntity | undefined): string {
  if (!stateObj) return 'Not found';
  const { state, attributes } = stateObj;
  if (state === 'unavailable') return 'Unavailable';
  const domain = domainOf(stateObj.entity_id);
  // A scene's state is its last-run timestamp, which means nothing on a tile.
  if (domain === 'scene') return 'Scene';
  if (domain === 'script') return state === 'on' ? 'Running' : 'Script';
  if (domain === 'light' && state === 'on' && attributes.brightness) {
    return `${Math.round((attributes.brightness / 255) * 100)}%`;
  }
  if (hass?.formatEntityState) return hass.formatEntityState(stateObj);
  const unit = attributes.unit_of_measurement;
  if (unit) return `${state} ${unit}`;
  return state.charAt(0).toUpperCase() + state.slice(1);
}

/**
 * The 0–100 level a vertical drag adjusts, or null when the entity has none:
 * a dimmable light's brightness, a cover's position, a fan's speed.
 */
export function levelOf(stateObj: HassEntity | undefined): number | null {
  if (!stateObj || stateObj.state === 'unavailable') return null;
  const { attributes: a, state } = stateObj;
  switch (domainOf(stateObj.entity_id)) {
    case 'light': {
      const modes: string[] = a.supported_color_modes ?? [];
      const dimmable = modes.some((m) => m !== 'onoff') || a.brightness !== undefined;
      if (!dimmable) return null;
      return state === 'on' ? Math.round(((a.brightness ?? 255) / 255) * 100) : 0;
    }
    case 'cover':
      if (GUARDED_COVERS.has(a.device_class)) return null;
      return typeof a.current_position === 'number' ? a.current_position : null;
    case 'fan':
      if (typeof a.percentage !== 'number' && state !== 'off') return null;
      return state === 'on' ? (a.percentage ?? 100) : 0;
    default:
      return null;
  }
}

/** Sends a level chosen by dragging. 0 turns lights and fans off. */
export function setLevel(hass: HomeAssistant, stateObj: HassEntity, level: number): void {
  const entity_id = stateObj.entity_id;
  const value = Math.max(0, Math.min(100, Math.round(level)));
  switch (domainOf(entity_id)) {
    case 'light':
      if (value === 0) hass.callService('light', 'turn_off', { entity_id });
      else hass.callService('light', 'turn_on', { entity_id, brightness_pct: value });
      break;
    case 'cover':
      hass.callService('cover', 'set_cover_position', { entity_id, position: value });
      break;
    case 'fan':
      if (value === 0) hass.callService('fan', 'turn_off', { entity_id });
      else hass.callService('fan', 'set_percentage', { entity_id, percentage: value });
      break;
  }
}

/** What tapping the icon does. Returns false when it should open the detail view instead. */
export function tapAction(hass: HomeAssistant, stateObj: HassEntity | undefined): boolean {
  if (!stateObj) return false;
  const domain = domainOf(stateObj.entity_id);
  const target = { entity_id: stateObj.entity_id };

  if (domain === 'scene' || domain === 'script') {
    hass.callService(domain, 'turn_on', target);
    return true;
  }
  if (domain === 'cover' && GUARDED_COVERS.has(stateObj.attributes.device_class)) return false;
  if (TOGGLES.has(domain)) {
    hass.callService('homeassistant', 'toggle', target);
    return true;
  }
  return false;
}

export function isGuardedCover(stateObj: HassEntity): boolean {
  return domainOf(stateObj.entity_id) === 'cover' && GUARDED_COVERS.has(stateObj.attributes.device_class);
}

/**
 * Opens an entity's detail view: the frame claims the event and shows its own
 * page. Nothing claims it outside a frame, so Home Assistant's dialog opens.
 */
export function openDetail(from: HTMLElement, entityId: string): void {
  const event = new CustomEvent('luxframe-open-detail', {
    detail: { entityId },
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  if (from.dispatchEvent(event)) openMoreInfo(from, entityId);
}

/** Home Assistant's own more-info dialog. */
export function openMoreInfo(from: HTMLElement, entityId: string): void {
  from.dispatchEvent(
    new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }),
  );
}

/** "5 minutes ago", in Home Assistant's language. */
export function changedAgo(hass: HomeAssistant | undefined, iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  if (Number.isNaN(seconds)) return undefined;
  const format = new Intl.RelativeTimeFormat(hass?.locale?.language, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(Math.round(seconds), 'second');
  if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return format.format(Math.round(seconds / 3600), 'hour');
  return format.format(Math.round(seconds / 86400), 'day');
}
