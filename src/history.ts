import type { HassEntity, HomeAssistant } from './types';

// An entity's past, from Home Assistant's recorder: numbers for a graph, or
// the changes of a state that isn't a number. Fails soft, like data.ts.

/** A number at a time (ms). */
export interface Point {
  t: number;
  v: number;
}

/** A state and when it began (ms). */
export interface Change {
  t: number;
  state: string;
}

/** The most points a graph draws; longer histories are averaged down. */
const MAX_POINTS = 240;
/** Reads younger than this are shared, so tiles on several pages ask once. */
const FRESH_MS = 60_000;

const cache = new Map<string, { at: number; result: Promise<Change[]> }>();

/** Every change of state in the last `hours`, oldest first. */
export function fetchChanges(hass: HomeAssistant | undefined, entityId: string, hours: number): Promise<Change[]> {
  const callWS = hass?.callWS?.bind(hass);
  if (!callWS) return Promise.resolve([]);
  const key = `${entityId}|${hours}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.result;
  const start = new Date(Date.now() - hours * 3600_000);
  const result = callWS<Record<string, Array<{ s: string; lu: number; lc?: number }>>>({
    type: 'history/history_during_period',
    start_time: start.toISOString(),
    entity_ids: [entityId],
    minimal_response: true,
    no_attributes: true,
    significant_changes_only: false,
  })
    .then((found) =>
      (found?.[entityId] ?? []).map((row) => ({ t: Math.max(start.getTime(), (row.lc ?? row.lu) * 1000), state: row.s })),
    )
    .catch(() => [] as Change[]);
  cache.set(key, { at: Date.now(), result });
  return result;
}

/** Hourly averages from long-term statistics, for spans longer than a couple of days. */
async function fetchStatistics(hass: HomeAssistant, entityId: string, hours: number): Promise<Point[]> {
  const start = new Date(Date.now() - hours * 3600_000);
  const found = await hass.callWS!<Record<string, Array<{ start: number | string; mean?: number; state?: number }>>>({
    type: 'recorder/statistics_during_period',
    start_time: start.toISOString(),
    statistic_ids: [entityId],
    period: 'hour',
    types: ['mean'],
  });
  return (found?.[entityId] ?? [])
    .map((row) => ({ t: typeof row.start === 'number' ? row.start : new Date(row.start).getTime(), v: Number(row.mean) }))
    .filter((p) => Number.isFinite(p.v));
}

/**
 * A number's history over the last `hours`, ending with its state now. Long
 * spans of a measured sensor come from hourly statistics; anything else from
 * its history, averaged down to a few hundred points.
 */
export async function fetchSeries(
  hass: HomeAssistant | undefined,
  stateObj: HassEntity,
  hours: number,
): Promise<Point[]> {
  if (!hass?.callWS) return [];
  let points: Point[] = [];
  if (hours > 48 && stateObj.attributes.state_class) {
    points = await fetchStatistics(hass, stateObj.entity_id, hours).catch(() => []);
  }
  if (!points.length) {
    points = (await fetchChanges(hass, stateObj.entity_id, hours))
      .map((c) => ({ t: c.t, v: Number(c.state) }))
      .filter((p) => Number.isFinite(p.v));
  }
  const now = Number(stateObj.state);
  if (Number.isFinite(now)) points.push({ t: Date.now(), v: now });
  return thin(points);
}

/** Averages neighbors together until there are at most MAX_POINTS. */
function thin(points: Point[]): Point[] {
  if (points.length <= MAX_POINTS) return points;
  const size = points.length / MAX_POINTS;
  const out: Point[] = [];
  for (let i = 0; i < MAX_POINTS; i++) {
    const slice = points.slice(Math.floor(i * size), Math.floor((i + 1) * size));
    if (!slice.length) continue;
    out.push({
      t: slice[Math.floor(slice.length / 2)].t,
      v: slice.reduce((sum, p) => sum + p.v, 0) / slice.length,
    });
  }
  // The last point is now; keep it exact.
  out[out.length - 1] = points[points.length - 1];
  return out;
}

/** Is this entity's state a number worth graphing? */
export function isNumeric(stateObj: HassEntity | undefined): boolean {
  if (!stateObj) return false;
  if (stateObj.attributes.unit_of_measurement || stateObj.attributes.state_class) return true;
  return stateObj.state !== '' && Number.isFinite(Number(stateObj.state));
}

/** "21.5", rounded to what the sensor itself shows, at most two places. */
export function formatNumber(hass: HomeAssistant | undefined, value: number, like?: string): string {
  const places = like?.includes('.') ? Math.min(2, like.split('.')[1].length) : Math.abs(value) < 10 ? 1 : 0;
  return value.toLocaleString(hass?.locale?.language, {
    minimumFractionDigits: 0,
    maximumFractionDigits: places,
  });
}
