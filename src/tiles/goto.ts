/** What a tile can ask the frame to show: the first page of a type, or with a title. */
export interface GotoTarget {
  type?: string;
  title?: string;
}

/**
 * Asks the frame to go to a page, e.g. a calendar tile to the calendar page.
 * Returns false when no page matched, so the tile can do something else.
 */
export function goTo(from: HTMLElement, target: GotoTarget): boolean {
  const event = new CustomEvent<GotoTarget>('luxframe-goto', {
    detail: target,
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  // The frame calls preventDefault when it found the page.
  return !from.dispatchEvent(event);
}
