import type { HassEntity, HomeAssistant } from './types';

/** media_player supported_features bits. */
export const MEDIA = {
  PAUSE: 1,
  VOLUME_SET: 4,
  PREVIOUS: 16,
  NEXT: 32,
  PLAY: 16384,
} as const;

export const supports = (s: HassEntity | undefined, bit: number): boolean =>
  !!s && ((s.attributes.supported_features ?? 0) & bit) !== 0;

function isMusicAssistant(hass: HomeAssistant, s: HassEntity): boolean {
  return hass.entities?.[s.entity_id]?.platform === 'music_assistant' || 'mass_player_type' in s.attributes;
}

/**
 * The speaker the quick panel follows: the configured one, or else the best
 * guess. Playing beats paused beats idle, and Music Assistant's players beat
 * the speakers' own integrations, which tend to duplicate them.
 */
export function pickPlayer(hass: HomeAssistant | undefined, configured?: string): HassEntity | undefined {
  if (!hass) return undefined;
  if (configured) return hass.states[configured];
  const rank = (s: HassEntity) =>
    ({ playing: 0, paused: 2, buffering: 0, on: 4, idle: 4 })[s.state] ?? 6;
  return Object.values(hass.states)
    .filter((s) => s.entity_id.startsWith('media_player.') && s.state !== 'unavailable')
    .filter((s) => !hass.entities?.[s.entity_id]?.hidden)
    .sort(
      (a, b) =>
        rank(a) - (isMusicAssistant(hass, a) ? 1 : 0) - (rank(b) - (isMusicAssistant(hass, b) ? 1 : 0)) ||
        a.entity_id.localeCompare(b.entity_id),
    )[0];
}
