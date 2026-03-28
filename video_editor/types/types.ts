/** Clip in/out transitions (sequence-local). */
export type LayerTransitionPreset =
  | "none"
  | "fade"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "slideDown"
  | "zoomIn";

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
  /** Horizontal anchor % (0–100), default 50. */
  posX?: number;
  /** Vertical anchor % (0–100), default 50. */
  posY?: number;
  /** Uniform scale around anchor, default 1. */
  scale?: number;
  transitionIn?: LayerTransitionPreset;
  transitionOut?: LayerTransitionPreset;
  /** Frames used for in and out transitions (each side), default 15. */
  transitionFrames?: number;
  /** `video` (default) = Remotion `Video`; `image` = `Img` (photos, GIF URL). */
  mediaType?: "video" | "image";
  /** Stacks above base clips (Giphy / stock photos), like AI overlays. */
  overlayClip?: boolean;
  overlayOrder?: number;
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
  /** Position % from left, default 50. */
  posX?: number;
  /** Position % from top, default 50. */
  posY?: number;
  /** Text box width % of frame, default 92. */
  widthPct?: number;
  /** Whiteboard-style fill behind text (Tools panel). */
  shapeBackground?: "none" | "rect" | "circle" | "pill";
  shapeFill?: string;
  shapeStroke?: string;
  shapeStrokeWidthPx?: number;
  /** Inner padding around text inside the shape (rem). */
  shapePaddingRem?: number;
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
  /** Linear gain 0–1, default 1. */
  volume?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
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