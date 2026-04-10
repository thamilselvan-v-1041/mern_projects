/**
 * Timeline audio playback in the Remotion composition (fed by
 * `normalizeAudioTracksForComposition` in `lib/timeline-audio-layers.ts`).
 */
import React from "react";
import { Audio, useVideoConfig } from "remotion";
import type { TimelineAudio } from "@/types/types";

type Props = {
  track: TimelineAudio;
  sequenceDurationInFrames: number;
};

function AudioWithFadesInner({
  track,
  sequenceDurationInFrames,
}: Props) {
  const { fps } = useVideoConfig();
  const safeTrimStart = Math.max(0, Math.floor(track.trimStart ?? 0));
  const safeDuration = Math.max(1, Math.floor(sequenceDurationInFrames));
  const trimEnd = safeTrimStart + safeDuration;
  const fullClipTimestampSec = safeDuration / Math.max(1, fps);
  const base = track.volume ?? 1;
  const fi = Math.max(0, track.fadeInFrames ?? 0);
  const fo = Math.max(0, track.fadeOutFrames ?? 0);
  const safeBaseVolume = Math.max(0, Math.min(1, base));
  const usesFadeEnvelope = fi > 0 || fo > 0;

  const volumeFn = React.useCallback(
    (f: number) => {
      let v = base;
      if (fi > 0 && f < fi) {
        v *= f / fi;
      }
      if (fo > 0 && safeDuration > 1) {
        const startFade = safeDuration - fo;
        if (f >= startFade) {
          v *= Math.max(0, (safeDuration - 1 - f) / fo);
        }
      }
      return Math.max(0, Math.min(1, v));
    },
    [base, fi, fo, safeDuration]
  );

  return (
    <Audio
      src={track.src}
      startFrom={safeTrimStart}
      endAt={trimEnd}
      loop={false}
      playbackRate={1}
      volume={usesFadeEnvelope ? volumeFn : safeBaseVolume}
      pauseWhenBuffering
      acceptableTimeShiftInSeconds={fullClipTimestampSec}
    />
  );
}

export const AudioWithFades = React.memo(AudioWithFadesInner);
