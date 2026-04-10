export interface TimelineClipV2 {
  id: string;
  label: string;
  src: string;
  timelineStartSec: number;
  timelineDurationSec: number;
  sourceOffsetSec: number;
}

export interface TimelineV2Project {
  id: string;
  name: string;
  updatedAt: string;
  fps: number;
  clips: TimelineClipV2[];
}

export type TransportModeV2 = "stopped" | "playing" | "paused";

export interface TransportStateV2 {
  mode: TransportModeV2;
  playheadSec: number;
  projectDurationSec: number;
  loopEnabled: boolean;
  replayCount: number;
}

export interface SelectionStateV2 {
  selectedClipId: string | null;
}

export interface EditorV2Clip {
  id: string;
  label: string;
  src?: string;
  startFrame: number;
  durationFrames: number;
  trimInFrames: number;
  trimOutFrames: number;
}

export interface EditorV2TrackLane {
  id: string;
  label: string;
  clips: EditorV2Clip[];
}

export interface EditorV2Project {
  id: string;
  fps: number;
  totalFrames: number;
  tracks: EditorV2TrackLane[];
}

export type EditorV2TrackKind = "video" | "audio" | "text" | "overlay";

export type EditorV2MediaKind = "video" | "image" | "audio";

export type EditorV2TransportMode = "stopped" | "playing" | "paused" | "seeking";

export interface EditorV2TimelineRange {
  startFrame: number;
  durationFrames: number;
}

export interface EditorV2ClipTransform {
  posX?: number;
  posY?: number;
  scale?: number;
  rotationDeg?: number;
}

export interface EditorV2TimelineItemBase extends EditorV2TimelineRange {
  id: string;
  trackId: string;
  label?: string;
  trimStartFrames?: number;
}

export interface EditorV2VideoItem extends EditorV2TimelineItemBase {
  kind: "video" | "image";
  src: string;
  transform?: EditorV2ClipTransform;
}

export interface EditorV2AudioItem extends EditorV2TimelineItemBase {
  kind: "audio";
  src: string;
  volume?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
}

export interface EditorV2TextItem extends EditorV2TimelineItemBase {
  kind: "text";
  text: string;
  color?: string;
  fontSizeRem?: number;
  fontWeight?: "normal" | "bold" | "light";
  transform?: EditorV2ClipTransform;
}

export type EditorV2TimelineItem =
  | EditorV2VideoItem
  | EditorV2AudioItem
  | EditorV2TextItem;

export interface EditorV2Track {
  id: string;
  kind: EditorV2TrackKind;
  name: string;
  order: number;
  locked?: boolean;
  muted?: boolean;
}

export interface EditorV2SelectionState {
  selectedItemIds: string[];
  selectedTrackId: string | null;
}

export interface EditorV2PlayheadState {
  frame: number;
  fps: number;
}

export interface EditorV2TimelineViewportState {
  zoom: number;
  scrollX: number;
  scrollY: number;
}

export interface EditorV2TransportState {
  mode: EditorV2TransportMode;
  playheadFrame: number;
  playRangeEndFrame: number;
  replayCount: number;
  loopEnabled: boolean;
  lastStartedAtMs: number | null;
  lastSeekAtMs: number | null;
}

export interface EditorV2ProjectState {
  id: string;
  fps: number;
  totalFrames: number;
  tracks: EditorV2Track[];
  items: EditorV2TimelineItem[];
  selection: EditorV2SelectionState;
  playhead: EditorV2PlayheadState;
  viewport: EditorV2TimelineViewportState;
  transport: EditorV2TransportState;
}

export interface EditorV2TransportAction {
  type: "play" | "pause" | "stop" | "seek" | "toggleLoop";
  frame?: number;
  atMs: number;
}
