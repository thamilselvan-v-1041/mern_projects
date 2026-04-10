import type { MutableRefObject } from "react";

/**
 * Coalesces `Remotion` `<Player>.seekTo()` while the user drags the timeline playhead.
 *
 * The player drives **one** composition: stacked video **and** timeline `<Audio />`
 * (`components/audio-with-fades.tsx`). Unthrottled seeks restart the underlying media
 * element many times per second, which sounds like repeat/doubled audio.
 */

export function scheduleCoalescedScrubSeek(
  rafIdRef: MutableRefObject<number>,
  runSeek: () => void,
): void {
  if (rafIdRef.current !== 0) return;
  rafIdRef.current = requestAnimationFrame(() => {
    rafIdRef.current = 0;
    runSeek();
  });
}

export function cancelCoalescedScrubSeek(
  rafIdRef: MutableRefObject<number>,
): void {
  if (rafIdRef.current !== 0) {
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = 0;
  }
}
