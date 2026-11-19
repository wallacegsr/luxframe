import { CORE_SCHEMA, dump, load, mergeTag } from 'js-yaml';

// The YAML the editors read and write, in one place.

/** YAML 1.2 with `<<` merges, which Home Assistant's own dashboard YAML allows. */
const SCHEMA = CORE_SCHEMA.withTags(mergeTag);

/**
 * What a YAML field holds. Blank is `undefined` rather than an error, so an
 * emptied field gets the same "it needs…" message as one with nothing useful.
 * Throws on YAML that doesn't parse; `yamlError` words that.
 */
export function parseYaml(text: string): unknown {
  return text.trim() ? load(text, { schema: SCHEMA }) : undefined;
}

/** A value as YAML for a field, each on its own line however long. */
export function toYaml(value: unknown): string {
  return dump(value, { lineWidth: -1 });
}

/** Why YAML didn't parse, in a sentence for under the field. */
export function yamlError(e: unknown): string {
  const reason = (e as { reason?: string }).reason;
  return `That isn’t valid YAML${reason ? ` (${reason})` : ''}`;
}
