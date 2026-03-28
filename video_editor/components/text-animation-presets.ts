import type { TextAnimationPreset } from "@/types/types";

export type AnimationOption = {
  id: TextAnimationPreset;
  label: string;
  description: string;
  supportsDirection: boolean;
};

export const TEXT_ANIMATION_OPTIONS: AnimationOption[] = [
  { id: "none", label: "None", description: "Static text", supportsDirection: false },
  { id: "fade", label: "Fade", description: "Soft fade in", supportsDirection: false },
  { id: "rise", label: "Rise", description: "Fade up from below", supportsDirection: false },
  { id: "pan", label: "Pan", description: "Slide in from an edge", supportsDirection: true },
  { id: "drift", label: "Drift", description: "Gentle float with fade", supportsDirection: false },
  { id: "typewriter", label: "Typewriter", description: "Characters appear in order", supportsDirection: false },
  { id: "bounce", label: "Bounce", description: "Spring scale in", supportsDirection: false },
  { id: "blur", label: "Blur", description: "Focus from blur", supportsDirection: false },
  { id: "pop", label: "Pop", description: "Quick scale pop", supportsDirection: false },
  { id: "wipe", label: "Wipe", description: "Reveal with a wipe", supportsDirection: true },
];

export const DEFAULT_TEXT_ANIM: TextAnimationPreset = "fade";
export const DEFAULT_ANIM_IN_FRAMES = 30;
export const DEFAULT_FONT_SIZE_REM = 5;
export const DEFAULT_TEXT_COLOR = "#ffffff";
export const DEFAULT_ANIM_DIRECTION: "left" | "right" | "up" | "down" = "left";

export function textOverlayDefaults() {
  return {
    animation: DEFAULT_TEXT_ANIM,
    animInFrames: DEFAULT_ANIM_IN_FRAMES,
    fontSizeRem: DEFAULT_FONT_SIZE_REM,
    color: DEFAULT_TEXT_COLOR,
    animDirection: DEFAULT_ANIM_DIRECTION,
    fontWeight: "bold" as const,
  };
}
