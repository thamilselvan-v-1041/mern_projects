export interface Clip {
  id: string;
  start: number;
  duration: number;
  src: string;
  row: number;
  /** Frames skipped at the start of the source (Remotion `startFrom`). */
  trimStart?: number;
  /** AI-generated clips stack above regular video when times overlap. */
  fromAI?: boolean;
  /** Higher draws later (on top) among overlapping AI clips. */
  aiStackOrder?: number;
}

/** Preset intro animations (Canva-style). */
export type TextAnimationPreset =
  | "none"
  | "fade"
  | "rise"
  | "pan"
  | "drift"
  | "typewriter"
  | "bounce"
  | "blur"
  | "pop"
  | "wipe";

export interface TextOverlay {
  id: string;
  start: number;
  duration: number;
  text: string;
  row: number;
  animation?: TextAnimationPreset;
  /** Intro animation length in frames (sequence-local). */
  animInFrames?: number;
  /** Visual size in `rem` (preview 1920×1080). */
  fontSizeRem?: number;
  /** CSS color (hex or name). */
  color?: string;
  /** For pan / wipe. */
  animDirection?: "left" | "right" | "up" | "down";
  fontWeight?: "normal" | "bold" | "light";
}

/** @deprecated Use TimelineAudio for the editor timeline */
export interface Sound {
  id: string;
  start: number;
  duration: number;
  content: string;
  row: number;
  file: string;
}

/** Audio layer on the master timeline (Remotion `<Audio />`). */
export interface TimelineAudio {
  id: string;
  start: number;
  duration: number;
  src: string;
  label: string;
  row: number;
  /** Frames skipped at the start of the source (Remotion `startFrom`). */
  trimStart?: number;
}

export interface PexelsMedia {
  id: number;
  width: number;
  height: number;
  url: string;
  image?: string;
  duration?: number;
  video_files?: { link: string; quality: string }[];
}

export interface Effect {
  id: string;
  type: string;
  start: number;
  duration: number;
  row: number;
}