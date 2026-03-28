import React from "react";
import { Audio, useVideoConfig } from "remotion";
import type { TimelineAudio } from "@/types/types";

type Props = {
  track: TimelineAudio;
};

export const AudioWithFades: React.FC<Props> = ({ track }) => {
  const { durationInFrames } = useVideoConfig();
  const base = track.volume ?? 1;
  const fi = Math.max(0, track.fadeInFrames ?? 0);
  const fo = Math.max(0, track.fadeOutFrames ?? 0);

  const volumeFn = React.useCallback(
    (f: number) => {
      let v = base;
      if (fi > 0 && f < fi) {
        v *= f / fi;
      }
      if (fo > 0 && durationInFrames > 1) {
        const startFade = durationInFrames - fo;
        if (f >= startFade) {
          v *= Math.max(0, (durationInFrames - 1 - f) / fo);
        }
      }
      return Math.max(0, Math.min(1, v));
    },
    [base, fi, fo, durationInFrames]
  );

  return (
    <Audio
      src={track.src}
      startFrom={track.trimStart ?? 0}
      volume={volumeFn}
    />
  );
};
