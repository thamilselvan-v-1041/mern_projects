import type { TimelineAudio } from "@/types/types";

/**
 * Timeline audio → Remotion composition layers.
 *
 * Flow: `audioTracks` state → `normalizeAudioTracksForComposition` →
 * one `<Sequence>` + `AudioWithFades` per track id (`components/audio-with-fades.tsx`).
 * Video clip volume is muted in `ClipSequenceContent` when any normalized layer exists.
 */
export type NormalizedAudioLayer = {
  track: TimelineAudio;
  safeStart: number;
  safeDuration: number;
  safeTrimStart: number;
  renderKey: string;
};

/**
 * Normalize timeline audio into renderable layers.
 *
 * Guards against two duplicate classes:
 * 1) same `track.id` appearing multiple times in state
 * 2) same audible segment represented by different ids (can happen after rapid edits/undo)
 */
export function normalizeAudioTracksForComposition(
  audioTracks: TimelineAudio[],
): NormalizedAudioLayer[] {
  const bySignature = new Map<
    string,
    {
      track: TimelineAudio;
      safeStart: number;
      safeDuration: number;
      safeTrimStart: number;
    }
  >();
  for (const track of audioTracks) {
    const safeStart = Math.max(0, Math.floor(track.start));
    const safeDuration = Math.max(1, Math.floor(track.duration));
    const safeTrimStart = Math.max(0, Math.floor(track.trimStart ?? 0));
    const candidate = { track, safeStart, safeDuration, safeTrimStart };
    const signature = [
      track.src,
      safeStart,
      safeDuration,
      safeTrimStart,
      track.row,
      track.volume ?? 1,
      track.fadeInFrames ?? 0,
      track.fadeOutFrames ?? 0,
    ].join("|");
    const existing = bySignature.get(signature);
    if (!existing || track.id.localeCompare(existing.track.id) < 0) {
      bySignature.set(signature, candidate);
    }
  }

  const byId = new Map<string, NormalizedAudioLayer>();
  for (const layer of bySignature.values()) {
    byId.set(layer.track.id, {
      ...layer,
      renderKey: `audio:id:${layer.track.id}`,
    });
  }

  return Array.from(byId.values()).sort((a, b) => {
      if (a.safeStart !== b.safeStart) return a.safeStart - b.safeStart;
      if (a.safeTrimStart !== b.safeTrimStart) {
        return a.safeTrimStart - b.safeTrimStart;
      }
      return a.track.id.localeCompare(b.track.id);
    });
}
