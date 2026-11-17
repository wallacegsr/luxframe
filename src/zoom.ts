/**
 * How much an element is enlarged by the frame's `scale`; 1 when it isn't.
 * A pointer moves in screen pixels, but a transform or a size set on a zoomed
 * element is in its own, so a drag divides the distance by this to stay
 * under the finger.
 */
export function zoomOf(el: Element | null | undefined): number {
  const zoom = (el as (Element & { currentCSSZoom?: number }) | null | undefined)?.currentCSSZoom;
  return typeof zoom === 'number' && zoom > 0 ? zoom : 1;
}
