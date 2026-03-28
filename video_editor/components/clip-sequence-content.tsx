import React from "react";
import {
  AbsoluteFill,
  Img,
  Video,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import type { Clip, LayerTransitionPreset } from "@/types/types";

function transitionOpacity(
  frame: number,
  durationInFrames: number,
  tf: number,
  tin: LayerTransitionPreset,
  tout: LayerTransitionPreset
): number {
  let o = 1;
  const safeTf = Math.max(1, Math.min(tf, Math.floor(durationInFrames / 2)));
  if (tin !== "none" && frame < safeTf) {
    o = interpolate(frame, [0, safeTf - 1], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
  }
  const last = durationInFrames - 1;
  if (tout !== "none" && durationInFrames > 1 && frame > last - safeTf) {
    const oOut = interpolate(frame, [last - safeTf + 1, last], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    });
    o = Math.min(o, oOut);
  }
  return o;
}

function transitionOffset(
  frame: number,
  durationInFrames: number,
  tf: number,
  tin: LayerTransitionPreset,
  tout: LayerTransitionPreset
): { tx: number; ty: number; extraScale: number } {
  const safeTf = Math.max(1, Math.min(tf, Math.floor(durationInFrames / 2)));
  let tx = 0;
  let ty = 0;
  let extraScale = 1;
  const slide = 0.08;
  const W = 1920;
  const H = 1080;

  if (frame < safeTf && tin !== "none" && tin !== "fade" && tin !== "zoomIn") {
    const t = interpolate(frame, [0, safeTf - 1], [1, 0], {
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    if (tin === "slideLeft") tx = t * slide * W;
    if (tin === "slideRight") tx = -t * slide * W;
    if (tin === "slideUp") ty = t * slide * H;
    if (tin === "slideDown") ty = -t * slide * H;
  }

  const last = durationInFrames - 1;
  if (
    frame > last - safeTf &&
    tout !== "none" &&
    tout !== "fade" &&
    tout !== "zoomIn" &&
    durationInFrames > 1
  ) {
    const t = interpolate(frame, [last - safeTf + 1, last], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    });
    if (tout === "slideLeft") tx -= t * slide * W;
    if (tout === "slideRight") tx += t * slide * W;
    if (tout === "slideUp") ty -= t * slide * H;
    if (tout === "slideDown") ty += t * slide * H;
  }

  if (tin === "zoomIn" && frame < safeTf) {
    extraScale = interpolate(frame, [0, safeTf - 1], [0.92, 1], {
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
  }
  if (tout === "zoomIn" && durationInFrames > 1 && frame > last - safeTf) {
    const zs = interpolate(frame, [last - safeTf + 1, last], [1, 1.06], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    extraScale = Math.min(extraScale, zs);
  }

  return { tx, ty, extraScale };
}

type Props = {
  clip: Clip;
  zIndex: number;
};

/**
 * One timeline clip inside a Remotion Sequence: position, scale, and in/out transitions.
 */
export const ClipSequenceContent: React.FC<Props> = ({ clip, zIndex }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const tf = clip.transitionFrames ?? 15;
  const tin = clip.transitionIn ?? "none";
  const tout = clip.transitionOut ?? "none";

  const opacity = transitionOpacity(
    frame,
    durationInFrames,
    tf,
    tin,
    tout
  );
  const { tx, ty, extraScale } = transitionOffset(
    frame,
    durationInFrames,
    tf,
    tin,
    tout
  );

  const posX = clip.posX ?? 50;
  const posY = clip.posY ?? 50;
  const scale = (clip.scale ?? 1) * extraScale;

  return (
    <AbsoluteFill style={{ zIndex, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: `${posX}%`,
          top: `${posY}%`,
          width: "100%",
          height: "100%",
          transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${scale})`,
          opacity,
        }}
      >
        {clip.mediaType === "image" ? (
          <Img
            src={clip.src}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <Video
            src={clip.src}
            startFrom={clip.trimStart ?? 0}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
