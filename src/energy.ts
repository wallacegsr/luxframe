import { css, html, nothing, svg } from 'lit';
import { domainOf } from './entity';
import { icon, type IconName } from './icons';
import type { EnergyTileConfig, HassEntity, HomeAssistant } from './types';

// Power flowing now between solar, the grid, a battery and the home, read
// from power sensors and drawn as four points joined to the home.

export type Source = 'solar' | 'grid' | 'battery' | 'home';

export const SOURCES: Array<{ key: Source; label: string; icon: IconName; color: string; match: RegExp }> = [
  { key: 'solar', label: 'Solar', icon: 'sun', color: 'var(--lf-color-light)', match: /solar|pv|photovoltaic|inverter/ },
  { key: 'grid', label: 'Grid', icon: 'plug', color: 'var(--lf-color-cover)', match: /grid|import|net_power|meter/ },
  { key: 'battery', label: 'Battery', icon: 'battery', color: 'var(--lf-color-switch)', match: /batter/ },
  { key: 'home', label: 'Home', icon: 'room', color: 'var(--lf-accent)', match: /home|house|load|consum|usage/ },
];

const isPower = (s: HassEntity) =>
  domainOf(s.entity_id) === 'sensor' &&
  (s.attributes.device_class === 'power' || /^(m|k)?W$/.test(s.attributes.unit_of_measurement ?? ''));

/** The sensor for each part: as configured, else the first power sensor named for it. */
export function energySensors(hass: HomeAssistant | undefined, config?: EnergyTileConfig): Partial<Record<Source, string>> {
  const power = Object.values(hass?.states ?? {}).filter(isPower);
  const found: Partial<Record<Source, string>> = {};
  const taken = new Set<string>();
  for (const { key, match } of SOURCES) {
    const configured = config?.[key];
    const id =
      configured ??
      power.find((s) => !taken.has(s.entity_id) && match.test(`${s.entity_id} ${s.attributes.friendly_name ?? ''}`.toLowerCase()))
        ?.entity_id;
    if (id) {
      found[key] = id;
      taken.add(id);
    }
  }
  return found;
}

/** A power sensor's reading in watts. */
export function watts(hass: HomeAssistant | undefined, id: string | undefined): number | undefined {
  const s = id ? hass?.states[id] : undefined;
  const value = Number(s?.state);
  if (!s || !Number.isFinite(value)) return undefined;
  const unit = s.attributes.unit_of_measurement;
  return unit === 'kW' ? value * 1000 : unit === 'MW' ? value * 1e6 : value;
}

/** What's flowing now, in watts; the home's use worked out when it has no sensor. */
export function readFlow(hass: HomeAssistant | undefined, sensors: Partial<Record<Source, string>>) {
  const solar = watts(hass, sensors.solar);
  const grid = watts(hass, sensors.grid);
  const battery = watts(hass, sensors.battery);
  let home = watts(hass, sensors.home);
  if (home === undefined && (solar !== undefined || grid !== undefined || battery !== undefined)) {
    home = Math.max(0, (solar ?? 0) + (grid ?? 0) + (battery ?? 0));
  }
  return { solar, grid, battery, home };
}

/** 450 → "450 W", 1234 → "1.2 kW". */
export function formatPower(w: number | undefined): string {
  if (w === undefined) return '–';
  const abs = Math.abs(w);
  if (abs >= 1000) return `${(abs / 1000).toLocaleString(undefined, { maximumFractionDigits: abs >= 10_000 ? 0 : 1 })} kW`;
  return `${Math.round(abs)} W`;
}

/** Which way each part is flowing, in words: "Exporting", "Charging". */
export function flowWord(key: Source, w: number | undefined): string {
  if (w === undefined || Math.abs(w) < 1) return key === 'solar' ? 'Not producing' : 'Idle';
  if (key === 'grid') return w > 0 ? 'Importing' : 'Exporting';
  if (key === 'battery') return w > 0 ? 'Discharging' : 'Charging';
  if (key === 'solar') return 'Producing';
  return 'Using';
}

const AT: Record<Source, [number, number]> = { solar: [50, 13], grid: [13, 50], battery: [50, 87], home: [87, 50] };

/**
 * The flow drawn: solar above, the grid left, the battery below, the home
 * right, each joined to the home by a line with dots moving the way power
 * goes. Only the parts that have a sensor are drawn.
 */
export function flowDiagram(flow: ReturnType<typeof readFlow>, sensors: Partial<Record<Source, string>>, words: boolean) {
  const [hx, hy] = AT.home;
  const lines = (['solar', 'grid', 'battery'] as const)
    .filter((k) => sensors[k] || flow[k] !== undefined)
    .map((k) => {
      const [x, y] = AT[k];
      const w = flow[k] ?? 0;
      // Bend the solar and battery lines around the middle.
      const d = k === 'grid' ? `M${x} ${y} L${hx} ${hy}` : `M${x} ${y} Q${x} ${hy} ${hx} ${hy}`;
      const moving = Math.abs(w) >= 1;
      return svg`<path class="line" d=${d} />
        ${moving ? svg`<path class="dots ${w < 0 ? 'back' : ''}" d=${d} style="stroke: ${SOURCES.find((s) => s.key === k)!.color}" />` : nothing}`;
    });
  return html`<div class="flow">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
    ${SOURCES.filter((s) => s.key === 'home' || sensors[s.key]).map((s) => {
      const [x, y] = AT[s.key];
      const w = flow[s.key];
      return html`<div class="node ${s.key}" style="left: ${x}%; top: ${y}%; --node: ${s.color}">
        <span class="ring">${icon(s.icon, 22)}</span>
        <span class="value">${formatPower(w)}</span>
        ${words ? html`<span class="word">${s.label} · ${flowWord(s.key, w).toLowerCase()}</span>` : nothing}
      </div>`;
    })}
  </div>`;
}

export const flowStyles = css`
  .flow {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .flow > svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .flow .line {
    fill: none;
    stroke: var(--lf-control);
    stroke-width: 3;
    vector-effect: non-scaling-stroke;
  }

  .flow .dots {
    fill: none;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-dasharray: 0.01 13.99;
    vector-effect: non-scaling-stroke;
    animation: flow 1.6s linear infinite;
  }

  .flow .dots.back {
    animation-direction: reverse;
  }

  @keyframes flow {
    to {
      stroke-dashoffset: -14;
    }
  }

  .node {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    transform: translate(-50%, -50%);
    text-align: center;
    white-space: nowrap;
  }

  .node .ring {
    display: grid;
    place-items: center;
    width: var(--ring, 44px);
    height: var(--ring, 44px);
    border-radius: 50%;
    color: var(--node);
    /* Hides where the lines meet the middle of the point. */
    background: color-mix(in srgb, var(--node) 14%, var(--lf-sheet));
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    box-shadow: inset 0 0 0 2px var(--node);
  }

  .node .value {
    font-size: var(--value-size, 15px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .node .word {
    font-size: 13px;
    color: var(--lf-muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .flow .dots {
      animation: none;
      stroke-dasharray: none;
      opacity: 0.6;
    }
  }
`;
