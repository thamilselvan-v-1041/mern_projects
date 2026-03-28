"use client";

import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import type { TextAnimationPreset, TextOverlay } from "@/types/types";
import {
  DEFAULT_ANIM_IN_FRAMES,
  DEFAULT_FONT_SIZE_REM,
  DEFAULT_TEXT_COLOR,
} from "./text-animation-presets";

type Props = Pick<
  TextOverlay,
  | "text"
  | "animation"
  | "animInFrames"
  | "fontSizeRem"
  | "color"
  | "animDirection"
  | "fontWeight"
>;

/**
 * Renders one text layer with Canva-style intro motion (sequence-local frames).
 */
export const TextOverlayLayer: React.FC<Props> = ({
  text,
  animation = "fade",
  animInFrames = DEFAULT_ANIM_IN_FRAMES,
  fontSizeRem = DEFAULT_FONT_SIZE_REM,
  color = DEFAULT_TEXT_COLOR,
  animDirection = "left",
  fontWeight = "bold",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const animIn = Math.max(6, Math.min(120, animInFrames));

  const fontW =
    fontWeight === "light" ? 300 : fontWeight === "normal" ? 400 : 700;

  const base: React.CSSProperties = {
    color,
    fontSize: `${fontSizeRem}rem`,
    fontWeight: fontW,
    margin: 0,
    textAlign: "center",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  let wrapper: React.CSSProperties = {};
  let inner: React.CSSProperties = base;
  let displayText = text;

  switch (animation as TextAnimationPreset) {
    case "none":
      break;

    case "fade": {
      const o = interpolate(frame, [0, animIn], [0, 1], {
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
      wrapper = { opacity: o };
      break;
    }

    case "rise": {
      const o = interpolate(frame, [0, animIn], [0, 1], {
        extrapolateRight: "clamp",
      });
      const y = interpolate(frame, [0, animIn], [48, 0], {
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
      wrapper = { opacity: o, transform: `translateY(${y}px)` };
      break;
    }

    case "pan": {
      const o = interpolate(frame, [0, animIn], [0, 1], {
        extrapolateRight: "clamp",
      });
      const dist = 120;
      let x = 0;
      let y = 0;
      if (animDirection === "left")
        x = interpolate(frame, [0, animIn], [-dist, 0], {
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });
      else if (animDirection === "right")
        x = interpolate(frame, [0, animIn], [dist, 0], {
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });
      else if (animDirection === "up")
        y = interpolate(frame, [0, animIn], [dist, 0], {
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });
      else
        y = interpolate(frame, [0, animIn], [-dist, 0], {
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });
      wrapper = { opacity: o, transform: `translate(${x}px, ${y}px)` };
      break;
    }

    case "drift": {
      const o = interpolate(frame, [0, animIn], [0, 1], {
        extrapolateRight: "clamp",
      });
      const sway = Math.sin((frame / fps) * 1.2) * 6;
      const y = interpolate(frame, [0, animIn], [20, 0], {
        extrapolateRight: "clamp",
      });
      wrapper = { opacity: o, transform: `translate(${sway}px, ${y}px)` };
      break;
    }

    case "typewriter": {
      const n = text.length;
      const shown = Math.min(
        n,
        Math.floor(
          interpolate(frame, [0, animIn], [0, n], {
            extrapolateRight: "clamp",
          })
        )
      );
      displayText = text.slice(0, Math.max(0, shown));
      break;
    }

    case "bounce": {
      const sc = spring({
        frame,
        fps,
        from: 0.35,
        to: 1,
        durationInFrames: animIn,
        config: { damping: 12, mass: 0.8 },
      });
      const o = interpolate(frame, [0, Math.min(12, animIn)], [0, 1], {
        extrapolateRight: "clamp",
      });
      wrapper = { opacity: o, transform: `scale(${sc})` };
      inner = { ...base, transformOrigin: "center center" };
      break;
    }

    case "blur": {
      const o = interpolate(frame, [0, animIn], [0, 1], {
        extrapolateRight: "clamp",
      });
      const b = interpolate(frame, [0, animIn], [18, 0], {
        extrapolateRight: "clamp",
      });
      wrapper = { opacity: o, filter: `blur(${b}px)` };
      break;
    }

    case "pop": {
      const sc = spring({
        frame,
        fps,
        from: 0.2,
        to: 1,
        durationInFrames: Math.max(8, Math.floor(animIn * 0.6)),
        config: { damping: 14 },
      });
      const o = interpolate(frame, [0, 8], [0, 1], {
        extrapolateRight: "clamp",
      });
      wrapper = { opacity: o, transform: `scale(${sc})` };
      inner = { ...base, transformOrigin: "center center" };
      break;
    }

    case "wipe": {
      const p = interpolate(frame, [0, animIn], [0, 100], {
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
      let clipPath: string;
      if (animDirection === "right") clipPath = `inset(0 0 0 ${100 - p}%)`;
      else if (animDirection === "up") clipPath = `inset(${100 - p}% 0 0 0)`;
      else if (animDirection === "down") clipPath = `inset(0 0 ${100 - p}% 0)`;
      else clipPath = `inset(0 ${100 - p}% 0 0)`;
      const o = interpolate(frame, [0, Math.min(10, animIn)], [0, 1], {
        extrapolateRight: "clamp",
      });
      wrapper = { opacity: o };
      inner = { ...base, clipPath, WebkitClipPath: clipPath };
      break;
    }

    default: {
      const o = interpolate(frame, [0, animIn], [0, 1], {
        extrapolateRight: "clamp",
      });
      wrapper = { opacity: o };
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "92%",
        maxWidth: "1600px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        ...wrapper,
      }}
    >
      <h1 style={inner}>{displayText}</h1>
    </div>
  );
};
