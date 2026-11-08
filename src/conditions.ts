import type { GridTileConfig, HomeAssistant } from './types';

/**
 * Home Assistant's visibility conditions, as cards on its dashboards take
 * them, checked the way its frontend checks them: state, numeric_state,
 * screen, user, time, and/or/not, and the older `entity` + `state` shape.
 * A condition LuxFrame doesn't know (location, view_columns) is met, so a
 * tile never vanishes over one.
 */
export type Condition = Record<string, unknown>;

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

/** An entity's state when `value` names one, as HA allows for state and above/below. */
function stateOf(hass: HomeAssistant, value: unknown): string | undefined {
  return typeof value === 'string' && /^\w+\.\w+$/.test(value) ? hass.states[value]?.state : undefined;
}

function entityOf(condition: Condition): string | undefined {
  const id = condition.entity_id ?? condition.entity;
  return typeof id === 'string' ? id : Array.isArray(id) && typeof id[0] === 'string' ? id[0] : undefined;
}

function checkState(condition: Condition, hass: HomeAssistant): boolean {
  const id = entityOf(condition);
  const entity = id ? hass.states[id] : undefined;
  const attribute = typeof condition.attribute === 'string' ? condition.attribute : undefined;
  const state = !entity
    ? 'unknown'
    : attribute
      ? String(entity.attributes[attribute] ?? 'unknown')
      : entity.state;
  const value = condition.state ?? condition.state_not;
  if (value === undefined || value === null) return false;
  const values = list(value).flatMap((v) => [String(v), stateOf(hass, v)]).filter((v) => v !== undefined);
  return condition.state != null ? values.includes(state) : !values.includes(state);
}

function checkNumeric(condition: Condition, hass: HomeAssistant): boolean {
  const id = entityOf(condition);
  const entity = id ? hass.states[id] : undefined;
  const raw = typeof condition.attribute === 'string' ? entity?.attributes[condition.attribute] : entity?.state;
  const n = Number(raw);
  if (raw === undefined || raw === null || raw === '' || Number.isNaN(n)) return false;
  const bound = (v: unknown) => Number(stateOf(hass, v) ?? v);
  const above = bound(condition.above);
  const below = bound(condition.below);
  return (
    (condition.above == null || Number.isNaN(above) || above < n) &&
    (condition.below == null || Number.isNaN(below) || below > n)
  );
}

/** "07:30" or "07:30:15" as seconds since midnight. */
function seconds(time: unknown): number | undefined {
  if (typeof time !== 'string') return undefined;
  const [h, m = 0, s = 0] = time.split(':').map(Number);
  return [h, m, s].some(Number.isNaN) ? undefined : h * 3600 + m * 60 + s;
}

function checkTime(condition: Condition): boolean {
  const now = new Date();
  if (Array.isArray(condition.weekdays) && !condition.weekdays.includes(WEEKDAYS[now.getDay()])) return false;
  const t = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const after = seconds(condition.after);
  const before = seconds(condition.before);
  if (after !== undefined && before !== undefined && before < after) return t >= after || t < before; // over midnight
  return (after === undefined || t >= after) && (before === undefined || t < before);
}

function met(condition: Condition, hass: HomeAssistant): boolean {
  if (!condition || typeof condition !== 'object') return true;
  const nested = Array.isArray(condition.conditions) ? (condition.conditions as Condition[]) : undefined;
  switch (condition.condition) {
    case 'numeric_state':
      return checkNumeric(condition, hass);
    case 'screen':
      return typeof condition.media_query === 'string' ? matchMedia(condition.media_query).matches : false;
    case 'user':
      return Array.isArray(condition.users) && !!hass.user?.id ? condition.users.includes(hass.user.id) : false;
    case 'time':
      return checkTime(condition);
    case 'and':
      return !nested || conditionsMet(nested, hass);
    case 'or':
      return !nested || nested.some((c) => met(c, hass));
    case 'not':
      return !nested || !conditionsMet(nested, hass);
    case 'state':
    case undefined:
      return checkState(condition, hass);
    default:
      return true;
  }
}

export function conditionsMet(conditions: unknown, hass: HomeAssistant | undefined): boolean {
  if (!hass || !Array.isArray(conditions) || !conditions.length) return true;
  return conditions.every((c) => met(c as Condition, hass));
}

/** A tile's own `visibility`, or for a card tile, the card's, as it came from a dashboard. */
export function tileConditions(tile: GridTileConfig): unknown {
  if (tile.visibility) return tile.visibility;
  return tile.type === 'card' ? tile.card?.visibility : undefined;
}

export function tileShows(tile: GridTileConfig, hass: HomeAssistant | undefined): boolean {
  return conditionsMet(tileConditions(tile), hass);
}
