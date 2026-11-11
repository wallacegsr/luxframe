import type { HomeAssistant } from '../../types';
import { BUSY, UNUSABLE, hasBypass, pourTotal, type Recipe, type StudioEntities } from './shared';

// The brew under way, and the one before it, as the graph draws them: the
// scale's weight over time and when each pour began. Kept here rather than in
// the graph, so a brew is recorded whichever tab is showing, and filled in
// from Home Assistant's history when the page opens partway through one.

/** Weight in grams at a time (ms). */
export interface Sample {
  t: number;
  w: number;
}

export interface Brew {
  /** When grinding or brewing began (ms). */
  start: number;
  /** When it finished; unset while it's under way. */
  end?: number;
  recipe?: string;
  /** The water it pours, bypass and all, in grams. */
  target?: number;
  samples: Sample[];
  /** When each pour began. */
  pours: Array<{ t: number; n: number }>;
}

/** The longest a brew is kept to, for the graph. */
const LONGEST_MS = 30 * 60_000;

let current: Brew | undefined;
let last: Brew | undefined;
let lastPour = 0;
const listeners = new Set<() => void>();

/** The brew under way, else the last one. */
export function brewNow(): Brew | undefined {
  return current ?? last;
}

export function onBrew(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const tell = () => listeners.forEach((l) => l());

const num = (hass: HomeAssistant, id: string | undefined): number => {
  const s = id ? hass.states[id] : undefined;
  return s && !UNUSABLE.includes(s.state) ? Number(s.state) : NaN;
};

function targetOf(hass: HomeAssistant, entities: StudioEntities): number | undefined {
  const s = entities['select.recipe'] ? hass.states[entities['select.recipe']] : undefined;
  if (!s || UNUSABLE.includes(s.state)) return undefined;
  const r = s.attributes as Recipe;
  const water = pourTotal(r) + (hasBypass(r) ? Number(r.bypass_volume_ml) : 0);
  return water > 0 ? water : undefined;
}

/** Notes the machine's state; called with every update Home Assistant sends. */
export function record(hass: HomeAssistant | undefined, entities: StudioEntities): void {
  if (!hass) return;
  const statusId = entities['sensor.brew_status'];
  const status = statusId ? hass.states[statusId] : undefined;
  if (!status) return;
  const busy = BUSY.includes(status.state);
  const now = Date.now();
  if (!busy) {
    if (current) {
      current.end = now;
      last = current;
      current = undefined;
      tell();
    }
    return;
  }
  if (!current) {
    // Grinding comes first; if the page opened while brewing, history says when it began.
    const since = Date.parse(status.last_changed ?? '');
    current = {
      start: Number.isFinite(since) && since < now ? since : now,
      recipe: entities['sensor.current_recipe'] ? hass.states[entities['sensor.current_recipe']]?.state : undefined,
      target: targetOf(hass, entities),
      samples: [],
      pours: [],
    };
    lastPour = 0;
    void backfill(hass, entities, current);
  }
  const brew = current;
  brew.target ??= targetOf(hass, entities);
  const w = num(hass, entities['sensor.scale_weight']);
  const previous = brew.samples[brew.samples.length - 1];
  if (Number.isFinite(w) && (!previous || previous.w !== w || now - previous.t > 1000)) {
    brew.samples.push({ t: now, w });
  }
  const pour = num(hass, entities['sensor.current_pour']);
  if (Number.isFinite(pour) && pour > 0 && pour !== lastPour) {
    lastPour = pour;
    brew.pours.push({ t: now, n: pour });
  }
  // A brew left running, or a stuck sensor: drop the oldest.
  while (brew.samples.length && now - brew.samples[0].t > LONGEST_MS) brew.samples.shift();
  tell();
}

/**
 * What Home Assistant's history has of a brew from before the page saw it:
 * when it began, and the weight and pours since.
 */
async function backfill(hass: HomeAssistant, entities: StudioEntities, brew: Brew): Promise<void> {
  const ids = {
    status: entities['sensor.brew_status'],
    weight: entities['sensor.scale_weight'],
    pour: entities['sensor.current_pour'],
  };
  if (!hass.callWS || !ids.status) return;
  const from = Date.now() - LONGEST_MS;
  type Row = { s: string; lu: number; lc?: number };
  let found: Record<string, Row[]> | undefined;
  try {
    found = await hass.callWS<Record<string, Row[]>>({
      type: 'history/history_during_period',
      start_time: new Date(from).toISOString(),
      entity_ids: Object.values(ids).filter(Boolean),
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false,
    });
  } catch {
    return;
  }
  if (!found || current !== brew) return;
  const at = (row: Row) => (row.lc ?? row.lu) * 1000;
  // The start is the last time it went from something else to grinding or brewing.
  const statuses = found[ids.status] ?? [];
  for (let i = statuses.length - 1; i >= 0; i--) {
    if (!BUSY.includes(statuses[i].s)) break;
    brew.start = Math.min(brew.start, Math.max(from, at(statuses[i])));
  }
  const firstSeen = brew.samples[0]?.t ?? Infinity;
  const before = (found[ids.weight ?? ''] ?? [])
    .map((row) => ({ t: at(row), w: Number(row.s) }))
    .filter((p) => Number.isFinite(p.w) && p.t >= brew.start && p.t < firstSeen);
  brew.samples.unshift(...before);
  const pours = (found[ids.pour ?? ''] ?? [])
    .map((row) => ({ t: at(row), n: Number(row.s) }))
    .filter((p) => p.n > 0 && p.t >= brew.start && p.t < (brew.pours[0]?.t ?? Infinity));
  brew.pours.unshift(...pours.filter((p, i) => i === 0 || p.n !== pours[i - 1].n));
  tell();
}
