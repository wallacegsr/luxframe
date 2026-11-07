// Whether this device should get the flat style when `style: auto`.
//
// Blur is the expensive part of the glass. A browser that can't do
// backdrop-filter goes flat at once. Otherwise LuxFrame times a couple of
// seconds of animation frames once the page has settled; under 30 frames a
// second, it goes flat. The answer is kept per tablet so the look doesn't
// change from one load to the next.

const KEY = 'luxframe:flat';
const SETTLE_MS = 2500;
const FRAMES = 60;
const SLOW_FRAME_MS = 34;

export const canBlur = (): boolean =>
  CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');

function remembered(): boolean | undefined {
  try {
    const value = localStorage.getItem(KEY);
    return value === null ? undefined : value === '1';
  } catch {
    return undefined;
  }
}

function remember(flat: boolean): void {
  try {
    localStorage.setItem(KEY, flat ? '1' : '0');
  } catch {
    // Blocked storage: measure again next time.
  }
}

/** Calls `apply` with the answer: at once when known, else after measuring. */
export function detectFlat(apply: (flat: boolean) => void): void {
  if (!canBlur()) return apply(true);
  const known = remembered();
  if (known !== undefined) return apply(known);
  apply(false);

  window.setTimeout(() => {
    // A hidden tab doesn't draw frames; try again on the next load.
    if (document.hidden) return;
    const times: number[] = [];
    const frame = (t: number) => {
      times.push(t);
      if (times.length < FRAMES) {
        requestAnimationFrame(frame);
        return;
      }
      const intervals = times.slice(1).map((v, i) => v - times[i]).sort((a, b) => a - b);
      const median = intervals[Math.floor(intervals.length / 2)];
      const flat = median > SLOW_FRAME_MS;
      remember(flat);
      if (flat) apply(true);
    };
    requestAnimationFrame(frame);
  }, SETTLE_MS);
}
