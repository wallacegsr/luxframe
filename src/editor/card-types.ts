import { cardHelpers, cardName } from '../tiles/card';
import type { HomeAssistant, TileSize } from '../types';

/** A kind of Home Assistant card that can be made from scratch. */
export interface CardType {
  /** As a card's `type`: "thermostat", "custom:mushroom-light-card". */
  type: string;
  name: string;
  description: string;
  /** A starting tile size. */
  size: TileSize;
}

/** Home Assistant's own cards, most used first. */
const BUILT_IN: CardType[] = [
  { type: 'tile', name: 'Tile', description: 'One device, with quick controls', size: 'w' },
  { type: 'button', name: 'Button', description: 'A big button that runs an action', size: 's' },
  { type: 'entities', name: 'Entities', description: 'A list of devices and their states', size: 'm' },
  { type: 'glance', name: 'Glance', description: 'Several devices side by side', size: 'w' },
  { type: 'gauge', name: 'Gauge', description: 'A reading on a dial', size: 's' },
  { type: 'sensor', name: 'Sensor', description: 'A reading over a small graph', size: 'w' },
  { type: 'history-graph', name: 'History graph', description: 'How things changed over time', size: 'm' },
  { type: 'statistics-graph', name: 'Statistics graph', description: 'Long-term averages, lows and highs', size: 'm' },
  { type: 'statistic', name: 'Statistic', description: 'One figure for a period, such as today’s energy', size: 's' },
  { type: 'thermostat', name: 'Thermostat', description: 'A dial for a thermostat', size: 'm' },
  { type: 'humidifier', name: 'Humidifier', description: 'A dial for a humidifier', size: 'm' },
  { type: 'light', name: 'Light', description: 'A dial for a light’s brightness', size: 'm' },
  { type: 'weather-forecast', name: 'Weather forecast', description: 'Now and the days ahead', size: 'm' },
  { type: 'media-control', name: 'Media control', description: 'What a speaker is playing', size: 'w' },
  { type: 'alarm-panel', name: 'Alarm panel', description: 'Arm and disarm with a keypad', size: 'm' },
  { type: 'area', name: 'Area', description: 'A room’s picture, readings and controls', size: 'm' },
  { type: 'map', name: 'Map', description: 'Where people and devices are', size: 'm' },
  { type: 'calendar', name: 'Calendar', description: 'A month, week or list of events', size: 'l' },
  { type: 'todo-list', name: 'To-do list', description: 'A list to tick off', size: 'm' },
  { type: 'logbook', name: 'Logbook', description: 'What happened, most recent first', size: 'm' },
  { type: 'picture', name: 'Picture', description: 'An image that can run an action', size: 'm' },
  { type: 'picture-entity', name: 'Picture entity', description: 'A device shown as an image, or a camera', size: 'm' },
  { type: 'picture-glance', name: 'Picture glance', description: 'An image with devices along its edge', size: 'm' },
  { type: 'picture-elements', name: 'Picture elements', description: 'Icons and states placed on an image, such as a floor plan', size: 'l' },
  { type: 'markdown', name: 'Markdown', description: 'Text, with templates', size: 'm' },
  { type: 'iframe', name: 'Webpage', description: 'Another web page, embedded', size: 'l' },
  { type: 'clock', name: 'Clock', description: 'Home Assistant’s clock', size: 's' },
  { type: 'vertical-stack', name: 'Vertical stack', description: 'Cards one above another', size: 'm' },
  { type: 'horizontal-stack', name: 'Horizontal stack', description: 'Cards side by side', size: 'w' },
  { type: 'grid', name: 'Grid', description: 'Cards in columns', size: 'm' },
  { type: 'conditional', name: 'Conditional', description: 'A card that shows only when a condition holds', size: 'm' },
  { type: 'entity-filter', name: 'Entity filter', description: 'Only the devices in a given state', size: 'm' },
];

interface CustomCard {
  type?: string;
  name?: string;
  description?: string;
}

/** "thermostat" → "hui-thermostat-card"; "custom:mushroom-light-card" → "mushroom-light-card". */
export function cardTag(type: string): string {
  return type.startsWith('custom:') ? type.slice(7) : `hui-${type}-card`;
}

/**
 * Every card that can be made here: Home Assistant's own, then the custom
 * cards installed (through HACS or as a resource), which list themselves in
 * `window.customCards` whether or not any dashboard uses them.
 */
export function cardTypes(): CardType[] {
  const listed = (window as unknown as { customCards?: CustomCard[] }).customCards;
  const custom: CardType[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(listed) ? listed : []) {
    if (!c || typeof c.type !== 'string' || !c.type || c.type === 'luxframe-card' || seen.has(c.type)) continue;
    seen.add(c.type);
    const type = `custom:${c.type}`;
    custom.push({
      type,
      name: typeof c.name === 'string' && c.name ? c.name : cardName({ type }),
      description: typeof c.description === 'string' && c.description ? c.description : 'A custom card',
      size: 'm',
    });
  }
  custom.sort((a, b) => a.name.localeCompare(b.name));
  return [...BUILT_IN, ...custom];
}

interface CardClass {
  getStubConfig?: (
    hass: HomeAssistant | undefined,
    entities: string[],
    entitiesFallback: string[],
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

const DEFINE_WAIT_MS = 4000;

/**
 * The card's class, once Home Assistant has it. Home Assistant loads its own
 * cards only as they're first made, so one no dashboard has shown yet is
 * made here to bring its code in.
 */
export async function cardClass(type: string, config?: Record<string, unknown>): Promise<(CustomElementConstructor & CardClass) | undefined> {
  const tag = cardTag(type);
  const found = customElements.get(tag);
  if (found) return found as CustomElementConstructor & CardClass;
  const helpers = cardHelpers();
  if (!helpers) return undefined;
  try {
    (await helpers).createCardElement({ ...config, type });
  } catch {
    // Still waited for below.
  }
  await Promise.race([customElements.whenDefined(tag), new Promise((r) => setTimeout(r, DEFINE_WAIT_MS))]);
  return customElements.get(tag) as (CustomElementConstructor & CardClass) | undefined;
}

/**
 * A new card of a type, filled in the way Home Assistant's own "Add card"
 * does it: with the card's starting config, which picks entities that suit it.
 */
export async function newCard(hass: HomeAssistant | undefined, type: string): Promise<Record<string, unknown>> {
  try {
    const cls = await cardClass(type);
    if (cls?.getStubConfig) {
      const all = Object.keys(hass?.states ?? {});
      const working = all.filter((id) => !['unavailable', 'unknown'].includes(hass!.states[id].state));
      const stub = await cls.getStubConfig(hass, working, all);
      if (stub && typeof stub === 'object') return { ...stub, type };
    }
  } catch {
    // A card that can't say how it starts begins bare.
  }
  return { type };
}
