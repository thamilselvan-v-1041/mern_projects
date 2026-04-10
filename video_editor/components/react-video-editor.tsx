/**
 * Open Source Video Editor Component
 *
 * This is an open source version of the commercial product found at
 * https://www.reactvideoeditor.com/. The code is intentionally kept in a single
 * component for demonstration purposes and clarity. However, this is not considered
 * best practice for production applications.
 *
 * For production use, it's recommended to:
 * - Split into smaller, focused components
 * - Create custom hooks for state management
 * - Implement proper error boundaries
 *
 * The animation templates used are from:
 * https://www.reactvideoeditor.com/remotion-templates
 */

"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  useLayoutEffect,
} from "react";
import { Player, PlayerRef } from "@remotion/player";
import { AbsoluteFill, Sequence, prefetch } from "remotion";
import {
  Clapperboard,
  Clipboard,
  Copy,
  Link2,
  Mic2,
  MoreVertical,
  Minimize2,
  Maximize2,
  Pause,
  Play,
  Scissors,
  Shapes,
  Trash2,
} from "lucide-react";
import {
  EditorWorkspaceSidebar,
  type WorkspaceNavPanel,
} from "./editor-workspace-sidebar";
import { VideosLibraryPanel } from "./videos-library-panel";
import { AudiosLibraryPanel } from "./audios-library-panel";
import { MediaExplorerModal } from "./media-explorer-modal";
import { FilesUploadPage } from "./files-upload-page";
import { ToolsWorkspacePanel } from "./tools-workspace-panel";
import { TextWorkspacePanel } from "./text-workspace-panel";
import { TextOverlayLayer } from "./text-overlay-layer";
import { textOverlayDefaults } from "./text-animation-presets";
import { ClipSequenceContent } from "./clip-sequence-content";
import { AudioWithFades } from "./audio-with-fades";
import { PreviewInteractionLayer } from "./preview-interaction-layer";
import { getStoredProjectById, upsertStoredProject } from "@/lib/video-project-storage";
import { normalizeAudioTracksForComposition } from "@/lib/timeline-audio-layers";
import {
  cancelCoalescedScrubSeek,
  scheduleCoalescedScrubSeek,
} from "@/lib/timeline-scrub-seek";

import { Clip, TextOverlay, TimelineAudio, type TextAnimationPreset } from "@/types/types";

/** Pixels per frame — timeline scroll width scales with project length (KineMaster-style ruler). */
const PX_PER_FRAME = 0.75;
/** Remotion Player: fixed for life of the mounted Player (see autoplay / shared-audio docs). */
const PREVIEW_NUMBER_OF_SHARED_AUDIO_TAGS = 12;

/** Left inset so playhead at 0s (centered with `w-3 -translate-x-1/2`) is not clipped. */
const TIMELINE_PAD_LEFT = 10;

/** Horizontal position for playhead / hover line (centered with `w-3 -translate-x-1/2`). */
function timelinePlayheadLeftPx(frame: number, pxPerFrame: number): number {
  return TIMELINE_PAD_LEFT + Math.max(0, Math.round(frame * pxPerFrame));
}

function timelinePointerToFrame(
  clientX: number,
  scrollViewportLeft: number,
  scrollLeft: number,
  pxPerFrame: number,
  maxFrame: number
): number {
  const x = clientX - scrollViewportLeft + scrollLeft - TIMELINE_PAD_LEFT;
  return Math.max(0, Math.min(maxFrame, Math.round(x / pxPerFrame)));
}
/** Video/audio/text lane height (~33% shorter than original 48px). */
const TRACK_ROW_H = Math.round(48 * (1 - 0.33));
const RULER_H = Math.round(36 * (1 - 0.33));
const VIDEO_TRACK_ROW = 0;
/** Middle lane — mixed uploads + Suno (Remotion `<Audio />`). */
const AUDIO_TRACK_ROW = 1;
/** Plain text overlays lane. */
const TEXT_TRACK_ROW = 2;
/** Shape text overlays lane. */
const SHAPE_TRACK_ROW = 3;
const ENABLE_AUDIO_PLAYBACK_IN_LEGACY_EDITOR = true;
const TIMELINE_GAP_PX = 2;
const FPS = 30;
const DEFAULT_UPLOAD_AUDIO_FRAMES = 30 * 15;
const DEFAULT_INSERT_VIDEO_FRAMES = 200;
const DEFAULT_AI_VIDEO_FRAMES = 90;
const DEFAULT_EXPLORER_VIDEO_FRAMES = 90;
const RESIZE_HANDLE_W = 6;
const MAX_STRETCH_FRAMES = 30 * 120;
const TRACK_ITEM_MAX_H = 18;
const AUDIO_ITEM_H = 25;
const MEDIA_ITEM_H = 25;
const ELEMENTS_ITEM_H = 25;
const TRACK_ITEM_RADIUS = 5;

const MAX_UNDO = 80;

/** Timeline bar: `name, author` when both exist; values are per-layer id (stable if a neighbor is deleted). */
function clipBarDisplayTitle(
  name: string | undefined,
  author: string | undefined,
  fallback: string
): string {
  const n = (name ?? "").trim();
  const a = (author ?? "").trim();
  if (n && a) return `${n}, ${a}`;
  if (n) return n;
  if (a) return a;
  return fallback;
}

function stableBarFallback(id: string, kind: string): string {
  const tail = id.length <= 14 ? id : id.slice(-10);
  return `${kind} · ${tail}`;
}

function formatClockFromFrames(frame: number, fps: number): string {
  // Use floor so the clock never runs ahead of actual playback.
  const totalSec = Math.max(0, Math.floor(frame / Math.max(1, fps)));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function formatSecondsFromFrames(frame: number, fps: number): string {
  const sec = Math.max(0, frame / Math.max(1, fps));
  return `${Math.floor(sec)}s`;
}

function secondsToFrames(seconds: number, fallbackFrames: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return fallbackFrames;
  // Use floor to avoid adding a fractional tail frame that can look like a tiny replay.
  return Math.max(1, Math.floor(seconds * FPS));
}

type TimelineSnapshot = {
  clips: Clip[];
  textOverlays: TextOverlay[];
  audioTracks: TimelineAudio[];
};

type ClipboardEntry =
  | { kind: "clip"; data: Clip }
  | { kind: "text"; data: TextOverlay }
  | { kind: "audio"; data: TimelineAudio };

type PreviewMode = "live" | "cached";

type CachedPreviewChunk = {
  startFrame: number;
  endFrame: number;
  status: "pending" | "ready" | "stale" | "failed";
  outputUrl?: string;
  outputPath?: string;
};

type CachedPreviewManifest = {
  fps?: number;
  chunks?: CachedPreviewChunk[];
};

type ActiveCachedChunk = {
  chunkIndex: number;
  startFrame: number;
  endFrame: number;
  src: string;
};

type UploadedFileItem = {
  id: string;
  label: string;
  author: string;
  src: string;
  durationSec: number;
  mediaType?: "video" | "image";
};

function isPlayableCachedSrc(src: string): boolean {
  const value = src.trim().toLowerCase();
  if (!value) return false;
  // Stale blob URLs from prior sessions cannot be resolved reliably.
  if (value.startsWith("blob:")) return false;
  if (value.endsWith(".json")) return false;
  return true;
}

function getPrimaryClipAtFrame(clips: Clip[], frame: number): Clip | null {
  const active = clips.filter(
    (clip) => clip.start <= frame && frame < clip.start + clip.duration
  );
  if (active.length === 0) return null;
  active.sort((a, b) => {
    if (a.start !== b.start) return b.start - a.start;
    return a.id.localeCompare(b.id);
  });
  return active[0];
}

function deepCloneSnapshot(s: TimelineSnapshot): TimelineSnapshot {
  if (typeof structuredClone === "function") {
    return structuredClone(s);
  }
  return JSON.parse(JSON.stringify(s)) as TimelineSnapshot;
}

function deepCloneLayer<T extends Clip | TextOverlay | TimelineAudio>(x: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(x);
  }
  return JSON.parse(JSON.stringify(x)) as T;
}

function normalizeNonOverlappingMediaLane(clips: Clip[]): Clip[] {
  const media = clips
    .map((c) => ({ ...c, row: VIDEO_TRACK_ROW }))
    .map((c) => ({ ...c }))
    .sort((a, b) => (a.start !== b.start ? a.start - b.start : a.id.localeCompare(b.id)));

  let cursor = 0;
  for (let i = 0; i < media.length; i += 1) {
    const item = media[i];
    const clampedDuration = Math.max(1, item.duration);
    // Keep media clips packed in a single continuous lane.
    item.start = cursor;
    cursor += clampedDuration;
  }

  return media.sort((a, b) => a.start - b.start);
}

function mediaTimingChanged(a: Clip[], b: Clip[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) return true;
    if (a[i].start !== b[i].start) return true;
    if (a[i].duration !== b[i].duration) return true;
    if (a[i].row !== b[i].row) return true;
  }
  return false;
}

function audioTimingChanged(a: TimelineAudio[], b: TimelineAudio[]): boolean {
  const num = (v: unknown, fallback = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) return true;
    if (num(a[i].start) !== num(b[i].start)) return true;
    if (num(a[i].duration, 1) !== num(b[i].duration, 1)) return true;
    if (num(a[i].row, AUDIO_TRACK_ROW) !== num(b[i].row, AUDIO_TRACK_ROW))
      return true;
    if (a[i].src !== b[i].src) return true;
    if (a[i].label !== b[i].label) return true;
    if ((a[i].sourceAuthor || "") !== (b[i].sourceAuthor || "")) return true;
    if (num(a[i].trimStart ?? 0) !== num(b[i].trimStart ?? 0)) return true;
  }
  return false;
}

function audioTracksSignature(items: TimelineAudio[]): string {
  const num = (v: unknown, fallback = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return items
    .map((a) =>
      [
        a.id,
        num(a.start),
        num(a.duration, 1),
        num(a.row, AUDIO_TRACK_ROW),
        a.src || "",
        a.label || "",
        a.sourceAuthor || "",
        num(a.trimStart ?? 0),
      ].join("|")
    )
    .join(";");
}

type TrackContextMenuState = {
  kind: "clip" | "audio" | "text";
  id: string;
  x: number;
  y: number;
};

type ResizeDragState = {
  kind: "clip" | "audio" | "text";
  id: string;
  edge: "left" | "right";
  startClientX: number;
  initialStart: number;
  initialDuration: number;
  initialTrim: number;
};

type RowStackSlot = { lane: number; lanes: number };

function overlapsByTime(
  a: { start: number; duration: number },
  b: { start: number; duration: number }
) {
  return a.start < b.start + b.duration && b.start < a.start + a.duration;
}

function computeRowStackLayout<T extends { id: string; start: number; duration: number }>(
  items: T[]
): Map<string, RowStackSlot> {
  const map = new Map<string, RowStackSlot>();
  const n = items.length;
  if (n === 0) return map;

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (overlapsByTime(items[i], items[j])) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = groups.get(r) ?? [];
    arr.push(i);
    groups.set(r, arr);
  }

  Array.from(groups.values()).forEach((indices) => {
    const sorted = [...indices].sort((ia, ib) => {
      const a = items[ia];
      const b = items[ib];
      if (a.start !== b.start) return a.start - b.start;
      return a.id.localeCompare(b.id);
    });
    const lanes = sorted.length;
    sorted.forEach((idx, lane) => {
      map.set(items[idx].id, { lane, lanes });
    });
  });

  return map;
}

function maxLanesInStack(stack: Map<string, RowStackSlot>): number {
  let max = 1;
  stack.forEach((slot) => {
    max = Math.max(max, slot.lanes);
  });
  return max;
}

/**
 * @fileoverview React Video Editor Component
 * A video editing interface built with React and Remotion.
 * Allows users to:
 * - Add and arrange video clips on a timeline
 * - Add text overlays with animations
 * - Preview the composition in real-time
 * - Supports desktop viewing only
 *
 * @requires @remotion/player - For video playback and composition
 * @requires remotion - For sequences and video manipulation
 */

/**
 * Interface for managing timeline items
 * @typedef {Object} TimelineItem
 * @property {string} id - Unique identifier
 * @property {number} start - Start frame
 * @property {number} duration - Duration in frames
 * @property {number} row - Vertical position in timeline
 */

/**
 * TimelineMarker Component
 * @component
 * @param {Object} props
 * @param {number} props.currentFrame - Current playback position in frames
 * @param {number} props.totalDuration - Total duration of composition in frames
 * @returns {JSX.Element} A visual marker showing current playback position
 */
const TimelineMarker: React.FC<{
  currentFrame: number;
  pxPerFrame: number;
  heightPx: number;
  maxFrame: number;
  onBeginScrub: (clientX: number) => void;
}> = React.memo(
  ({ currentFrame, pxPerFrame, heightPx, maxFrame, onBeginScrub }) => {
    const leftPx = timelinePlayheadLeftPx(currentFrame, pxPerFrame);

    return (
      <div
        className="absolute top-0 z-[55] w-3 -translate-x-1/2 cursor-ew-resize touch-none select-none"
        style={{ left: leftPx, height: heightPx, willChange: "left" }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          onBeginScrub(e.clientX);
        }}
        role="slider"
        aria-label="Timeline playhead"
        aria-valuenow={currentFrame}
        aria-valuemin={0}
        aria-valuemax={maxFrame}
      >
        <div
          className="pointer-events-none absolute bottom-0 left-1/2 w-[1.5px] -translate-x-1/2 rounded-full bg-black/55"
          style={{ top: Math.max(0, RULER_H - 4) }}
        />
        <div className="pointer-events-none absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[9px] border-l-transparent border-r-transparent border-t-black/55" />
      </div>
    );
  },
);

TimelineMarker.displayName = "TimelineMarker";

/**
 * Main Video Editor Component
 * @component
 * @returns {JSX.Element} Complete video editor interface
 *
 * Features:
 * - Video preview player
 * - Timeline with clips and text overlays
 * - Add clip and text overlay buttons
 * - Mobile detection and warning
 * - Real-time playback marker
 *
 * State Management:
 * - clips: Array of video clips
 * - textOverlays: Array of text overlays
 * - totalDuration: Total composition duration
 * - currentFrame: Current playback position
 * - isMobile: Mobile device detection
 */
const ReactVideoEditor: React.FC<{ projectId: string }> = ({ projectId }) => {
  // State management
  const [timeline, setTimeline] = useState<TimelineSnapshot>({
    clips: [],
    textOverlays: [],
    audioTracks: [],
  });
  const { clips, textOverlays, audioTracks } = timeline;
  const setClips = useCallback((updater: React.SetStateAction<Clip[]>) => {
    setTimeline((prev) => {
      const nextRaw = typeof updater === "function" ? updater(prev.clips) : updater;
      const nextClips = normalizeNonOverlappingMediaLane(nextRaw);
      if (!mediaTimingChanged(prev.clips, nextClips)) return prev;
      return {
        ...prev,
        clips: nextClips,
      };
    });
  }, []);
  const setTextOverlays = useCallback(
    (updater: React.SetStateAction<TextOverlay[]>) => {
      setTimeline((prev) => {
        const nextTextOverlays =
          typeof updater === "function" ? updater(prev.textOverlays) : updater;
        if (nextTextOverlays === prev.textOverlays) return prev;
        return {
          ...prev,
          textOverlays: nextTextOverlays,
        };
      });
    },
    []
  );
  const setAudioTracks = useCallback(
    (updater: React.SetStateAction<TimelineAudio[]>) => {
      setTimeline((prev) => {
        const nextAudioTracks =
          typeof updater === "function" ? updater(prev.audioTracks) : updater;
        if (audioTracksSignature(prev.audioTracks) === audioTracksSignature(nextAudioTracks)) {
          return prev;
        }
        if (!audioTimingChanged(prev.audioTracks, nextAudioTracks)) return prev;
        return {
          ...prev,
          audioTracks: nextAudioTracks,
        };
      });
    },
    []
  );
  const [totalDuration, setTotalDuration] = useState(1);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playbackFrame, setPlaybackFrame] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [navPanel, setNavPanel] = useState<WorkspaceNavPanel>("videos");
  const [isSamplesPanelVisible, setIsSamplesPanelVisible] = useState(true);
  const [projectName, setProjectName] = useState("Untitled video");
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<{
    kind: "clip" | "text" | "audio";
    id: string;
  } | null>(null);
  const [dragging, setDragging] = useState<{
    kind: "clip" | "text" | "audio";
    id: string;
    startClientX: number;
    initialStart: number;
    initialScrollLeft: number;
  } | null>(null);
  const [resizeDragging, setResizeDragging] = useState<ResizeDragState | null>(
    null
  );
  const [dragEdgeIndicator, setDragEdgeIndicator] = useState<
    "left" | "right" | null
  >(null);
  const [trackContextMenu, setTrackContextMenu] =
    useState<TrackContextMenuState | null>(null);

  // Refs
  const playerRef = useRef<PlayerRef>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const playheadScrubbingRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);
  /** See `lib/timeline-scrub-seek.ts` — one Remotion player drives video + timeline `<Audio />`. */
  const scrubSeekRafIdRef = useRef(0);
  const videoUploadInputRef = useRef<HTMLInputElement>(null);
  const audioUploadInputRef = useRef<HTMLInputElement>(null);
  const trackMenuRef = useRef<HTMLDivElement | null>(null);
  /** Monotonic stack for AI clips so newer AI layers draw above older when overlapping. */
  const aiClipStackRef = useRef(0);
  const mediaOverlayStackRef = useRef(0);
  const lastVideoInsertRef = useRef<{
    src: string;
    start: number;
    duration: number;
    ts: number;
  } | null>(null);
  const lastAudioInsertRef = useRef<{
    src: string;
    start: number;
    duration: number;
    ts: number;
  } | null>(null);

  const undoStackRef = useRef<TimelineSnapshot[]>([]);
  const redoStackRef = useRef<TimelineSnapshot[]>([]);
  const clipboardRef = useRef<ClipboardEntry | null>(null);
  const editorStateRef = useRef<TimelineSnapshot>({
    clips: [],
    textOverlays: [],
    audioTracks: [],
  });
  const currentFrameRef = useRef(0);
  const playActionFrameRef = useRef(0);
  const lastPlayheadUiSyncMsRef = useRef(0);
  const previewPlayToggleInFlightRef = useRef(false);
  const timelineAudioPrefetchReadyRef = useRef<Promise<void> | null>(null);
  const timelineAudioPrefetchHandlesRef = useRef(
    new Map<string, { free: () => void; waitUntilDone: () => Promise<string> }>()
  );
  const preservePlayheadOnNextSelectionRef = useRef(false);
  const pendingInsertedPlayheadRef = useRef<{
    targetFrame: number;
    barStartFrame: number;
    barEndFrame: number;
  } | null>(null);
  const selectedRef = useRef<{
    kind: "clip" | "text" | "audio";
    id: string;
  } | null>(null);
  const keyActionsRef = useRef<{
    pushUndo: () => void;
    undo: () => void;
    redo: () => void;
    copySelected: () => void;
    pasteAtPlayhead: () => void;
    deleteSelected: () => void;
    saveProject: () => void;
  } | null>(null);

  /** Avoid mounting Remotion Player before the preview box has real size (prevents NaN width in Player internals). */
  const [previewPlayerReady, setPreviewPlayerReady] = useState(false);
  const [previewIsPlaying, setPreviewIsPlaying] = useState(false);
  const [hoverFrame, setHoverFrame] = useState<number | null>(null);
  const [preferLivePreview, setPreferLivePreview] = useState(true);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("live");
  const [previewManifest, setPreviewManifest] = useState<CachedPreviewManifest | null>(null);
  const [activeCachedChunk, setActiveCachedChunk] = useState<ActiveCachedChunk | null>(null);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const [playbackPaneHeight, setPlaybackPaneHeight] = useState(420);
  const [isPlaybackResizing, setIsPlaybackResizing] = useState(false);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [uploadedMediaItems, setUploadedMediaItems] = useState<UploadedFileItem[]>([]);
  const [uploadedAudioItems, setUploadedAudioItems] = useState<UploadedFileItem[]>([]);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const [minTimelinePaneHeight, setMinTimelinePaneHeight] = useState(260);
  const [clipDragInsertFrame, setClipDragInsertFrame] = useState<number | null>(null);
  const cachedVideoRef = useRef<HTMLVideoElement>(null);
  const previewTimelineContainerRef = useRef<HTMLDivElement>(null);
  const playbackResizeStartRef = useRef<{ y: number; h: number } | null>(null);
  const totalDurationRef = useRef(1);
  const suppressCachedPauseSyncRef = useRef(false);
  const cachedRepeatRef = useRef<{
    src: string;
    startFrame: number;
    repeatCount: number;
  } | null>(null);
  const clipRepeatRef = useRef<{
    clipId: string;
    repeatCount: number;
    lastFrame: number;
  } | null>(null);
  const resumeAfterClipResizeRef = useRef(false);
  const hoverFrameRef = useRef<number | null>(null);
  const preloadedNextChunkRef = useRef<ActiveCachedChunk | null>(null);
  const clipDragSnapshotRef = useRef<Clip[] | null>(null);
  const topMenuRef = useRef<HTMLDivElement | null>(null);
  const playbackPaneUserResizedRef = useRef(false);

  useEffect(() => {
    if (!isPlaybackResizing) return;
    const onMove = (e: PointerEvent) => {
      const start = playbackResizeStartRef.current;
      const container = previewTimelineContainerRef.current;
      if (!start || !container) return;
      const delta = e.clientY - start.y;
      const containerH = container.clientHeight;
      const minPlayback = 240;
      const minTimeline = minTimelinePaneHeight;
      const maxPlayback = Math.max(minPlayback, containerH - minTimeline);
      const next = Math.max(minPlayback, Math.min(maxPlayback, start.h + delta));
      setPlaybackPaneHeight(Math.round(next));
    };
    const onUp = () => {
      setIsPlaybackResizing(false);
      playbackResizeStartRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [isPlaybackResizing, minTimelinePaneHeight]);

  useEffect(() => {
    const updateMinimumTimelineHeight = () => {
      const next = Math.max(220, Math.min(420, Math.round(window.innerHeight * 0.3)));
      setMinTimelinePaneHeight((prev) => (prev === next ? prev : next));
    };
    updateMinimumTimelineHeight();
    window.addEventListener("resize", updateMinimumTimelineHeight);
    return () => window.removeEventListener("resize", updateMinimumTimelineHeight);
  }, []);

  useEffect(() => {
    const container = previewTimelineContainerRef.current;
    if (!container) return;
    const maxPlayback = Math.max(240, container.clientHeight - minTimelinePaneHeight);
    if (isPreviewFullscreen || !playbackPaneUserResizedRef.current) {
      setPlaybackPaneHeight(maxPlayback);
      return;
    }
    setPlaybackPaneHeight((prev) => (prev > maxPlayback ? maxPlayback : prev));
  }, [minTimelinePaneHeight, isPreviewFullscreen]);

  useLayoutEffect(() => {
    const sc = timelineScrollRef.current;
    if (!sc || typeof ResizeObserver === "undefined") return;
    const sync = () => {
      setTimelineViewportWidth((prev) => {
        const next = Math.max(0, sc.clientWidth);
        return prev === next ? prev : next;
      });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(sc);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [isPreviewFullscreen, isSamplesPanelVisible]);

  const activeFrame = previewIsPlaying ? playbackFrame : currentFrame;
  editorStateRef.current = { clips, textOverlays, audioTracks };
  currentFrameRef.current = activeFrame;
  totalDurationRef.current = Math.max(1, Math.floor(totalDuration));
  selectedRef.current = selected;
  hoverFrameRef.current = hoverFrame;

  const clampFrameToTimeline = useCallback((frame: number) => {
    const maxFrame = Math.max(0, Math.floor(totalDurationRef.current) - 1);
    return Math.max(0, Math.min(maxFrame, Math.floor(frame)));
  }, []);

  const safeSeekPlayer = useCallback(
    (player: PlayerRef | null, frame: number) => {
      if (!player) return 0;
      const next = clampFrameToTimeline(frame);
      player.seekTo(next);
      return next;
    },
    [clampFrameToTimeline]
  );

  const selectWithoutMovingPlayhead = useCallback(
    (next: { kind: "clip" | "text" | "audio"; id: string }) => {
      preservePlayheadOnNextSelectionRef.current = true;
      setSelected(next);
    },
    []
  );

  const selectAndMovePlayheadToEnd = useCallback(
    (
      next: { kind: "clip" | "text" | "audio"; id: string },
      endFrame: number,
      startFrame?: number
    ) => {
      const target = Math.max(0, Math.floor(endFrame));
      const barStart = Math.max(0, Math.floor(startFrame ?? endFrame));
      const barEnd = Math.max(barStart, Math.floor(endFrame));
      preservePlayheadOnNextSelectionRef.current = true;
      setSelected(next);
      pendingInsertedPlayheadRef.current = {
        targetFrame: target,
        barStartFrame: barStart,
        barEndFrame: barEnd,
      };
    },
    []
  );

  useEffect(() => {
    const pending = pendingInsertedPlayheadRef.current;
    if (pending == null) return;
    // Wait until timeline duration includes the new clip end; otherwise seek gets clamped.
    if (Math.floor(totalDuration) < pending.barEndFrame) return;
    pendingInsertedPlayheadRef.current = null;
    const target = Math.max(0, Math.floor(pending.targetFrame));
    const barStartX =
      TIMELINE_PAD_LEFT + pending.barStartFrame * PX_PER_FRAME;
    const barEndX = TIMELINE_PAD_LEFT + pending.barEndFrame * PX_PER_FRAME;
    const player = playerRef.current;
    if (player) {
      player.pause();
      safeSeekPlayer(player, target);
    }
    playActionFrameRef.current = target;
    setCurrentFrame(target);
    setPlaybackFrame(target);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const sc = timelineScrollRef.current;
        if (!sc) return;
        const padding = 24;
        const viewStart = sc.scrollLeft + padding;
        const viewEnd = sc.scrollLeft + sc.clientWidth - padding;
        const barPartiallyVisible = barEndX >= viewStart && barStartX <= viewEnd;
        if (barPartiallyVisible) return;
        const desired = barEndX - sc.clientWidth * 0.8;
        const maxScroll = Math.max(0, sc.scrollWidth - sc.clientWidth);
        sc.scrollLeft = Math.max(0, Math.min(maxScroll, desired));
      });
    });
  }, [clips, textOverlays, audioTracks, totalDuration, safeSeekPlayer]);

  useLayoutEffect(() => {
    const el = previewWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const evaluate = () => {
      const r = el.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      const ok =
        Number.isFinite(w) && Number.isFinite(h) && w >= 2 && h >= 2;
      setPreviewPlayerReady(ok);
    };

    evaluate();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(evaluate);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [navPanel, projectId]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || !previewPlayerReady || previewMode !== "live") return;
    const onPlay = () => setPreviewIsPlaying(true);
    const onPause = () => {
      setPreviewIsPlaying(false);
      const pausedFrame = clampFrameToTimeline(p.getCurrentFrame());
      playActionFrameRef.current = pausedFrame;
      setCurrentFrame((prev) => (prev === pausedFrame ? prev : pausedFrame));
      setPlaybackFrame((prev) => (prev === pausedFrame ? prev : pausedFrame));
    };
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    setPreviewIsPlaying(p.isPlaying());
    return () => {
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
    };
  }, [previewMode, previewPlayerReady, totalDuration, clampFrameToTimeline]);

  const parseCachedManifest = useCallback(
    (payload: unknown): CachedPreviewManifest | null => {
      if (!payload || typeof payload !== "object") return null;
      const maybeWrapped = payload as { manifest?: unknown };
      const raw = (
        maybeWrapped && typeof maybeWrapped === "object" && maybeWrapped.manifest
          ? maybeWrapped.manifest
          : payload
      ) as CachedPreviewManifest;
      const chunks = Array.isArray(raw.chunks) ? raw.chunks : [];
      if (chunks.length === 0) return null;
      return {
        fps: typeof raw.fps === "number" ? raw.fps : FPS,
        chunks: chunks
          .filter((c) => c && typeof c === "object")
          .map((c) => ({
            startFrame: Number(c.startFrame ?? 0),
            endFrame: Number(c.endFrame ?? 0),
            status: c.status ?? "pending",
            outputUrl: c.outputUrl,
            outputPath: c.outputPath,
          }))
          .filter(
            (c) =>
              Number.isFinite(c.startFrame) &&
              Number.isFinite(c.endFrame) &&
              c.endFrame > c.startFrame
          )
          .sort((a, b) => a.startFrame - b.startFrame),
      };
    },
    []
  );

  const fetchPreviewManifest = useCallback(async (): Promise<CachedPreviewManifest | null> => {
    try {
      const query = new URLSearchParams({
        projectId,
        fps: String(FPS),
        durationInFrames: String(Math.max(1, totalDuration)),
      });
      const res = await fetch(`/api/preview/manifest?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) return null;
      const json = (await res.json()) as unknown;
      return parseCachedManifest(json);
    } catch {
      return null;
    }
  }, [parseCachedManifest, projectId, totalDuration]);

  const switchToLivePlayback = useCallback(
    (frame: number, reason?: string, autoPlay = false) => {
      const next = Math.max(0, Math.min(Math.max(1, totalDuration) - 1, Math.floor(frame)));
      playActionFrameRef.current = next;
      const video = cachedVideoRef.current;
      if (video) {
        suppressCachedPauseSyncRef.current = true;
        video.pause();
        // Fully unload cached media element to prevent hidden overlapping audio
        // when switching back to live Remotion playback.
        video.currentTime = 0;
        video.removeAttribute("src");
        video.load();
      }
      setPreviewMode("live");
      setActiveCachedChunk(null);
      setPreviewIsPlaying(false);
      if (reason) {
        setPreviewNotice(reason);
      }
      setCurrentFrame(next);
      setPlaybackFrame(next);
      const player = playerRef.current;
      if (player) {
        safeSeekPlayer(player, next);
        if (autoPlay) {
          void player.play();
        }
      }
      suppressCachedPauseSyncRef.current = false;
    },
    [totalDuration]
  );

  const activateCachedChunkAtFrame = useCallback(
    async (manifest: CachedPreviewManifest, frame: number): Promise<boolean> => {
      const chunks = manifest.chunks ?? [];
      const idx = chunks.findIndex(
        (chunk) =>
          chunk.startFrame <= frame &&
          frame < chunk.endFrame &&
          chunk.status === "ready" &&
          Boolean(chunk.outputUrl || chunk.outputPath)
      );
      if (idx < 0) return false;
      const chunk = chunks[idx];
      const src = chunk.outputUrl ?? chunk.outputPath;
      if (!src || !isPlayableCachedSrc(src)) return false;
      const prev = cachedRepeatRef.current;
      if (prev && prev.src === src && prev.startFrame === chunk.startFrame) {
        const repeatCount = prev.repeatCount + 1;
        cachedRepeatRef.current = {
          src,
          startFrame: chunk.startFrame,
          repeatCount,
        };
        if (repeatCount > 1 && audioTracks.length === 0) {
          setPreviewNotice(
            `Repeat play detected for this clip (${repeatCount}x).`
          );
        }
      } else {
        cachedRepeatRef.current = {
          src,
          startFrame: chunk.startFrame,
          repeatCount: 1,
        };
      }
      setPreviewMode("cached");
      setPreviewManifest(manifest);
      setActiveCachedChunk({
        chunkIndex: idx,
        startFrame: chunk.startFrame,
        endFrame: chunk.endFrame,
        src,
      });
      setPreviewNotice(null);
      const next = Math.max(chunk.startFrame, Math.floor(frame));
      setCurrentFrame(next);
      setPlaybackFrame(next);
      return true;
    },
    [audioTracks.length]
  );

  const tryStartCachedPreviewPlayback = useCallback(
    async (
      manifestOverride?: CachedPreviewManifest | null,
      frameOverride?: number
    ): Promise<boolean> => {
      const frame = Math.max(
        0,
        Math.floor(
          typeof frameOverride === "number" ? frameOverride : currentFrameRef.current
        )
      );
      const manifest = manifestOverride ?? (await fetchPreviewManifest());
      if (!manifest) return false;
      return activateCachedChunkAtFrame(manifest, frame);
    },
    [activateCachedChunkAtFrame, fetchPreviewManifest]
  );

  const requestPreviewRender = useCallback(async (): Promise<CachedPreviewManifest | null> => {
    try {
      const res = await fetch("/api/preview/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          snapshot: {
            clips,
            textOverlays,
            audioTracks,
          },
          changedRanges: [],
          totalFrames: Math.max(1, totalDuration),
          fps: FPS,
          chunkSizeFrames: Math.max(FPS, FPS * 2),
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as unknown;
      return parseCachedManifest(json);
    } catch {
      return null;
    }
  }, [audioTracks, clips, parseCachedManifest, projectId, textOverlays, totalDuration]);

  const trackWidthPx = useMemo(
    // Keep horizontal scroll close to actual timeline content width.
    () =>
      TIMELINE_PAD_LEFT + Math.max(960, totalDuration * PX_PER_FRAME + 24),
    [totalDuration]
  );
  const effectiveTrackWidthPx = Math.max(trackWidthPx, timelineViewportWidth);

  const { timelineHasContent, rulerTickSpanFrames } = useMemo(() => {
    const hasContent =
      clips.length > 0 ||
      audioTracks.length > 0 ||
      textOverlays.length > 0;
    const visibleTimelinePx = effectiveTrackWidthPx;
    const visibleSpanFrames = Math.max(
      FPS,
      Math.ceil(Math.max(0, visibleTimelinePx - TIMELINE_PAD_LEFT - 24) / PX_PER_FRAME)
    );
    const rulerTickSpanFrames = hasContent
      ? Math.max(1, totalDuration, visibleSpanFrames)
      : visibleSpanFrames;
    return { timelineHasContent: hasContent, rulerTickSpanFrames };
  }, [
    clips.length,
    audioTracks.length,
    textOverlays.length,
    totalDuration,
    trackWidthPx,
    timelineViewportWidth,
    effectiveTrackWidthPx,
  ]);

  useEffect(() => {
    const sc = timelineScrollRef.current;
    if (!sc) return;
    const maxScroll = Math.max(0, sc.scrollWidth - sc.clientWidth);
    if (sc.scrollLeft > maxScroll) {
      sc.scrollLeft = maxScroll;
    }
  }, [trackWidthPx, clips, textOverlays, audioTracks]);

  const seekPlayheadFromClientX = useCallback(
    (clientX: number) => {
      const sc = timelineScrollRef.current;
      if (!sc) return;
      const dur = Math.max(1, totalDuration);
      const maxFrame = Math.max(0, dur - 1);
      const rect = sc.getBoundingClientRect();
      const frame = timelinePointerToFrame(
        clientX,
        rect.left,
        sc.scrollLeft,
        PX_PER_FRAME,
        maxFrame
      );
      if (previewMode === "cached") {
        switchToLivePlayback(frame);
      }
      const player = playerRef.current;
      if (player?.isPlaying()) {
        player.pause();
      }
      // User scrub is explicit intent for the next play action anchor.
      playActionFrameRef.current = frame;
      setCurrentFrame(frame);
      setPlaybackFrame(frame);
      setHoverFrame(frame);
      if (playheadScrubbingRef.current) {
        scheduleCoalescedScrubSeek(scrubSeekRafIdRef, () => {
          safeSeekPlayer(playerRef.current, playActionFrameRef.current);
        });
        return;
      }
      safeSeekPlayer(playerRef.current, frame);
    },
    [previewMode, switchToLivePlayback, totalDuration],
  );

  const frameFromClientX = useCallback(
    (clientX: number) => {
      const sc = timelineScrollRef.current;
      if (!sc) return 0;
      const maxFrame = timelineHasContent
        ? Math.max(0, Math.max(1, totalDuration) - 1)
        : Math.max(0, rulerTickSpanFrames - 1);
      const rect = sc.getBoundingClientRect();
      return timelinePointerToFrame(
        clientX,
        rect.left,
        sc.scrollLeft,
        PX_PER_FRAME,
        maxFrame
      );
    },
    [timelineHasContent, totalDuration, rulerTickSpanFrames]
  );

  const beginPlayheadScrub = useCallback(
    (clientX: number) => {
      if (playheadScrubbingRef.current) return;
      if (previewMode === "cached") {
        switchToLivePlayback(currentFrameRef.current);
      }
      const player = playerRef.current;
      wasPlayingBeforeScrubRef.current =
        Boolean(previewPlayerReady && player?.isPlaying());
      if (previewPlayerReady && player) {
        player.pause();
      }
      playheadScrubbingRef.current = true;
      seekPlayheadFromClientX(clientX);

      const onMove = (e: PointerEvent) => {
        seekPlayheadFromClientX(e.clientX);
      };
      const onUp = () => {
        cancelCoalescedScrubSeek(scrubSeekRafIdRef);
        playheadScrubbingRef.current = false;
        safeSeekPlayer(playerRef.current, playActionFrameRef.current);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [previewMode, previewPlayerReady, seekPlayheadFromClientX, switchToLivePlayback],
  );

  const audioStackLayout = useMemo(
    () => computeRowStackLayout(audioTracks),
    [audioTracks]
  );
  const textOnlyStackLayout = useMemo(
    () =>
      computeRowStackLayout(
        textOverlays.filter((t) => (t.shapeBackground ?? "none") === "none")
      ),
    [textOverlays]
  );
  const shapeStackLayout = useMemo(
    () =>
      computeRowStackLayout(
        textOverlays.filter((t) => (t.shapeBackground ?? "none") !== "none")
      ),
    [textOverlays]
  );

  const trackRowMetrics = useMemo(() => {
    const audioStackGap = 6;
    const elementsStackGap = 6;
    const paddingY = 4;
    const expandedHeight = (
      lanes: number,
      laneItemHeight = TRACK_ITEM_MAX_H,
      laneGap = 1
    ) =>
      Math.max(
        TRACK_ROW_H,
        lanes * laneItemHeight + Math.max(0, lanes - 1) * laneGap + paddingY
      );
    const hasTextElements = textOnlyStackLayout.size > 0;
    const hasShapeElements = shapeStackLayout.size > 0;
    const hasAnyElements = hasTextElements || hasShapeElements;
    const videoRowH = TRACK_ROW_H;
    const audioRowH = expandedHeight(
      maxLanesInStack(audioStackLayout),
      AUDIO_ITEM_H,
      audioStackGap
    );
    const textRowH = hasTextElements
      ? expandedHeight(
          maxLanesInStack(textOnlyStackLayout),
          ELEMENTS_ITEM_H,
          elementsStackGap
        )
      : 0;
    const shapeRowH = hasShapeElements
      ? expandedHeight(
          maxLanesInStack(shapeStackLayout),
          ELEMENTS_ITEM_H,
          elementsStackGap
        )
      : 0;
    const elementsBlockH = hasAnyElements ? textRowH + shapeRowH : TRACK_ROW_H;

    const textTop = 0;
    const shapeTop = textTop + textRowH;
    const videoTop = textTop + elementsBlockH;
    const audioTop = videoTop + videoRowH;
    const tracksBodyH = audioTop + audioRowH;

    return {
      videoRowH,
      audioRowH,
      textRowH,
      shapeRowH,
      audioStackGap,
      elementsStackGap,
      videoTop,
      audioTop,
      textTop,
      shapeTop,
      tracksBodyH,
      elementsBlockH,
    };
  }, [audioStackLayout, shapeStackLayout, textOnlyStackLayout]);

  const tracksBodyHeightPx = trackRowMetrics.tracksBodyH;
  const playheadFullHeight = RULER_H + tracksBodyHeightPx;

  const timelineEnd = useCallback(() => {
    const items = [...clips, ...textOverlays, ...audioTracks];
    if (items.length === 0) return { start: 0, duration: 0 };
    return items.reduce((latest, item) =>
      item.start + item.duration > latest.start + latest.duration
        ? item
        : latest
    );
  }, [clips, textOverlays, audioTracks]);

  const syncRefsFromClips = useCallback((loaded: Clip[]) => {
    const ai = loaded.filter((c) => c.fromAI).map((c) => c.aiStackOrder ?? 0);
    const ov = loaded
      .filter((c) => c.overlayClip)
      .map((c) => c.overlayOrder ?? 0);
    aiClipStackRef.current = ai.length ? Math.max(...ai, 0) : 0;
    mediaOverlayStackRef.current = ov.length ? Math.max(...ov, 0) : 0;
  }, []);

  const applySnapshot = useCallback(
    (s: TimelineSnapshot) => {
      setTimeline(s);
      syncRefsFromClips(s.clips);
    },
    [syncRefsFromClips]
  );

  const pushUndo = useCallback(() => {
    const cur = editorStateRef.current;
    undoStackRef.current.push(deepCloneSnapshot(cur));
    if (undoStackRef.current.length > MAX_UNDO) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  }, []);

  const undo = useCallback(() => {
    const past = undoStackRef.current.pop();
    if (!past) return;
    const cur = editorStateRef.current;
    redoStackRef.current.push(deepCloneSnapshot(cur));
    applySnapshot(past);
    setSelected(null);
    setTrackContextMenu(null);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    const future = redoStackRef.current.pop();
    if (!future) return;
    const cur = editorStateRef.current;
    undoStackRef.current.push(deepCloneSnapshot(cur));
    applySnapshot(future);
    setSelected(null);
    setTrackContextMenu(null);
  }, [applySnapshot]);

  const saveCurrentProjectToStorage = useCallback(() => {
    upsertStoredProject({
      id: projectId,
      name: projectName.trim() || "Untitled video",
      updatedAt: new Date().toISOString(),
      clips,
      textOverlays,
      audioTracks,
    });
  }, [projectId, projectName, clips, textOverlays, audioTracks]);

  useEffect(() => {
    if (!autoSaveEnabled) return;
    const timer = window.setTimeout(() => {
      saveCurrentProjectToStorage();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [autoSaveEnabled, saveCurrentProjectToStorage]);

  useEffect(() => {
    const p = getStoredProjectById(projectId);
    if (!p) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setTimeline({
      clips: p.clips,
      textOverlays: p.textOverlays,
      audioTracks: p.audioTracks,
    });
    setProjectName(p.name);
    setCurrentFrame(0);
    setPlaybackFrame(0);
    playActionFrameRef.current = 0;
    setPreviewMode("live");
    setPreviewManifest(null);
    setActiveCachedChunk(null);
    setPreviewNotice(null);
    setPreviewIsPlaying(false);
    setSelected(null);
    syncRefsFromClips(p.clips);
    undoStackRef.current = [];
    redoStackRef.current = [];
    clipboardRef.current = null;
  }, [projectId, syncRefsFromClips]);

  const ensureActiveProject = useCallback(() => {}, []);

  const resolveNonOverlappingStart = useCallback(
    (items: Array<{ start: number; duration: number }>, anchor: number, duration: number) => {
      let start = Math.max(0, Math.floor(anchor));
      const d = Math.max(1, Math.floor(duration));
      const sorted = [...items].sort((a, b) => a.start - b.start);
      for (const item of sorted) {
        const itemStart = item.start;
        const itemEnd = item.start + item.duration;
        const overlaps = start < itemEnd && start + d > itemStart;
        if (overlaps) {
          start = itemEnd;
        }
      }
      return start;
    },
    []
  );

  const realignTrackAfterMove = useCallback(
    <T extends { id: string; start: number; duration: number; row?: number }>(
      items: T[],
      movedId: string,
      targetStart: number
    ): T[] => {
      const moved = items.find((x) => x.id === movedId);
      if (!moved) return items;
      const requestedStart = Math.max(0, targetStart);

      const movedRow = moved.row;
      const laneItems = items
        .filter((x) => (movedRow == null ? true : x.row === movedRow))
        .sort((a, b) => a.start - b.start);
      const withoutMoved = laneItems.filter((x) => x.id !== movedId);
      const movedWithRequestedStart = { ...moved, start: requestedStart } as T;

      // Insert by snapped boundary frame (before first item with start >= boundary).
      let insertAt = withoutMoved.findIndex((item) => requestedStart <= item.start);
      if (insertAt < 0) insertAt = withoutMoved.length;

      const reordered = [
        ...withoutMoved.slice(0, insertAt),
        movedWithRequestedStart,
        ...withoutMoved.slice(insertAt),
      ];

      // Reflow only this lane as a contiguous strip.
      const laneStart = laneItems.length
        ? Math.max(0, Math.min(...laneItems.map((x) => Math.max(0, x.start))))
        : 0;
      let cursor = laneStart;
      const reflowed = reordered.map((item) => {
        const next = { ...item, start: cursor } as T;
        cursor += item.duration;
        return next;
      });

      const byId = new Map(reflowed.map((item) => [item.id, item] as const));
      let changed = false;
      const merged = items.map((item) => {
        const next = byId.get(item.id);
        if (!next) return item;
        if (next.start !== item.start) {
          changed = true;
          return next;
        }
        return item;
      });
      return changed ? merged : items;
    },
    []
  );

  const computeTrackInsertFrame = useCallback(
    <T extends { id: string; start: number; duration: number; row?: number }>(
      items: T[],
      movedId: string,
      hoverFrame: number
    ): number | null => {
      const moved = items.find((x) => x.id === movedId);
      if (!moved) return null;
      const movedRow = moved.row;
      const laneItems = items
        .filter((x) => (movedRow == null ? true : x.row === movedRow))
        .sort((a, b) => a.start - b.start);
      const withoutMoved = laneItems.filter((x) => x.id !== movedId);
      const pointer = Math.max(0, Math.floor(hoverFrame));
      if (withoutMoved.length === 0) return 0;

      // Use only CURRENT clip boundary positions (starts/ends) for insert marker.
      const boundaries = new Set<number>();
      boundaries.add(0);
      for (const item of withoutMoved) {
        boundaries.add(Math.max(0, Math.floor(item.start)));
        boundaries.add(Math.max(0, Math.floor(item.start + Math.max(1, item.duration))));
      }
      const ordered = [...boundaries].sort((a, b) => a - b);
      let best = ordered[0];
      let bestDist = Math.abs(pointer - best);
      for (let i = 1; i < ordered.length; i += 1) {
        const candidate = ordered[i];
        const dist = Math.abs(pointer - candidate);
        if (dist < bestDist) {
          best = candidate;
          bestDist = dist;
        }
      }
      return best;
    },
    []
  );

  const insertAudioAtPlayhead = useCallback(
    (
      src: string,
      label: string,
      durationFrames: number,
      sourceAuthor?: string
    ) => {
      ensureActiveProject();
      const d = Math.max(1, durationFrames);
      const insertFrame = Math.max(0, Math.floor(currentFrameRef.current));
      const now = Date.now();
      const last = lastAudioInsertRef.current;
      if (
        last &&
        last.src === src &&
        Math.abs(last.start - insertFrame) <= 1 &&
        Math.abs(last.duration - d) <= 1 &&
        now - last.ts < 700
      ) {
        const existing = editorStateRef.current.audioTracks.find(
          (a) =>
            a.src === src &&
            Math.abs(a.start - insertFrame) <= 1 &&
            Math.abs(a.duration - d) <= 1
        );
        if (existing) selectWithoutMovingPlayhead({ kind: "audio", id: existing.id });
        return;
      }
      const duplicate = editorStateRef.current.audioTracks.find(
        (a) => a.src === src && a.start === insertFrame && a.duration === d
      );
      if (duplicate) {
        selectWithoutMovingPlayhead({ kind: "audio", id: duplicate.id });
        return;
      }
      const authorTrim = (sourceAuthor ?? "").trim();
      const newAudio: TimelineAudio = {
        id: `audio-${Date.now()}`,
        start: insertFrame,
        duration: d,
        src,
        label,
        ...(authorTrim ? { sourceAuthor: authorTrim } : {}),
        row: AUDIO_TRACK_ROW,
      };
      setAudioTracks((prev) =>
        [...prev, newAudio].sort((a, b) => a.start - b.start)
      );
      selectAndMovePlayheadToEnd(
        { kind: "audio", id: newAudio.id },
        insertFrame + d,
        insertFrame
      );
      lastAudioInsertRef.current = {
        src,
        start: insertFrame,
        duration: d,
        ts: now,
      };
    },
    [ensureActiveProject]
  );

  const onSunoGenerated = useCallback(
    (audioUrl: string, label: string, durationSec?: number) => {
      const frames =
        durationSec != null && durationSec > 0
          ? Math.max(1, Math.round(durationSec * FPS))
          : DEFAULT_UPLOAD_AUDIO_FRAMES;
      insertAudioAtPlayhead(audioUrl, label, frames, "Suno");
    },
    [insertAudioAtPlayhead]
  );

  const addSampleAudioToTimeline = useCallback(
    (
      src: string,
      label: string,
      fallbackDurationSec: number,
      sourceAuthor?: string
    ) => {
      const cappedFallbackSec = Math.min(120, Math.max(0, fallbackDurationSec));
      const fallbackFrames = secondsToFrames(cappedFallbackSec, Math.max(1, FPS));
      const el = document.createElement("audio");
      let done = false;
      el.preload = "metadata";
      el.crossOrigin = "anonymous";
      el.src = src;
      el.onloadedmetadata = () => {
        if (done) return;
        done = true;
        const sec = Math.min(120, el.duration);
        const frames = secondsToFrames(sec, fallbackFrames);
        insertAudioAtPlayhead(src, label, frames, sourceAuthor);
      };
      el.onerror = () => {
        if (done) return;
        done = true;
        insertAudioAtPlayhead(src, label, fallbackFrames, sourceAuthor);
      };
      el.load();
    },
    [FPS, insertAudioAtPlayhead]
  );

  const playFromCurrentCursor = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    const f = Math.max(0, Math.floor(currentFrameRef.current));
    p.pause();
    safeSeekPlayer(p, f);
    setCurrentFrame(f);
    setPlaybackFrame(f);
    requestAnimationFrame(() => {
      p.play();
      setPreviewIsPlaying(true);
    });
  }, []);

  const insertVideoFileAtPlayhead = useCallback(
    (
      src: string,
      durationFrames: number,
      meta?: { sourceName?: string; sourceAuthor?: string }
    ) => {
      ensureActiveProject();
      const d = Math.max(1, durationFrames);
      const cursorFrame = Math.max(0, Math.floor(currentFrame));
      const videoLaneClips = editorStateRef.current.clips.filter((c) => !c.overlayClip);
      const clipAtCursor = videoLaneClips.find(
        (c) => cursorFrame >= c.start && cursorFrame < c.start + c.duration
      );
      const anchor =
        videoLaneClips.length === 0
          ? 0
          : clipAtCursor
            ? clipAtCursor.start + clipAtCursor.duration
            : cursorFrame;
      const insertFrame = resolveNonOverlappingStart(videoLaneClips, anchor, d);
      const now = Date.now();
      const last = lastVideoInsertRef.current;
      if (
        last &&
        last.src === src &&
        Math.abs(last.start - insertFrame) <= 1 &&
        Math.abs(last.duration - d) <= 1 &&
        now - last.ts < 700
      ) {
        const existing = editorStateRef.current.clips.find(
          (c) =>
            !c.overlayClip &&
            c.src === src &&
            Math.abs(c.start - insertFrame) <= 1 &&
            Math.abs(c.duration - d) <= 1
        );
        if (existing) selectWithoutMovingPlayhead({ kind: "clip", id: existing.id });
        return;
      }
      const duplicate = editorStateRef.current.clips.find(
        (c) =>
          c.src === src &&
          c.start === insertFrame &&
          c.duration === d &&
          !c.overlayClip
      );
      if (duplicate) {
        selectWithoutMovingPlayhead({ kind: "clip", id: duplicate.id });
        return;
      }
      const nameTrim = (meta?.sourceName ?? "").trim();
      const authorTrim = (meta?.sourceAuthor ?? "").trim();
      const newClip: Clip = {
        id: `clip-file-${Date.now()}`,
        start: insertFrame,
        duration: d,
        src,
        row: VIDEO_TRACK_ROW,
        ...(nameTrim ? { sourceName: nameTrim } : {}),
        ...(authorTrim ? { sourceAuthor: authorTrim } : {}),
      };
      setClips((prev) => [...prev, newClip]);
      selectAndMovePlayheadToEnd(
        { kind: "clip", id: newClip.id },
        insertFrame + d,
        insertFrame
      );
      lastVideoInsertRef.current = {
        src,
        start: insertFrame,
        duration: d,
        ts: now,
      };
    },
    [currentFrame, ensureActiveProject, resolveNonOverlappingStart]
  );

  const insertImageFileAtPlayhead = useCallback(
    (src: string, fileName?: string) => {
      ensureActiveProject();
      const d = 120;
      const cursorFrame = Math.max(0, Math.floor(currentFrame));
      const occupied = editorStateRef.current.clips
        .filter((c) => (c.mediaType ?? "video") !== "image")
        .map((c) => ({ start: c.start, duration: c.duration }));
      const insertFrame = resolveNonOverlappingStart(occupied, cursorFrame, d);
      const label = (fileName ?? "").replace(/\.[^/.]+$/, "").slice(0, 80).trim();
      const newClip: Clip = {
        id: `clip-image-${Date.now()}`,
        start: insertFrame,
        duration: d,
        src,
        row: VIDEO_TRACK_ROW,
        mediaType: "image",
        ...(label ? { sourceName: label } : {}),
      };
      setClips((prev) => [...prev, newClip]);
      selectAndMovePlayheadToEnd(
        { kind: "clip", id: newClip.id },
        insertFrame + d,
        insertFrame
      );
    },
    [currentFrame, ensureActiveProject, resolveNonOverlappingStart]
  );

  const onMediaFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fromAudioPicker = e.target === audioUploadInputRef.current;
      const fromMediaPicker = e.target === videoUploadInputRef.current;
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (files.length === 0) return;

      for (const file of files) {
        // Hard guard by picker source (not only file input `accept`), so
        // Upload audio never ingests video/image files.
        if (
          fromAudioPicker &&
          !file.type.startsWith("audio/")
        ) {
          continue;
        }
        if (
          fromMediaPicker &&
          !(file.type.startsWith("video/") || file.type.startsWith("image/"))
        ) {
          continue;
        }
        const url = URL.createObjectURL(file);

        if (file.type.startsWith("video/")) {
          const el = document.createElement("video");
          el.preload = "metadata";
          el.src = url;
          el.onloadedmetadata = () => {
            const sec = el.duration;
            const base =
              file.name.replace(/\.[^/.]+$/, "").slice(0, 80) || "Video";
            const nextItem: UploadedFileItem = {
              id: `upload-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              label: base,
              author: "Unknown author",
              src: url,
              durationSec: Math.max(1, Math.round(Number.isFinite(sec) ? sec : 0)),
              mediaType: "video",
            };
            setUploadedMediaItems((prev) => [nextItem, ...prev].slice(0, 50));
          };
          el.onerror = () => {
            const base =
              file.name.replace(/\.[^/.]+$/, "").slice(0, 80) || "Video";
            const nextItem: UploadedFileItem = {
              id: `upload-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              label: base,
              author: "Unknown author",
              src: url,
              durationSec: Math.max(1, Math.round(DEFAULT_INSERT_VIDEO_FRAMES / FPS)),
              mediaType: "video",
            };
            setUploadedMediaItems((prev) => [nextItem, ...prev].slice(0, 50));
          };
          continue;
        }

        if (file.type.startsWith("image/")) {
          const base = file.name.replace(/\.[^/.]+$/, "").slice(0, 80) || "Image";
          const nextItem: UploadedFileItem = {
            id: `upload-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            label: base,
            author: "Unknown author",
            src: url,
            durationSec: Math.max(1, Math.round(120 / FPS)),
            mediaType: "image",
          };
          setUploadedMediaItems((prev) => [nextItem, ...prev].slice(0, 50));
          continue;
        }

        if (file.type.startsWith("audio/")) {
          const label =
            file.name.replace(/\.[^/.]+$/, "").slice(0, 48) || "Audio";
          const el = document.createElement("audio");
          el.preload = "metadata";
          el.src = url;
          el.onloadedmetadata = () => {
            const sec = el.duration;
            const nextItem: UploadedFileItem = {
              id: `upload-audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              label,
              author: "Unknown author",
              src: url,
              durationSec: Math.max(1, Math.round(Number.isFinite(sec) ? sec : 0)),
            };
            setUploadedAudioItems((prev) => [nextItem, ...prev].slice(0, 50));
          };
          el.onerror = () => {
            const nextItem: UploadedFileItem = {
              id: `upload-audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              label,
              author: "Unknown author",
              src: url,
              durationSec: Math.max(1, Math.round(DEFAULT_UPLOAD_AUDIO_FRAMES / FPS)),
            };
            setUploadedAudioItems((prev) => [nextItem, ...prev].slice(0, 50));
          };
        }
      }
    },
    []
  );

  /**
   * Inserts an AI-generated video at the playhead. Does not shift other layers — overlaps allowed.
   * `fromAI` + `aiStackOrder` place AI above regular video in the preview stack.
   */
  const insertAIClip = useCallback((videoUrl: string) => {
    ensureActiveProject();
    const baseLaneEmpty =
      editorStateRef.current.clips.filter((c) => !c.overlayClip).length === 0;
    const insertFrame = baseLaneEmpty ? 0 : currentFrame;
      const commitInsert = (durationFrames: number) => {
      aiClipStackRef.current += 1;
      const newClip: Clip = {
        id: `clip-ai-${Date.now()}`,
        start: insertFrame,
        duration: Math.max(1, durationFrames),
        src: videoUrl,
        row: VIDEO_TRACK_ROW,
        fromAI: true,
        aiStackOrder: aiClipStackRef.current,
        sourceName: "AI clip",
        sourceAuthor: "AI",
      };
      setClips((prev) => [...prev, newClip]);
      selectAndMovePlayheadToEnd(
        { kind: "clip", id: newClip.id },
        insertFrame + newClip.duration,
        insertFrame
      );
    };

    const el = document.createElement("video");
    let done = false;
    el.preload = "metadata";
    el.crossOrigin = "anonymous";
    el.src = videoUrl;
    el.onloadedmetadata = () => {
      if (done) return;
      done = true;
      commitInsert(secondsToFrames(el.duration, DEFAULT_AI_VIDEO_FRAMES));
    };
    el.onerror = () => {
      if (done) return;
      done = true;
      commitInsert(DEFAULT_AI_VIDEO_FRAMES);
    };
    el.load();
  }, [currentFrame, ensureActiveProject]);

  /**
   * Giphy / Pexels layer at playhead — stacks above base video like AI clips.
   */
  const insertExplorerClip = useCallback(
    (
      src: string,
      opts: { label: string; mediaType: "video" | "image"; author?: string }
    ) => {
      ensureActiveProject();
      const insertFrame =
        editorStateRef.current.clips.length === 0 ? 0 : currentFrame;
      mediaOverlayStackRef.current += 1;
      const overlayOrder = mediaOverlayStackRef.current;
      const commitInsert = (durationFrames: number) => {
        const nameTrim = opts.label.trim().slice(0, 80);
        const authorTrim = (opts.author ?? "").trim().slice(0, 80);
        const newClip: Clip = {
          id: `clip-media-${Date.now()}`,
          start: insertFrame,
          duration: Math.max(1, durationFrames),
          src,
          row: VIDEO_TRACK_ROW,
          mediaType: opts.mediaType,
          overlayClip: true,
          overlayOrder,
          ...(nameTrim ? { sourceName: nameTrim } : {}),
          ...(authorTrim ? { sourceAuthor: authorTrim } : {}),
        };
        setClips((prev) => [...prev, newClip]);
        selectAndMovePlayheadToEnd(
          { kind: "clip", id: newClip.id },
          insertFrame + newClip.duration,
          insertFrame
        );
      };

      if (opts.mediaType === "image") {
        commitInsert(120);
        return;
      }

      const el = document.createElement("video");
      let done = false;
      el.preload = "metadata";
      el.crossOrigin = "anonymous";
      el.src = src;
      el.onloadedmetadata = () => {
        if (done) return;
        done = true;
        commitInsert(secondsToFrames(el.duration, DEFAULT_EXPLORER_VIDEO_FRAMES));
      };
      el.onerror = () => {
        if (done) return;
        done = true;
        commitInsert(DEFAULT_EXPLORER_VIDEO_FRAMES);
      };
      el.load();
    },
    [currentFrame, ensureActiveProject]
  );

  /**
   * Adds a new text overlay to the timeline
   * Automatically positions it after the last item
   * @function
   */
  const addTextOverlay = useCallback(() => {
    ensureActiveProject();
    const newId = `text-${Date.now()}`;
    const at = Math.max(0, Math.floor(currentFrameRef.current));
    const dur = 100;
    setTextOverlays((prev) => {
      const welcome = "Welcome to Video Editor";
      const newOverlay: TextOverlay = {
        id: newId,
        start: at,
        duration: dur,
        text: welcome,
        sourceName: welcome,
        row: TEXT_TRACK_ROW,
        ...textOverlayDefaults(),
      };
      return [...prev, newOverlay];
    });
    selectAndMovePlayheadToEnd(
      { kind: "text", id: newId },
      at + dur,
      at
    );
  }, [ensureActiveProject]);

  const addShapeTextFromTools = useCallback(
    (opts: {
      shape: "rect" | "circle" | "pill";
      fill: string;
      stroke: string;
      animation: TextAnimationPreset;
      label: string;
    }) => {
      ensureActiveProject();
      const newId = `text-${Date.now()}`;
      const at = Math.max(0, Math.floor(currentFrameRef.current));
      const dur = 120;
      setTextOverlays((prev) => {
        const newOverlay: TextOverlay = {
          id: newId,
          start: at,
          duration: dur,
          text: opts.label,
          sourceName: opts.label.slice(0, 80),
          row: SHAPE_TRACK_ROW,
          ...textOverlayDefaults(),
          animation: opts.animation,
          shapeBackground: opts.shape,
          shapeFill: opts.fill,
          shapeStroke: opts.stroke,
          shapeStrokeWidthPx: 3,
          shapePaddingRem: 0.85,
          color: "#0f172a",
        };
        return [...prev, newOverlay];
      });
      selectAndMovePlayheadToEnd(
        { kind: "text", id: newId },
        at + dur,
        at
      );
      setNavPanel("videos");
    },
    [ensureActiveProject]
  );

  const normalizedVideoLayers = useMemo(() => {
    const byIdentity = new Map<
      string,
      {
        clip: Clip;
        safeStart: number;
        safeDuration: number;
        safeTrimStart: number;
        zVideo: number;
      }
    >();
    for (const clip of clips) {
      const safeStart = Math.max(0, Math.floor(clip.start));
      const safeDuration = Math.max(1, Math.floor(clip.duration));
      const safeTrimStart = Math.max(0, Math.floor(clip.trimStart ?? 0));
      const zVideo = clip.fromAI
        ? 200 + (clip.aiStackOrder ?? 0)
        : clip.overlayClip
          ? 200 + (clip.overlayOrder ?? 0)
          : 20;
      const identityKey = `${clip.src}|${safeStart}|${safeDuration}|${safeTrimStart}|${clip.row}`;
      const candidate = { clip, safeStart, safeDuration, safeTrimStart, zVideo };
      const existing = byIdentity.get(identityKey);
      if (!existing || candidate.clip.id.localeCompare(existing.clip.id) < 0) {
        byIdentity.set(identityKey, candidate);
      }
    }

    return Array.from(byIdentity.entries())
      .map(([identityKey, layer]) => ({
        ...layer,
        renderKey: `video:${identityKey}|z:${layer.zVideo}`,
      }))
      .sort((a, b) => {
        if (a.safeStart !== b.safeStart) return a.safeStart - b.safeStart;
        if (a.zVideo !== b.zVideo) return a.zVideo - b.zVideo;
        if (a.safeTrimStart !== b.safeTrimStart) {
          return a.safeTrimStart - b.safeTrimStart;
        }
        return a.clip.id.localeCompare(b.clip.id);
      });
  }, [clips]);

  const normalizedAudioLayers = useMemo(
    () => normalizeAudioTracksForComposition(audioTracks),
    [audioTracks],
  );

  const timelineAudioSrcPrefetchKey = useMemo(
    () =>
      JSON.stringify(
        [...new Set(audioTracks.map((t) => t.src).filter(Boolean))].sort(),
      ),
    [audioTracks],
  );

  const ensureTimelineAudioPrefetchReady = useCallback(async () => {
    const srcs = JSON.parse(timelineAudioSrcPrefetchKey) as string[];
    const srcSet = new Set(srcs);
    const handles = timelineAudioPrefetchHandlesRef.current;

    // Drop prefetches no longer needed by timeline state.
    for (const [src, handle] of handles.entries()) {
      if (!srcSet.has(src)) {
        handle.free();
        handles.delete(src);
      }
    }

    // Prime missing audio sources.
    for (const src of srcs) {
      if (handles.has(src)) continue;
      try {
        handles.set(src, prefetch(src));
      } catch {
        // Invalid URL or prefetch unsupported in this environment.
      }
    }

    const waiters = srcs
      .map((src) => handles.get(src)?.waitUntilDone())
      .filter((p): p is Promise<string> => Boolean(p));
    if (waiters.length === 0) {
      timelineAudioPrefetchReadyRef.current = null;
      return;
    }
    const ready = Promise.allSettled(waiters).then(() => undefined);
    timelineAudioPrefetchReadyRef.current = ready;
    await Promise.race([
      ready,
      new Promise<void>((resolve) => window.setTimeout(resolve, 1200)),
    ]);
  }, [timelineAudioSrcPrefetchKey]);

  useEffect(() => {
    void ensureTimelineAudioPrefetchReady();
  }, [ensureTimelineAudioPrefetchReady]);

  useEffect(() => {
    return () => {
      for (const handle of timelineAudioPrefetchHandlesRef.current.values()) {
        handle.free();
      }
      timelineAudioPrefetchHandlesRef.current.clear();
      timelineAudioPrefetchReadyRef.current = null;
    };
  }, []);

  /**
   * Composition component for Remotion Player
   * Renders all clips and text overlays in sequence
   * @function
   * @returns {JSX.Element} Remotion composition
   */
  /** Stacked video (AI above base), audio, then text above all. */
  const Composition = useCallback(
    () => (
      <>
        {normalizedVideoLayers.map((layer) => (
          <Sequence
            key={layer.renderKey}
            from={layer.safeStart}
            durationInFrames={layer.safeDuration}
          >
            <ClipSequenceContent
              clip={{ ...layer.clip, trimStart: layer.safeTrimStart }}
              zIndex={layer.zVideo}
              sequenceDurationInFrames={layer.safeDuration}
              muted={normalizedAudioLayers.length > 0}
            />
          </Sequence>
        ))}
        {ENABLE_AUDIO_PLAYBACK_IN_LEGACY_EDITOR
          ? normalizedAudioLayers.map((layer) => (
              <Sequence
                key={layer.track.id}
                from={layer.safeStart}
                durationInFrames={layer.safeDuration}
              >
                <AudioWithFades
                  track={{ ...layer.track, trimStart: layer.safeTrimStart }}
                  sequenceDurationInFrames={layer.safeDuration}
                />
              </Sequence>
            ))
          : null}
        {[...textOverlays]
          .sort((a, b) => a.start - b.start)
          .map((item) => (
            <Sequence
              key={item.id}
              from={item.start}
              durationInFrames={item.duration}
            >
              <AbsoluteFill style={{ zIndex: 5000, pointerEvents: "none" }}>
                <TextOverlayLayer
                  text={item.text}
                  animation={item.animation}
                  animInFrames={item.animInFrames}
                  fontSizeRem={item.fontSizeRem}
                  color={item.color}
                  animDirection={item.animDirection}
                  fontWeight={item.fontWeight}
                  posX={item.posX}
                  posY={item.posY}
                  widthPct={item.widthPct}
                  rotationDeg={item.rotationDeg}
                  shapeBackground={item.shapeBackground}
                  shapeFill={item.shapeFill}
                  shapeStroke={item.shapeStroke}
                  shapeStrokeWidthPx={item.shapeStrokeWidthPx}
                  shapePaddingRem={item.shapePaddingRem}
                />
              </AbsoluteFill>
            </Sequence>
          ))}
      </>
    ),
    [normalizedVideoLayers, normalizedAudioLayers, textOverlays]
  );

  useEffect(() => {
    const end = [...clips, ...textOverlays, ...audioTracks].reduce(
      (m, i) => Math.max(m, i.start + i.duration),
      0
    );
    setTotalDuration(Math.max(1, end));
  }, [clips, textOverlays, audioTracks]);

  // Keep playhead/frame state inside timeline bounds after edits that shrink duration.
  useEffect(() => {
    const endFrame = Math.max(0, Math.floor(totalDuration) - 1);
    const cur = Math.max(0, Math.floor(currentFrameRef.current));
    if (cur <= endFrame) return;
    playActionFrameRef.current = endFrame;
    setCurrentFrame((prev) => (prev === endFrame ? prev : endFrame));
    setPlaybackFrame((prev) => (prev === endFrame ? prev : endFrame));
    const p = playerRef.current;
    if (p) {
      safeSeekPlayer(p, endFrame);
    }
  }, [totalDuration, safeSeekPlayer]);

  useEffect(() => {
    if (previewMode !== "cached") return;
    if (audioTracks.length === 0) return;
    switchToLivePlayback(
      currentFrameRef.current,
      "Audio layers require live preview playback."
    );
  }, [audioTracks.length, previewMode, switchToLivePlayback]);

  const splitLayerAtPlayhead = useCallback(
    (kind: "clip" | "audio" | "text", id: string) => {
      const f = Math.floor(currentFrame);

      if (kind === "clip") {
        const c = clips.find((x) => x.id === id);
        if (!c || f <= c.start || f >= c.start + c.duration) return;
        const t0 = c.trimStart ?? 0;
        const splitOffset = f - c.start;
        const left: Clip = {
          ...c,
          id: `${c.id}-a`,
          trimStart: t0,
          duration: splitOffset,
        };
        const right: Clip = {
          ...c,
          id: `clip-${Date.now()}`,
          start: f,
          trimStart: t0 + splitOffset,
          duration: c.start + c.duration - f,
        };
        setClips(
          [...clips.filter((x) => x.id !== c.id), left, right].sort(
            (a, b) => a.start - b.start
          )
        );
        selectWithoutMovingPlayhead({ kind: "clip", id: right.id });
        return;
      }

      if (kind === "audio") {
        const a = audioTracks.find((x) => x.id === id);
        if (!a || f <= a.start || f >= a.start + a.duration) return;
        const t0 = a.trimStart ?? 0;
        const splitOffset = f - a.start;
        const leftA: TimelineAudio = {
          ...a,
          id: `${a.id}-a`,
          trimStart: t0,
          duration: splitOffset,
        };
        const rightA: TimelineAudio = {
          ...a,
          id: `audio-${Date.now()}`,
          start: f,
          trimStart: t0 + splitOffset,
          duration: a.start + a.duration - f,
        };
        setAudioTracks(
          [...audioTracks.filter((x) => x.id !== a.id), leftA, rightA].sort(
            (x, y) => x.start - y.start
          )
        );
        selectWithoutMovingPlayhead({ kind: "audio", id: rightA.id });
        return;
      }

      const t = textOverlays.find((x) => x.id === id);
      if (!t || f <= t.start || f >= t.start + t.duration) return;
      const leftT: TextOverlay = {
        ...t,
        id: `${t.id}-a`,
        duration: f - t.start,
      };
      const rightT: TextOverlay = {
        ...t,
        id: `text-${Date.now()}`,
        start: f,
        duration: t.start + t.duration - f,
      };
      setTextOverlays(
        [...textOverlays.filter((x) => x.id !== t.id), leftT, rightT].sort(
          (a, b) => a.start - b.start
        )
      );
      selectWithoutMovingPlayhead({ kind: "text", id: rightT.id });
    },
    [currentFrame, clips, textOverlays, audioTracks]
  );

  const updateTextOverlay = useCallback(
    (id: string, patch: Partial<TextOverlay>) => {
      setTextOverlays((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
      );
    },
    []
  );

  const updateClip = useCallback((id: string, patch: Partial<Clip>) => {
    setClips((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }, []);

  const updateAudioTrack = useCallback(
    (id: string, patch: Partial<TimelineAudio>) => {
      setAudioTracks((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
    },
    []
  );

  const applyAiTextToLayer = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      if (selected?.kind === "text") {
        updateTextOverlay(selected.id, { text: trimmed });
        return;
      }
      ensureActiveProject();
      const lastItem = timelineEnd();
      const newOverlay: TextOverlay = {
        id: `text-${Date.now()}`,
        start: lastItem.start + lastItem.duration,
        duration: 100,
        text: trimmed,
        row: TEXT_TRACK_ROW,
        ...textOverlayDefaults(),
      };
      setTextOverlays((prev) => [...prev, newOverlay]);
      selectAndMovePlayheadToEnd(
        { kind: "text", id: newOverlay.id },
        newOverlay.start + newOverlay.duration,
        newOverlay.start
      );
    },
    [ensureActiveProject, selected, timelineEnd, updateTextOverlay]
  );

  const deleteLayerById = useCallback(
    (kind: "clip" | "audio" | "text", id: string) => {
      const player = playerRef.current;
      const wasPlaying = Boolean(player?.isPlaying());
      if (player) player.pause();

      const { clips: cList, textOverlays: tList, audioTracks: aList } =
        editorStateRef.current;
      const target =
        kind === "clip"
          ? cList.find((c) => c.id === id)
          : kind === "audio"
            ? aList.find((a) => a.id === id)
            : tList.find((t) => t.id === id);
      if (!target) return;

      const cutStart = target.start;
      const cutFrames = target.duration;
      const shiftedStart = (start: number) =>
        start > cutStart ? Math.max(0, start - cutFrames) : start;
      const anchorFrame = Math.max(
        0,
        Math.floor(
          hoverFrameRef.current != null
            ? hoverFrameRef.current
            : currentFrameRef.current
        )
      );
      const fallbackClipId =
        kind === "clip"
          ? (() => {
              const sorted = [...cList].sort((a, b) =>
                a.start !== b.start ? a.start - b.start : a.id.localeCompare(b.id)
              );
              const idx = sorted.findIndex((c) => c.id === id);
              if (idx < 0) return null;
              const next = sorted[idx + 1];
              if (next) return next.id;
              const prev = sorted[idx - 1];
              return prev ? prev.id : null;
            })()
          : null;

      setClips((prev) =>
        prev
          .filter((c) => !(kind === "clip" && c.id === id))
          .map((c) =>
            c.start > cutStart ? { ...c, start: shiftedStart(c.start) } : c
          )
      );
      setAudioTracks((prev) =>
        prev
          .filter((a) => !(kind === "audio" && a.id === id))
          .map((a) =>
            a.start > cutStart ? { ...a, start: shiftedStart(a.start) } : a
          )
      );
      setTextOverlays((prev) =>
        prev
          .filter((t) => !(kind === "text" && t.id === id))
          .map((t) =>
            t.start > cutStart ? { ...t, start: shiftedStart(t.start) } : t
          )
      );
      if (kind === "clip") {
        if (fallbackClipId) {
          selectWithoutMovingPlayhead({ kind: "clip", id: fallbackClipId });
        } else {
          setSelected((s) => (s?.id === id ? null : s));
        }
      } else {
        setSelected((s) => (s?.id === id ? null : s));
      }
      setTrackContextMenu(null);

      requestAnimationFrame(() => {
        const p = playerRef.current;
        if (!p) return;
        let targetFrame = anchorFrame;
        let nextHoverFrame = anchorFrame;
        let selectedClipEndX: number | null = null;
        if (kind === "clip" && fallbackClipId) {
          const fallbackClip = editorStateRef.current.clips.find(
            (c) => c.id === fallbackClipId
          );
          if (fallbackClip) {
            const relativeOffset = anchorFrame - cutStart;
            const clampedOffset = Math.max(
              0,
              Math.min(relativeOffset, Math.max(0, fallbackClip.duration))
            );
            nextHoverFrame = Math.floor(fallbackClip.start + clampedOffset);
            targetFrame = Math.max(
              0,
              Math.floor(fallbackClip.start + fallbackClip.duration)
            );
            selectedClipEndX =
              TIMELINE_PAD_LEFT +
              (fallbackClip.start + fallbackClip.duration) * PX_PER_FRAME;
          }
        }
        const f = safeSeekPlayer(p, targetFrame);
        setCurrentFrame(f);
        setPlaybackFrame(f);
        if (hoverFrameRef.current != null) {
          setHoverFrame(nextHoverFrame);
        }
        if (selectedClipEndX != null) {
          requestAnimationFrame(() => {
            const sc = timelineScrollRef.current;
            if (!sc) return;
            const desired = selectedClipEndX - sc.clientWidth * 0.8;
            const maxScroll = Math.max(0, sc.scrollWidth - sc.clientWidth);
            sc.scrollLeft = Math.max(0, Math.min(maxScroll, desired));
          });
        }
        if (wasPlaying) p.play();
      });
    },
    [safeSeekPlayer, selectWithoutMovingPlayhead]
  );

  const duplicateLayer = useCallback(
    (kind: "clip" | "audio" | "text", id: string) => {
      const gap = 0;
      if (kind === "clip") {
        const c = clips.find((x) => x.id === id);
        if (!c) return;
        let nextStack = c.aiStackOrder;
        if (c.fromAI) {
          aiClipStackRef.current += 1;
          nextStack = aiClipStackRef.current;
        }
        let nextOverlay = c.overlayOrder;
        if (c.overlayClip) {
          mediaOverlayStackRef.current += 1;
          nextOverlay = mediaOverlayStackRef.current;
        }
        const copy: Clip = {
          ...c,
          id: `clip-${Date.now()}`,
          start: c.start + c.duration + gap,
          ...(c.fromAI && nextStack !== undefined
            ? { aiStackOrder: nextStack }
            : {}),
          ...(c.overlayClip && nextOverlay !== undefined
            ? { overlayOrder: nextOverlay }
            : {}),
        };
        setClips((prev) => [...prev, copy].sort((a, b) => a.start - b.start));
        selectWithoutMovingPlayhead({ kind: "clip", id: copy.id });
      } else if (kind === "audio") {
        const a = audioTracks.find((x) => x.id === id);
        if (!a) return;
        const copy: TimelineAudio = {
          ...a,
          id: `audio-${Date.now()}`,
          start: a.start + a.duration + gap,
        };
        setAudioTracks((prev) =>
          [...prev, copy].sort((x, y) => x.start - y.start)
        );
        selectWithoutMovingPlayhead({ kind: "audio", id: copy.id });
      } else {
        const t = textOverlays.find((x) => x.id === id);
        if (!t) return;
        const copy: TextOverlay = {
          ...t,
          id: `text-${Date.now()}`,
          start: t.start + t.duration + gap,
        };
        setTextOverlays((prev) =>
          [...prev, copy].sort((a, b) => a.start - b.start)
        );
        selectWithoutMovingPlayhead({ kind: "text", id: copy.id });
      }
      setTrackContextMenu(null);
    },
    [clips, audioTracks, textOverlays]
  );

  const copyLayer = useCallback(
    (kind: "clip" | "audio" | "text", id: string) => {
      const { clips: cList, textOverlays: tList, audioTracks: aList } =
        editorStateRef.current;
      if (kind === "clip") {
        const item = cList.find((x) => x.id === id);
        if (item) clipboardRef.current = { kind: "clip", data: deepCloneLayer(item) };
        return;
      }
      if (kind === "text") {
        const item = tList.find((x) => x.id === id);
        if (item) clipboardRef.current = { kind: "text", data: deepCloneLayer(item) };
        return;
      }
      const item = aList.find((x) => x.id === id);
      if (item) clipboardRef.current = { kind: "audio", data: deepCloneLayer(item) };
    },
    []
  );

  const copySelected = useCallback(() => {
    const sel = selectedRef.current;
    if (!sel) return;
    copyLayer(sel.kind, sel.id);
  }, [copyLayer]);

  const pasteAtPlayhead = useCallback(() => {
    const entry = clipboardRef.current;
    if (!entry) return;
    pushUndo();
    const cursorFrame = Math.max(0, Math.floor(currentFrameRef.current));
    if (entry.kind === "clip") {
      const base = deepCloneLayer(entry.data);
      const id = `clip-${Date.now()}`;
      const d = Math.max(1, Math.floor(base.duration));

      if (base.overlayClip) {
        mediaOverlayStackRef.current += 1;
        const insertFrame =
          editorStateRef.current.clips.length === 0 ? 0 : cursorFrame;
        const next: Clip = {
          ...base,
          id,
          start: insertFrame,
          row: VIDEO_TRACK_ROW,
          overlayClip: true,
          overlayOrder: mediaOverlayStackRef.current,
        };
        setClips((prev) => [...prev, next]);
        selectAndMovePlayheadToEnd(
          { kind: "clip", id },
          insertFrame + d,
          insertFrame
        );
        return;
      }

      if (base.fromAI) {
        const baseLaneEmpty =
          editorStateRef.current.clips.filter((c) => !c.overlayClip).length === 0;
        const insertFrame = baseLaneEmpty ? 0 : cursorFrame;
        aiClipStackRef.current += 1;
        const next: Clip = {
          ...base,
          id,
          start: insertFrame,
          row: VIDEO_TRACK_ROW,
          fromAI: true,
          aiStackOrder: aiClipStackRef.current,
        };
        setClips((prev) => [...prev, next]);
        selectAndMovePlayheadToEnd(
          { kind: "clip", id },
          insertFrame + d,
          insertFrame
        );
        return;
      }

      const videoLaneClips = editorStateRef.current.clips.filter((c) => !c.overlayClip);
      const clipAtCursor = videoLaneClips.find(
        (c) => cursorFrame >= c.start && cursorFrame < c.start + c.duration
      );
      const anchor =
        videoLaneClips.length === 0
          ? 0
          : clipAtCursor
            ? clipAtCursor.start + clipAtCursor.duration
            : cursorFrame;
      const insertFrame = resolveNonOverlappingStart(videoLaneClips, anchor, d);
      const next: Clip = {
        ...base,
        id,
        start: insertFrame,
        row: VIDEO_TRACK_ROW,
      };
      setClips((prev) => [...prev, next]);
      selectAndMovePlayheadToEnd(
        { kind: "clip", id },
        insertFrame + d,
        insertFrame
      );
      return;
    }
    if (entry.kind === "text") {
      const base = deepCloneLayer(entry.data);
      const id = `text-${Date.now()}`;
      const at = cursorFrame;
      const next: TextOverlay = { ...base, id, start: at };
      const dur = Math.max(1, Math.floor(next.duration));
      setTextOverlays((prev) =>
        [...prev, next].sort((a, b) => a.start - b.start)
      );
      selectAndMovePlayheadToEnd({ kind: "text", id }, at + dur, at);
      return;
    }
    const base = deepCloneLayer(entry.data);
    const id = `audio-${Date.now()}`;
    const insertFrame = cursorFrame;
    const d = Math.max(1, Math.floor(base.duration));
    const next: TimelineAudio = {
      ...base,
      id,
      start: insertFrame,
      row: AUDIO_TRACK_ROW,
    };
    setAudioTracks((prev) =>
      [...prev, next].sort((a, b) => a.start - b.start)
    );
    selectAndMovePlayheadToEnd(
      { kind: "audio", id },
      insertFrame + d,
      insertFrame
    );
  }, [pushUndo, resolveNonOverlappingStart, selectAndMovePlayheadToEnd]);

  const deleteSelected = useCallback(() => {
    const sel = selectedRef.current;
    if (!sel) return;
    pushUndo();
    deleteLayerById(sel.kind, sel.id);
  }, [pushUndo, deleteLayerById]);

  keyActionsRef.current = {
    pushUndo,
    undo,
    redo,
    copySelected,
    pasteAtPlayhead,
    deleteSelected,
    saveProject: saveCurrentProjectToStorage,
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target;
      if (
        el instanceof HTMLElement &&
        el.closest(
          "input, textarea, select, [contenteditable=true], [contenteditable='']"
        )
      ) {
        return;
      }
      const a = keyActionsRef.current;
      if (!a) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        a.undo();
        return;
      }
      if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        a.redo();
        return;
      }
      if (mod && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        a.copySelected();
        return;
      }
      if (mod && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        a.pasteAtPlayhead();
        return;
      }
      if (mod && (e.key === "s" || e.key === "S") && !e.shiftKey) {
        e.preventDefault();
        a.saveProject();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedRef.current) {
          e.preventDefault();
          a.deleteSelected();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /** Stop playback and jump the playhead to the selected layer’s start (preview + timeline cursor). */
  useEffect(() => {
    if (!selected) return;
    if (dragging || resizeDragging) return;
    if (preservePlayheadOnNextSelectionRef.current) {
      preservePlayheadOnNextSelectionRef.current = false;
      return;
    }
    let startFrame = 0;
    if (selected.kind === "clip") {
      const c = clips.find((x) => x.id === selected.id);
      if (!c) return;
      startFrame = c.start;
    } else if (selected.kind === "text") {
      const t = textOverlays.find((x) => x.id === selected.id);
      if (!t) return;
      startFrame = t.start;
    } else {
      const a = audioTracks.find((x) => x.id === selected.id);
      if (!a) return;
      startFrame = a.start;
    }
    const player = playerRef.current;
    if (player) {
      player.pause();
      safeSeekPlayer(player, startFrame);
    }
    setCurrentFrame(startFrame);
    setPlaybackFrame(startFrame);
    setHoverFrame(startFrame);
  }, [selected, clips, textOverlays, audioTracks, dragging, resizeDragging]);

  const focusTimelineItem = useCallback(
    (kind: "clip" | "audio" | "text", id: string) => {
      let startFrame = 0;
      if (kind === "clip") {
        const c = clips.find((x) => x.id === id);
        if (!c) return;
        startFrame = c.start;
      } else if (kind === "text") {
        const t = textOverlays.find((x) => x.id === id);
        if (!t) return;
        startFrame = t.start;
      } else {
        const a = audioTracks.find((x) => x.id === id);
        if (!a) return;
        startFrame = a.start;
      }

      cachedVideoRef.current?.pause();
      const player = playerRef.current;
      if (player) {
        player.pause();
        safeSeekPlayer(player, startFrame);
      }
      playActionFrameRef.current = startFrame;
      setCurrentFrame(startFrame);
      setPlaybackFrame(startFrame);
      setSelected({ kind, id });
    },
    [audioTracks, clips, textOverlays]
  );

  const trimHeadAtPlayhead = useCallback(
    (kind: "clip" | "audio" | "text", id: string) => {
      const f = Math.floor(currentFrame);
      if (kind === "clip") {
        const c = clips.find((x) => x.id === id);
        if (!c || f <= c.start || f >= c.start + c.duration) return;
        const t0 = c.trimStart ?? 0;
        setClips((prev) =>
          prev.map((x) =>
            x.id === id
              ? {
                  ...x,
                  start: f,
                  duration: c.start + c.duration - f,
                  trimStart: t0 + (f - c.start),
                }
              : x
          )
        );
      } else if (kind === "audio") {
        const a = audioTracks.find((x) => x.id === id);
        if (!a || f <= a.start || f >= a.start + a.duration) return;
        const t0 = a.trimStart ?? 0;
        setAudioTracks((prev) =>
          prev.map((x) =>
            x.id === id
              ? {
                  ...x,
                  start: f,
                  duration: a.start + a.duration - f,
                  trimStart: t0 + (f - a.start),
                }
              : x
          )
        );
      } else {
        const t = textOverlays.find((x) => x.id === id);
        if (!t || f <= t.start || f >= t.start + t.duration) return;
        setTextOverlays((prev) =>
          prev.map((x) =>
            x.id === id
              ? {
                  ...x,
                  start: f,
                  duration: t.start + t.duration - f,
                }
              : x
          )
        );
      }
      setTrackContextMenu(null);
    },
    [currentFrame, clips, audioTracks, textOverlays]
  );

  const trimTailAtPlayhead = useCallback(
    (kind: "clip" | "audio" | "text", id: string) => {
      const f = Math.floor(currentFrame);
      if (kind === "clip") {
        const c = clips.find((x) => x.id === id);
        if (!c || f <= c.start || f >= c.start + c.duration) return;
        setClips((prev) =>
          prev.map((x) =>
            x.id === id ? { ...x, duration: Math.max(1, f - c.start) } : x
          )
        );
      } else if (kind === "audio") {
        const a = audioTracks.find((x) => x.id === id);
        if (!a || f <= a.start || f >= a.start + a.duration) return;
        setAudioTracks((prev) =>
          prev.map((x) =>
            x.id === id ? { ...x, duration: Math.max(1, f - a.start) } : x
          )
        );
      } else {
        const t = textOverlays.find((x) => x.id === id);
        if (!t || f <= t.start || f >= t.start + t.duration) return;
        setTextOverlays((prev) =>
          prev.map((x) =>
            x.id === id ? { ...x, duration: Math.max(1, f - t.start) } : x
          )
        );
      }
      setTrackContextMenu(null);
    },
    [currentFrame, clips, audioTracks, textOverlays]
  );

  const joinWithNext = useCallback(
    (kind: "clip" | "audio" | "text", id: string) => {
      if (kind === "clip") {
        const sorted = [...clips].sort((a, b) => a.start - b.start);
        const i = sorted.findIndex((c) => c.id === id);
        if (i < 0 || i >= sorted.length - 1) return;
        const a = sorted[i];
        const b = sorted[i + 1];
        if (b.start !== a.start + a.duration || a.src !== b.src) return;
        if ((b.trimStart ?? 0) !== (a.trimStart ?? 0) + a.duration) return;
        const merged: Clip = {
          ...a,
          duration: a.duration + b.duration,
          fromAI: !!(a.fromAI || b.fromAI),
          aiStackOrder:
            a.fromAI || b.fromAI
              ? Math.max(a.aiStackOrder ?? 0, b.aiStackOrder ?? 0)
              : undefined,
        };
        setClips((prev) =>
          [...prev.filter((x) => x.id !== a.id && x.id !== b.id), merged].sort(
            (x, y) => x.start - y.start
          )
        );
        setSelected({ kind: "clip", id: merged.id });
      } else if (kind === "audio") {
        const sorted = [...audioTracks].sort((a, b) => a.start - b.start);
        const i = sorted.findIndex((x) => x.id === id);
        if (i < 0 || i >= sorted.length - 1) return;
        const a = sorted[i];
        const b = sorted[i + 1];
        if (b.start !== a.start + a.duration || a.src !== b.src) return;
        if ((b.trimStart ?? 0) !== (a.trimStart ?? 0) + a.duration) return;
        const merged: TimelineAudio = {
          ...a,
          label: a.label || b.label,
          duration: a.duration + b.duration,
          ...((a.sourceAuthor || b.sourceAuthor || "").trim()
            ? {
                sourceAuthor: (a.sourceAuthor || b.sourceAuthor || "").trim(),
              }
            : {}),
        };
        setAudioTracks((prev) =>
          [...prev.filter((x) => x.id !== a.id && x.id !== b.id), merged].sort(
            (x, y) => x.start - y.start
          )
        );
        setSelected({ kind: "audio", id: merged.id });
      } else {
        const sorted = [...textOverlays].sort((a, b) => a.start - b.start);
        const i = sorted.findIndex((t) => t.id === id);
        if (i < 0 || i >= sorted.length - 1) return;
        const a = sorted[i];
        const b = sorted[i + 1];
        if (b.start !== a.start + a.duration || a.row !== b.row) return;
        const merged: TextOverlay = {
          ...a,
          text: `${a.text} ${b.text}`.trim(),
          duration: a.duration + b.duration,
        };
        setTextOverlays((prev) =>
          [...prev.filter((x) => x.id !== a.id && x.id !== b.id), merged].sort(
            (x, y) => x.start - y.start
          )
        );
        setSelected({ kind: "text", id: merged.id });
      }
      setTrackContextMenu(null);
    },
    [clips, audioTracks, textOverlays]
  );

  const joinWithPrev = useCallback(
    (kind: "clip" | "audio" | "text", id: string) => {
      if (kind === "clip") {
        const sorted = [...clips].sort((a, b) => a.start - b.start);
        const i = sorted.findIndex((c) => c.id === id);
        if (i <= 0) return;
        const b = sorted[i];
        const a = sorted[i - 1];
        if (b.start !== a.start + a.duration || a.src !== b.src) return;
        if ((b.trimStart ?? 0) !== (a.trimStart ?? 0) + a.duration) return;
        const merged: Clip = {
          ...a,
          duration: a.duration + b.duration,
          fromAI: !!(a.fromAI || b.fromAI),
          aiStackOrder:
            a.fromAI || b.fromAI
              ? Math.max(a.aiStackOrder ?? 0, b.aiStackOrder ?? 0)
              : undefined,
        };
        setClips((prev) =>
          [...prev.filter((x) => x.id !== a.id && x.id !== b.id), merged].sort(
            (x, y) => x.start - y.start
          )
        );
        setSelected({ kind: "clip", id: merged.id });
      } else if (kind === "audio") {
        const sorted = [...audioTracks].sort((a, b) => a.start - b.start);
        const i = sorted.findIndex((x) => x.id === id);
        if (i <= 0) return;
        const b = sorted[i];
        const a = sorted[i - 1];
        if (b.start !== a.start + a.duration || a.src !== b.src) return;
        if ((b.trimStart ?? 0) !== (a.trimStart ?? 0) + a.duration) return;
        const merged: TimelineAudio = {
          ...a,
          label: a.label || b.label,
          duration: a.duration + b.duration,
          ...((a.sourceAuthor || b.sourceAuthor || "").trim()
            ? {
                sourceAuthor: (a.sourceAuthor || b.sourceAuthor || "").trim(),
              }
            : {}),
        };
        setAudioTracks((prev) =>
          [...prev.filter((x) => x.id !== a.id && x.id !== b.id), merged].sort(
            (x, y) => x.start - y.start
          )
        );
        setSelected({ kind: "audio", id: merged.id });
      } else {
        const sorted = [...textOverlays].sort((a, b) => a.start - b.start);
        const i = sorted.findIndex((t) => t.id === id);
        if (i <= 0) return;
        const b = sorted[i];
        const a = sorted[i - 1];
        if (b.start !== a.start + a.duration || a.row !== b.row) return;
        const merged: TextOverlay = {
          ...a,
          text: `${a.text} ${b.text}`.trim(),
          duration: a.duration + b.duration,
        };
        setTextOverlays((prev) =>
          [...prev.filter((x) => x.id !== a.id && x.id !== b.id), merged].sort(
            (x, y) => x.start - y.start
          )
        );
        setSelected({ kind: "text", id: merged.id });
      }
      setTrackContextMenu(null);
    },
    [clips, audioTracks, textOverlays]
  );

  useEffect(() => {
    if (!resizeDragging) return;
    if (resizeDragging.kind === "clip" && previewMode === "live") {
      resumeAfterClipResizeRef.current = Boolean(playerRef.current?.isPlaying());
    } else {
      resumeAfterClipResizeRef.current = false;
    }
    const onMove = (e: MouseEvent) => {
      const delta = Math.round(
        (e.clientX - resizeDragging.startClientX) / PX_PER_FRAME
      );
      const { kind, id, edge, initialStart, initialDuration, initialTrim } =
        resizeDragging;

      if (edge === "right") {
        let newDur = Math.min(
          MAX_STRETCH_FRAMES,
          Math.max(1, initialDuration + delta)
        );
        const snapThresholdFrames = 6;
        if (kind === "audio") {
          const nextStart = audioTracks
            .filter((a) => a.id !== id && a.start > initialStart)
            .reduce<number | null>(
              (minStart, a) =>
                minStart === null || a.start < minStart ? a.start : minStart,
              null
            );
          if (nextStart !== null) {
            const rightEdge = initialStart + newDur;
            if (Math.abs(rightEdge - nextStart) <= snapThresholdFrames) {
              newDur = Math.max(1, nextStart - initialStart);
            }
          }
        } else if (kind === "text") {
          const nextStart = textOverlays
            .filter((o) => o.id !== id && o.start > initialStart)
            .reduce<number | null>(
              (minStart, o) =>
                minStart === null || o.start < minStart ? o.start : minStart,
              null
            );
          if (nextStart !== null) {
            const rightEdge = initialStart + newDur;
            if (Math.abs(rightEdge - nextStart) <= snapThresholdFrames) {
              newDur = Math.max(1, nextStart - initialStart);
            }
          }
        }
        if (kind === "clip") {
          setClips((prev) => {
            let changed = false;
            const next = prev.map((c) => {
              if (c.id !== id) return c;
              if (c.duration === newDur) return c;
              changed = true;
              return { ...c, duration: newDur };
            });
            return changed ? next : prev;
          });
        } else if (kind === "audio") {
          setAudioTracks((prev) => {
            let changed = false;
            const next = prev.map((a) => {
              if (a.id !== id) return a;
              if (a.duration === newDur) return a;
              changed = true;
              return { ...a, duration: newDur };
            });
            return changed ? next : prev;
          });
        } else {
          setTextOverlays((prev) => {
            let changed = false;
            const next = prev.map((o) => {
              if (o.id !== id) return o;
              if (o.duration === newDur) return o;
              changed = true;
              return { ...o, duration: newDur };
            });
            return changed ? next : prev;
          });
        }
        return;
      }

      if (kind === "text") {
        const d = Math.max(
          -initialStart,
          Math.min(initialDuration - 1, delta)
        );
        const newStart = initialStart + d;
        const newDur = initialDuration - d;
        setTextOverlays((prev) => {
          let changed = false;
          const next = prev.map((o) => {
            if (o.id !== id) return o;
            if (o.start === newStart && o.duration === newDur) return o;
            changed = true;
            return { ...o, start: newStart, duration: newDur };
          });
          return changed ? next : prev;
        });
        return;
      }

      const d = Math.max(
        -initialTrim,
        Math.min(initialDuration - 1, delta)
      );
      const newStart = initialStart + d;
      const newDur = initialDuration - d;
      const newTrim = initialTrim + d;
      if (kind === "clip") {
        setClips((prev) => {
          let changed = false;
          const next = prev.map((c) => {
            if (c.id !== id) return c;
            if (
              c.start === newStart &&
              c.duration === newDur &&
              (c.trimStart ?? 0) === newTrim
            ) {
              return c;
            }
            changed = true;
            return { ...c, start: newStart, duration: newDur, trimStart: newTrim };
          });
          return changed ? next : prev;
        });
      } else {
        setAudioTracks((prev) => {
          let changed = false;
          const next = prev.map((a) => {
            if (a.id !== id) return a;
            if (
              a.start === newStart &&
              a.duration === newDur &&
              (a.trimStart ?? 0) === newTrim
            ) {
              return a;
            }
            changed = true;
            return { ...a, start: newStart, duration: newDur, trimStart: newTrim };
          });
          return changed ? next : prev;
        });
      }
    };
    const onUp = () => {
      const shouldResume = resumeAfterClipResizeRef.current;
      resumeAfterClipResizeRef.current = false;
      setResizeDragging(null);
      if (!shouldResume || previewMode !== "live") return;
      const player = playerRef.current;
      if (!player) return;
      const frame = clampFrameToTimeline(currentFrameRef.current);
      playActionFrameRef.current = frame;
      safeSeekPlayer(player, frame);
      setCurrentFrame((prev) => (prev === frame ? prev : frame));
      setPlaybackFrame((prev) => (prev === frame ? prev : frame));
      void player.play();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizeDragging, previewMode, clampFrameToTimeline, safeSeekPlayer]);

  useEffect(() => {
    if (!trackContextMenu) return;
    const close = (e: Event) => {
      const t = e.target;
      if (
        t instanceof Node &&
        trackMenuRef.current?.contains(t)
      ) {
        return;
      }
      setTrackContextMenu(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [trackContextMenu]);

  useEffect(() => {
    if (!dragging || resizeDragging) return;
    let rafId = 0;
    let lastClientX = dragging.startClientX;
    let lastEdge: "left" | "right" | null = null;
    let lastAppliedStart = dragging.initialStart;
    const hoverOffsetFromDraggedStart =
      dragging.kind === "clip" && hoverFrameRef.current != null
        ? hoverFrameRef.current - dragging.initialStart
        : null;

    const updateEdgeIndicator = (next: "left" | "right" | null) => {
      if (next === lastEdge) return;
      lastEdge = next;
      setDragEdgeIndicator(next);
    };

    const applyDragFrame = () => {
      rafId = 0;
      const sc = timelineScrollRef.current;
      if (sc) {
        const rect = sc.getBoundingClientRect();
        const edgePanZone = 56;
        const outsideBoostZone = 48;
        const maxPanSpeed = 26;
        const minPanSpeed = 3;
        if (lastClientX <= rect.left + edgePanZone) {
          updateEdgeIndicator("left");
          const edgeDistance = Math.max(0, lastClientX - rect.left);
          const outsideDistance = Math.max(0, rect.left - lastClientX);
          const insideT = 1 - edgeDistance / edgePanZone;
          const outsideT = Math.min(1, outsideDistance / outsideBoostZone);
          const intensity = Math.max(insideT * insideT, 0.55 + outsideT * 0.45);
          const panStep = Math.max(
            minPanSpeed,
            Math.round(maxPanSpeed * intensity)
          );
          sc.scrollLeft = Math.max(0, sc.scrollLeft - panStep);
        } else if (lastClientX >= rect.right - edgePanZone) {
          updateEdgeIndicator("right");
          const edgeDistance = Math.max(0, rect.right - lastClientX);
          const outsideDistance = Math.max(0, lastClientX - rect.right);
          const insideT = 1 - edgeDistance / edgePanZone;
          const outsideT = Math.min(1, outsideDistance / outsideBoostZone);
          const intensity = Math.max(insideT * insideT, 0.55 + outsideT * 0.45);
          const panStep = Math.max(
            minPanSpeed,
            Math.round(maxPanSpeed * intensity)
          );
          sc.scrollLeft = sc.scrollLeft + panStep;
        } else {
          updateEdgeIndicator(null);
        }
      }

      const scrollDelta =
        (timelineScrollRef.current?.scrollLeft ?? 0) - dragging.initialScrollLeft;
      const delta = Math.round(
        (lastClientX - dragging.startClientX + scrollDelta) / PX_PER_FRAME
      );
      const newStart = Math.max(0, dragging.initialStart + delta);
      if (newStart === lastAppliedStart) {
        return;
      }
      lastAppliedStart = newStart;
      if (dragging.kind === "clip") {
        const clipBase = clipDragSnapshotRef.current ?? editorStateRef.current.clips;
        const pointerFrame = frameFromClientX(lastClientX);
        const nextInsertFrame = computeTrackInsertFrame(
          clipBase,
          dragging.id,
          pointerFrame
        );
        setClipDragInsertFrame((prev) =>
          prev === nextInsertFrame ? prev : nextInsertFrame
        );
        if (hoverOffsetFromDraggedStart != null) {
          setHoverFrame(Math.max(0, Math.floor(newStart + hoverOffsetFromDraggedStart)));
        }
      } else if (dragging.kind === "audio") {
        setClipDragInsertFrame((prev) => (prev === null ? prev : null));
        setAudioTracks((prev) => {
          let changed = false;
          const next = prev.map((track) => {
            if (track.id !== dragging.id) return track;
            if (track.start === newStart) return track;
            changed = true;
            return { ...track, start: newStart };
          });
          if (!changed) return prev;
          return [...next].sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            return a.id.localeCompare(b.id);
          });
        });
      } else {
        setClipDragInsertFrame((prev) => (prev === null ? prev : null));
        setTextOverlays((prev) => realignTrackAfterMove(prev, dragging.id, newStart));
      }
    };

    const onMove = (e: MouseEvent) => {
      lastClientX = e.clientX;
      if (rafId) return;
      rafId = window.requestAnimationFrame(applyDragFrame);
    };
    const onUp = () => {
      if (dragging.kind === "clip") {
        const clipBase = clipDragSnapshotRef.current ?? editorStateRef.current.clips;
        const pointerFrame = frameFromClientX(lastClientX);
        const targetInsertFrame = computeTrackInsertFrame(
          clipBase,
          dragging.id,
          pointerFrame
        );
        if (targetInsertFrame != null) {
          setClips((prev) =>
            realignTrackAfterMove(prev, dragging.id, targetInsertFrame)
          );
        }
      } else if (dragging.kind === "audio") {
        const requestedStart = Math.max(0, Math.floor(lastAppliedStart));
        setAudioTracks((prev) => {
          let changed = false;
          const next = prev.map((track) => {
            if (track.id !== dragging.id) return track;
            if (track.start === requestedStart) return track;
            changed = true;
            return { ...track, start: requestedStart };
          });
          if (!changed) return prev;
          return [...next].sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            return a.id.localeCompare(b.id);
          });
        });
      }
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      setDragging(null);
      setDragEdgeIndicator(null);
      setClipDragInsertFrame(null);
      clipDragSnapshotRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      setDragEdgeIndicator(null);
      setClipDragInsertFrame(null);
      clipDragSnapshotRef.current = null;
    };
  }, [dragging, resizeDragging, realignTrackAfterMove, computeTrackInsertFrame, frameFromClientX]);

  useEffect(() => {
    if (!dragging) return;
    setHoverFrame((prev) => (prev === null ? prev : null));
  }, [dragging]);

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (topMenuRef.current && target && !topMenuRef.current.contains(target)) {
        setIsMoreMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [isMoreMenuOpen]);

  // Keep timeline/playhead text tightly synced with preview frame.
  // RAF avoids timer drift/jank that can happen with fixed setInterval under load.
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      if (!playheadScrubbingRef.current && previewMode === "cached") {
        const chunk = activeCachedChunk;
        const video = cachedVideoRef.current;
        if (chunk && video) {
          const nextFrame = Math.max(
            chunk.startFrame,
            Math.min(
              chunk.endFrame - 1,
              chunk.startFrame + Math.floor(video.currentTime * FPS)
            )
          );
          if (nextFrame !== currentFrameRef.current) {
            setPlaybackFrame((prev) => (prev === nextFrame ? prev : nextFrame));
            if (!previewIsPlaying) {
              setCurrentFrame((prev) => (prev === nextFrame ? prev : nextFrame));
            }
            playActionFrameRef.current = nextFrame;
          }
        }
      } else if (!playheadScrubbingRef.current && playerRef.current) {
        const player = playerRef.current;
        const frame = player.getCurrentFrame();
        if (frame !== null) {
          // Floor avoids frame-boundary oscillation (N <-> N+1) from float sampling.
          let nextFrame = Math.max(0, Math.floor(frame));
          const isPlaying = player.isPlaying();
          // While actively playing, prevent tiny backward jitter from causing replay.
          if (isPlaying) {
            nextFrame = Math.max(nextFrame, currentFrameRef.current);
          } else {
            const endFrame = Math.max(0, Math.max(1, totalDurationRef.current) - 1);
            // Some playback backends report frame 0 right after reaching end.
            // Keep the visible playhead pinned to timeline end until user acts.
            const stoppedAtEndReset =
              currentFrameRef.current >= Math.max(0, endFrame - 1) && nextFrame <= 1;
            if (stoppedAtEndReset) {
              nextFrame = endFrame;
            }
          }
          // Throttle UI playhead updates while playing to reduce main-thread churn and
          // avoid visible cursor "stick-then-jump" jitter that can retrigger media sync.
          // When timeline audio exists, render less often so audio decode/sync wins CPU.
          if (nextFrame !== currentFrameRef.current) {
            if (isPlaying) {
              const now = performance.now();
              const elapsed = now - lastPlayheadUiSyncMsRef.current;
              const minUiSyncMs = audioTracks.length > 0 ? 120 : 32;
              // Keep cursor updates at a stable cadence and lower update pressure
              // while audio is active to prevent first-play corrective seeks.
              if (elapsed < minUiSyncMs) {
                rafId = requestAnimationFrame(tick);
                return;
              }
              lastPlayheadUiSyncMsRef.current = now;
              setPlaybackFrame((prev) => (prev === nextFrame ? prev : nextFrame));
            } else {
              lastPlayheadUiSyncMsRef.current = performance.now();
              setPlaybackFrame((prev) => (prev === nextFrame ? prev : nextFrame));
              setCurrentFrame((prev) => (prev === nextFrame ? prev : nextFrame));
            }
            playActionFrameRef.current = nextFrame;
          }
          // Detect playhead wrap/loop while playing and surface repeated clip notice.
          if (isPlaying) {
            const prev = clipRepeatRef.current;
            const jumpedBack =
              prev && nextFrame + Math.max(2, FPS / 3) < prev.lastFrame;
            if (jumpedBack) {
              const player = playerRef.current;
              if (player) {
                player.pause();
                const endFrame = Math.max(0, Math.max(1, totalDuration) - 1);
                safeSeekPlayer(player, endFrame);
                setCurrentFrame(endFrame);
                setPlaybackFrame(endFrame);
                playActionFrameRef.current = endFrame;
              }
              clipRepeatRef.current = null;
              rafId = requestAnimationFrame(tick);
              return;
            }
            if (audioTracks.length > 0) {
              clipRepeatRef.current = prev
                ? { ...prev, lastFrame: nextFrame }
                : null;
              rafId = requestAnimationFrame(tick);
              return;
            }
            const activeClip = getPrimaryClipAtFrame(clips, nextFrame);
            if (activeClip) {
              if (!prev || prev.clipId !== activeClip.id) {
                clipRepeatRef.current = {
                  clipId: activeClip.id,
                  repeatCount: 1,
                  lastFrame: nextFrame,
                };
              } else {
                let repeatCount = prev.repeatCount;
                if (jumpedBack) {
                  repeatCount += 1;
                  if (repeatCount > 1) {
                    setPreviewNotice(
                      `Repeat play detected for clip "${activeClip.id}" (${repeatCount}x).`
                    );
                  }
                }
                clipRepeatRef.current = {
                  clipId: activeClip.id,
                  repeatCount,
                  lastFrame: nextFrame,
                };
              }
            } else if (prev) {
              clipRepeatRef.current = { ...prev, lastFrame: nextFrame };
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [activeCachedChunk, clips, previewIsPlaying, previewMode, audioTracks.length]);

  useEffect(() => {
    if (previewMode !== "cached" || !activeCachedChunk) return;
    const video = cachedVideoRef.current;
    if (!video) return;
    let cancelled = false;
    const seekFrame = Math.max(
      activeCachedChunk.startFrame,
      Math.min(activeCachedChunk.endFrame - 1, Math.floor(currentFrameRef.current))
    );
    const targetTime = Math.max(0, (seekFrame - activeCachedChunk.startFrame) / FPS);
    suppressCachedPauseSyncRef.current = true;
    video.pause();
    video.preload = "auto";
    video.src = activeCachedChunk.src;
    const play = async () => {
      try {
        await video.play();
      } catch {
        if (!cancelled) {
          switchToLivePlayback(
            seekFrame,
            "Cached preview chunk failed to play, using live preview.",
            true
          );
        }
      }
    };
    const onLoaded = () => {
      const mediaDuration = Number.isFinite(video.duration)
        ? video.duration
        : targetTime;
      const maxSeekTime =
        mediaDuration > 0 ? Math.max(0, mediaDuration - 0.001) : targetTime;
      video.currentTime = Math.max(0, Math.min(targetTime, maxSeekTime));
      suppressCachedPauseSyncRef.current = false;
      void play();
    };
    video.addEventListener("loadedmetadata", onLoaded);
    if (video.readyState >= 1) {
      onLoaded();
    } else {
      video.load();
    }
    return () => {
      cancelled = true;
      suppressCachedPauseSyncRef.current = false;
      video.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [activeCachedChunk, previewMode, switchToLivePlayback]);

  useEffect(() => {
    if (previewMode !== "cached" || !previewManifest || !activeCachedChunk) {
      preloadedNextChunkRef.current = null;
      return;
    }
    const chunks = previewManifest.chunks ?? [];
    const nextReady = chunks.find(
      (chunk, idx) =>
        idx > activeCachedChunk.chunkIndex &&
        chunk.startFrame <= activeCachedChunk.endFrame &&
        chunk.status === "ready" &&
        Boolean(chunk.outputUrl || chunk.outputPath) &&
        isPlayableCachedSrc(chunk.outputUrl ?? chunk.outputPath ?? "")
    );
    if (!nextReady) {
      preloadedNextChunkRef.current = null;
      return;
    }
    const nextSrc = nextReady.outputUrl ?? nextReady.outputPath ?? "";
    const preloadVideo = document.createElement("video");
    preloadVideo.preload = "auto";
    preloadVideo.src = nextSrc;
    preloadVideo.load();
    preloadedNextChunkRef.current = {
      chunkIndex: chunks.indexOf(nextReady),
      startFrame: nextReady.startFrame,
      endFrame: nextReady.endFrame,
      src: nextSrc,
    };
  }, [activeCachedChunk, previewManifest, previewMode]);

  const continueCachedPlayback = useCallback(async () => {
    if (previewMode !== "cached" || !previewManifest || !activeCachedChunk) return;
    const preloadedNext = preloadedNextChunkRef.current;
    if (
      preloadedNext &&
      preloadedNext.chunkIndex > activeCachedChunk.chunkIndex &&
      preloadedNext.startFrame <= activeCachedChunk.endFrame
    ) {
      setActiveCachedChunk(preloadedNext);
      preloadedNextChunkRef.current = null;
      return;
    }
    const findNextReadyChunk = (manifest: CachedPreviewManifest) => {
      const chunks = manifest.chunks ?? [];
      const nextReady = chunks.find(
        (chunk, idx) =>
          idx > activeCachedChunk.chunkIndex &&
          chunk.startFrame <= activeCachedChunk.endFrame &&
          chunk.status === "ready" &&
          Boolean(chunk.outputUrl || chunk.outputPath) &&
          isPlayableCachedSrc(chunk.outputUrl ?? chunk.outputPath ?? "")
      );
      return { chunks, nextReady };
    };

    let { chunks, nextReady } = findNextReadyChunk(previewManifest);
    if (!nextReady) {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      const refreshedManifest = await fetchPreviewManifest();
      if (refreshedManifest) {
        setPreviewManifest(refreshedManifest);
        ({ chunks, nextReady } = findNextReadyChunk(refreshedManifest));
      }
    }

    if (!nextReady) {
      switchToLivePlayback(
        activeCachedChunk.endFrame,
        "Cached preview missing next chunk, using live preview.",
        true
      );
      return;
    }
    setActiveCachedChunk({
      chunkIndex: chunks.indexOf(nextReady),
      startFrame: nextReady.startFrame,
      endFrame: nextReady.endFrame,
      src: nextReady.outputUrl ?? nextReady.outputPath ?? "",
    });
    const src = nextReady.outputUrl ?? nextReady.outputPath ?? "";
    const prev = cachedRepeatRef.current;
    if (src && prev && prev.src === src && prev.startFrame === nextReady.startFrame) {
      const repeatCount = prev.repeatCount + 1;
      cachedRepeatRef.current = {
        src,
        startFrame: nextReady.startFrame,
        repeatCount,
      };
      if (repeatCount > 1 && audioTracks.length === 0) {
        setPreviewNotice(`Repeat play detected for this clip (${repeatCount}x).`);
      }
    } else if (src) {
      cachedRepeatRef.current = {
        src,
        startFrame: nextReady.startFrame,
        repeatCount: 1,
      };
    }
  }, [
    activeCachedChunk,
    fetchPreviewManifest,
    previewManifest,
    previewMode,
    audioTracks.length,
    switchToLivePlayback,
  ]);

  const handlePreviewPlayToggle = useCallback(async () => {
    if (previewPlayToggleInFlightRef.current) return;
    previewPlayToggleInFlightRef.current = true;
    try {
      if (!previewPlayerReady) return;
      const timelineEndFrame = Math.max(0, Math.floor(totalDurationRef.current) - 1);
      const requestedStart = Math.max(
        0,
        Math.floor(previewIsPlaying ? playbackFrame : currentFrameRef.current)
      );
      // If playback had reached timeline end, pressing Play should restart from 0.
      const startFrame =
        requestedStart >= timelineEndFrame && timelineEndFrame > 0
          ? 0
          : requestedStart;
      playActionFrameRef.current = startFrame;
      const hasTimelineAudio = audioTracks.length > 0;
      if (preferLivePreview) {
        if (previewMode === "cached") {
          switchToLivePlayback(startFrame, undefined, false);
          return;
        }
        const player = playerRef.current;
        if (!player) return;
        if (player.isPlaying()) {
          player.pause();
          return;
        }
        if (hasTimelineAudio) {
          await ensureTimelineAudioPrefetchReady();
        }
        safeSeekPlayer(player, startFrame);
        setCurrentFrame(startFrame);
        setPlaybackFrame(startFrame);
        void player.play();
        return;
      }
      if (previewMode === "cached") {
        if (hasTimelineAudio) {
          switchToLivePlayback(
            currentFrameRef.current,
            "Audio layers require live preview playback."
          );
          const livePlayer = playerRef.current;
          if (livePlayer) {
            await ensureTimelineAudioPrefetchReady();
            const next = Math.max(0, Math.floor(playActionFrameRef.current));
            safeSeekPlayer(livePlayer, next);
            setCurrentFrame(next);
            setPlaybackFrame(next);
            void livePlayer.play();
          }
          return;
        }
        const video = cachedVideoRef.current;
        if (!video) {
          switchToLivePlayback(startFrame, undefined, false);
          return;
        }
        if (previewIsPlaying) {
          video.pause();
        } else {
          const manifest = previewManifest ?? (await requestPreviewRender());
          const startedCached = await tryStartCachedPreviewPlayback(manifest, startFrame);
          if (!startedCached) {
            switchToLivePlayback(
              startFrame,
              "Unable to start cached preview from start, using live preview.",
              true
            );
            return;
          }
        }
        return;
      }
      const player = playerRef.current;
      if (!player) return;
      if (player.isPlaying()) {
        player.pause();
        return;
      }
      if (hasTimelineAudio) {
        await ensureTimelineAudioPrefetchReady();
        safeSeekPlayer(player, startFrame);
        setCurrentFrame(startFrame);
        setPlaybackFrame(startFrame);
        void player.play();
        return;
      }
      const freshManifest = await requestPreviewRender();
      const startedCached = await tryStartCachedPreviewPlayback(freshManifest, startFrame);
      if (!startedCached) {
        setPreviewNotice("Rendering preview in background, playing live.");
        safeSeekPlayer(player, startFrame);
        setCurrentFrame(startFrame);
        setPlaybackFrame(startFrame);
        void player.play();
      }
    } finally {
      previewPlayToggleInFlightRef.current = false;
    }
  }, [
    previewManifest,
    previewIsPlaying,
    previewMode,
    previewPlayerReady,
    audioTracks.length,
    requestPreviewRender,
    ensureTimelineAudioPrefetchReady,
    preferLivePreview,
    switchToLivePlayback,
    timelineAudioSrcPrefetchKey,
    tryStartCachedPreviewPlayback,
  ]);

  useEffect(() => {
    if (!preferLivePreview) return;
    if (previewMode !== "cached") return;
    switchToLivePlayback(currentFrameRef.current, undefined, false);
  }, [preferLivePreview, previewMode, switchToLivePlayback]);

  const pauseMainPreviewPlayback = useCallback(() => {
    cachedVideoRef.current?.pause();
    playerRef.current?.pause();
  }, []);

  // Effect for checking mobile view
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const contextActionFlags = useMemo(() => {
    const empty = {
      canSplit: false,
      canTrimHead: false,
      canTrimTail: false,
      canJoinNext: false,
      canJoinPrev: false,
    };
    if (!trackContextMenu) return empty;
    const { kind, id } = trackContextMenu;
    const f = Math.floor(currentFrame);
    let canSplit = false;
    let canTrimHead = false;
    let canTrimTail = false;
    if (kind === "clip") {
      const c = clips.find((x) => x.id === id);
      if (c) {
        canSplit = f > c.start && f < c.start + c.duration;
        canTrimHead = f > c.start && f < c.start + c.duration;
        canTrimTail = f > c.start && f < c.start + c.duration;
      }
    } else if (kind === "audio") {
      const a = audioTracks.find((x) => x.id === id);
      if (a) {
        canSplit = f > a.start && f < a.start + a.duration;
        canTrimHead = f > a.start && f < a.start + a.duration;
        canTrimTail = f > a.start && f < a.start + a.duration;
      }
    } else {
      const t = textOverlays.find((x) => x.id === id);
      if (t) {
        canSplit = f > t.start && f < t.start + t.duration;
        canTrimHead = f > t.start && f < t.start + t.duration;
        canTrimTail = f > t.start && f < t.start + t.duration;
      }
    }

    let canJoinNext = false;
    let canJoinPrev = false;
    if (kind === "clip") {
      const sorted = [...clips].sort((a, b) => a.start - b.start);
      const i = sorted.findIndex((c) => c.id === id);
      if (i >= 0 && i < sorted.length - 1) {
        const a = sorted[i];
        const b = sorted[i + 1];
        canJoinNext =
          b.start === a.start + a.duration &&
          a.src === b.src &&
          (b.trimStart ?? 0) === (a.trimStart ?? 0) + a.duration;
      }
      if (i > 0) {
        const a = sorted[i - 1];
        const b = sorted[i];
        canJoinPrev =
          b.start === a.start + a.duration &&
          a.src === b.src &&
          (b.trimStart ?? 0) === (a.trimStart ?? 0) + a.duration;
      }
    } else if (kind === "audio") {
      const sorted = [...audioTracks].sort((a, b) => a.start - b.start);
      const i = sorted.findIndex((x) => x.id === id);
      if (i >= 0 && i < sorted.length - 1) {
        const a = sorted[i];
        const b = sorted[i + 1];
        canJoinNext =
          b.start === a.start + a.duration &&
          a.src === b.src &&
          (b.trimStart ?? 0) === (a.trimStart ?? 0) + a.duration;
      }
      if (i > 0) {
        const a = sorted[i - 1];
        const b = sorted[i];
        canJoinPrev =
          b.start === a.start + a.duration &&
          a.src === b.src &&
          (b.trimStart ?? 0) === (a.trimStart ?? 0) + a.duration;
      }
    } else {
      const sorted = [...textOverlays].sort((a, b) => a.start - b.start);
      const i = sorted.findIndex((t) => t.id === id);
      if (i >= 0 && i < sorted.length - 1) {
        const a = sorted[i];
        const b = sorted[i + 1];
        canJoinNext =
          b.start === a.start + a.duration && a.row === b.row;
      }
      if (i > 0) {
        const a = sorted[i - 1];
        const b = sorted[i];
        canJoinPrev =
          b.start === a.start + a.duration && a.row === b.row;
      }
    }

    return {
      canSplit,
      canTrimHead,
      canTrimTail,
      canJoinNext,
      canJoinPrev,
    };
  }, [trackContextMenu, currentFrame, clips, audioTracks, textOverlays]);

  // Render mobile view message if on a mobile device
  if (isMobile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6 text-slate-800">
        <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center">
          <h2 className="mb-2 text-xl font-bold text-slate-900">
            Open on a larger screen
          </h2>
          <p className="text-sm leading-relaxed text-slate-600">
            This editor uses a desktop-style timeline and canvas, similar to
            Canva Video. Please use a laptop or desktop browser.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
  return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-8 text-center text-slate-800">
        <p className="max-w-sm text-sm text-slate-600">
          This project is missing or the link is invalid. It may have been
          deleted or opened from another browser profile.
        </p>
      </div>
    );
  }

  const videoLaneClips = clips.filter(
    (c) =>
      c.row !== AUDIO_TRACK_ROW &&
      c.row !== TEXT_TRACK_ROW &&
      c.row !== SHAPE_TRACK_ROW
  );
  const recentUploadedVideos = uploadedMediaItems;
  const recentUploadedAudios = uploadedAudioItems;
  const hasMediaTrackBars = videoLaneClips.length > 0;
  const hasElementTrackBars = textOverlays.length > 0;
  const hasAudioTrackBars = audioTracks.length > 0;

  const currentTimeLabel = formatClockFromFrames(activeFrame, FPS);
  const totalTimeLabel = formatClockFromFrames(totalDuration, FPS);
  const diagnostics = {
    previewMode,
    previewIsPlaying,
    activeFrame,
    playActionFrame: playActionFrameRef.current,
    totalDuration,
    activeCachedChunk,
    videoClipCount: normalizedVideoLayers.length,
    audioTrackCount: audioTracks.length,
    audioLayerCount: normalizedAudioLayers.length,
    videoAudioForcedMuted: normalizedAudioLayers.length > 0,
    audioTrackIds: audioTracks.map((a) => a.id),
    audioTrackStarts: audioTracks.map((a) => a.start),
    audioTrackDurations: audioTracks.map((a) => a.duration),
    audioTrackSources: audioTracks.map((a) => a.src),
  };
  const diagnosticsSelection =
    selected ??
    (trackContextMenu &&
    (trackContextMenu.kind === "audio" || trackContextMenu.kind === "clip")
      ? { kind: trackContextMenu.kind, id: trackContextMenu.id }
      : null);
  const selectedTimelineDiagnostics =
    diagnosticsSelection?.kind === "audio"
      ? (() => {
          const track = audioTracks.find((a) => a.id === diagnosticsSelection.id);
          if (!track) return null;
          return {
            selectedKind: "audio",
            id: track.id,
            label: track.label,
            src: track.src,
            start: track.start,
            duration: track.duration,
            trimStart: track.trimStart ?? 0,
            row: track.row,
            volume: track.volume ?? 1,
            fadeInFrames: track.fadeInFrames ?? 0,
            fadeOutFrames: track.fadeOutFrames ?? 0,
            playback: {
              previewMode,
              previewIsPlaying,
              activeFrame,
              playActionFrame: playActionFrameRef.current,
              startsInFrames: track.start - activeFrame,
              endsInFrames: track.start + track.duration - activeFrame,
            },
          };
        })()
      : diagnosticsSelection?.kind === "clip"
        ? (() => {
            const clip = clips.find((c) => c.id === diagnosticsSelection.id);
            if (!clip) return null;
            return {
              selectedKind: "video",
              id: clip.id,
              src: clip.src,
              start: clip.start,
              duration: clip.duration,
              trimStart: clip.trimStart ?? 0,
              row: clip.row,
              mutedBecauseAudioLayersExist: normalizedAudioLayers.length > 0,
              playback: {
                previewMode,
                previewIsPlaying,
                activeFrame,
                playActionFrame: playActionFrameRef.current,
                startsInFrames: clip.start - activeFrame,
                endsInFrames: clip.start + clip.duration - activeFrame,
              },
            };
          })()
        : null;

  return (
    <div className="relative flex h-[100dvh] min-h-0 w-full overflow-hidden bg-white text-slate-800">
      <div ref={topMenuRef} className="absolute right-4 top-3 z-[200] flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={() => setIsPreviewFullscreen((prev) => !prev)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
          aria-label={isPreviewFullscreen ? "Exit preview fullscreen" : "Enter preview fullscreen"}
          title={isPreviewFullscreen ? "Exit preview fullscreen" : "Enter preview fullscreen"}
        >
          {isPreviewFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setIsMoreMenuOpen((prev) => !prev)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
          aria-label="More editor options"
          title="More editor options"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {isMoreMenuOpen ? (
          <div className="absolute right-0 top-[calc(100%+6px)] min-w-[170px] rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 shadow-md">
            <label className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={autoSaveEnabled}
                onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              />
              Auto Save
            </label>
            <label className="mt-1 flex items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={preferLivePreview}
                onChange={(e) => setPreferLivePreview(e.target.checked)}
              />
              Live Preview
            </label>
          </div>
        ) : null}
      </div>
      <input
        ref={videoUploadInputRef}
        type="file"
        accept="video/*,image/*"
        multiple
        className="hidden"
        aria-hidden
        onChange={onMediaFileChange}
      />
      <input
        ref={audioUploadInputRef}
        type="file"
        accept=".mp3,.wav,.aac,.m4a,.ogg,.flac,audio/mpeg,audio/wav,audio/aac,audio/ogg,audio/flac"
        multiple
        className="hidden"
        aria-hidden
        onChange={onMediaFileChange}
      />
      {!isPreviewFullscreen ? (
        <EditorWorkspaceSidebar navPanel={navPanel} onNavigate={setNavPanel} />
      ) : null}

      {/* Column 2: tool/source UI + timeline layer properties */}
      {!isPreviewFullscreen ? (
        <div
          className={`${
            isSamplesPanelVisible ? "flex w-[min(100%,380px)]" : "hidden w-0"
          } relative shrink-0 flex-col overflow-visible border-r border-slate-200 bg-white min-h-0`}
        >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            className={
              navPanel === "audios" || navPanel === "videos" || navPanel === "giffy"
                ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                : "min-h-0 flex-1 overflow-y-auto"
            }
          >
            {/* Keep mounted when switching workspace tabs so search + loaded samples persist */}
            <div
              className={
                navPanel === "videos"
                  ? "flex h-full min-h-0 min-w-0 flex-1 flex-col"
                  : "hidden"
              }
              aria-hidden={navPanel !== "videos"}
            >
              <VideosLibraryPanel
                onAddSampleVideo={(src, durationSec, meta) =>
                  insertVideoFileAtPlayhead(
                    src,
                    secondsToFrames(durationSec, DEFAULT_INSERT_VIDEO_FRAMES),
                    meta,
                  )
                }
              />
            </div>
            {/* Keep mounted when switching workspace tabs so loaded audio samples persist */}
            <div
              className={
                navPanel === "audios"
                  ? "flex h-full min-h-0 min-w-0 flex-1 flex-col"
                  : "hidden"
              }
              aria-hidden={navPanel !== "audios"}
            >
              <AudiosLibraryPanel
                audioTracks={audioTracks}
                selectedAudioId={
                  selected?.kind === "audio" ? selected.id : null
                }
                fps={FPS}
                onSelectAudio={(id) => setSelected({ kind: "audio", id })}
                onSeekToFrame={(frame) =>
                  safeSeekPlayer(playerRef.current, frame)
                }
                onAddSampleAudio={addSampleAudioToTimeline}
                mainPreviewIsPlaying={previewIsPlaying}
                onPauseMainPlayback={pauseMainPreviewPlayback}
              />
            </div>
            {/* Keep mounted when switching workspace tabs so loaded GIF samples persist */}
            <div
              className={
                navPanel === "giffy"
                  ? "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                  : "hidden"
              }
              aria-hidden={navPanel !== "giffy"}
            >
              <MediaExplorerModal
                layout="page"
                isOpen
                onPick={insertExplorerClip}
              />
            </div>
            {navPanel === "text" ? (
              <TextWorkspacePanel onAddText={addTextOverlay} />
            ) : null}
            {navPanel === "tools" ? (
              <ToolsWorkspacePanel
                onAddToTimeline={addShapeTextFromTools}
              />
            ) : null}
            {navPanel === "files" ? (
              <FilesUploadPage
                onPickVideo={() => videoUploadInputRef.current?.click()}
                onPickAudio={() => audioUploadInputRef.current?.click()}
                recentVideos={recentUploadedVideos}
                recentAudios={recentUploadedAudios}
                onAddRecentMedia={(item) => {
                  if ((item.mediaType ?? "video") === "image") {
                    insertImageFileAtPlayhead(item.src, item.label);
                    return;
                  }
                  insertVideoFileAtPlayhead(
                    item.src,
                    secondsToFrames(item.durationSec, DEFAULT_INSERT_VIDEO_FRAMES),
                    {
                      sourceName: item.label,
                      sourceAuthor: item.author,
                    }
                  );
                }}
                onAddRecentAudio={(item) => {
                  insertAudioAtPlayhead(
                    item.src,
                    item.label,
                    secondsToFrames(item.durationSec, DEFAULT_UPLOAD_AUDIO_FRAMES),
                    item.author,
                  );
                }}
              />
            ) : null}
          </div>
        </div>
        </div>
      ) : null}

      {/* Column 3: preview + timeline */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div
          ref={previewTimelineContainerRef}
          className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3"
        >
          <div
            className="w-full shrink-0 rounded-xl bg-white px-4 py-2 shadow-sm"
            style={{ height: playbackPaneHeight }}
          >
            <div className="flex min-h-0 h-full flex-col">
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <div
                  ref={previewWrapRef}
                  className="relative min-w-px overflow-hidden bg-slate-100"
                  style={{
                    aspectRatio: "16 / 9",
                    height: "100%",
                    width: "auto",
                    maxWidth: "100%",
                    minHeight: 200,
                  }}
                >
              {previewPlayerReady ? (
                previewMode === "cached" && activeCachedChunk ? (
                  <video
                    ref={cachedVideoRef}
                    className="h-full w-full object-contain"
                    playsInline
                    muted={false}
                    onPlay={() => setPreviewIsPlaying(true)}
                    onPause={() => {
                      setPreviewIsPlaying(false);
                      if (suppressCachedPauseSyncRef.current) return;
                      const chunk = activeCachedChunk;
                      const video = cachedVideoRef.current;
                      if (chunk && video) {
                        const pausedFrame = chunk.startFrame + Math.floor(video.currentTime * FPS);
                        playActionFrameRef.current = Math.max(0, pausedFrame);
                        setCurrentFrame(Math.max(0, pausedFrame));
                        setPlaybackFrame(Math.max(0, pausedFrame));
                      }
                    }}
                    onEnded={continueCachedPlayback}
                    onError={() =>
                      switchToLivePlayback(
                        currentFrameRef.current,
                        "Cached preview chunk failed to load, using live preview.",
                        true
                      )
                    }
                  />
                ) : (
                  <Player
                    ref={playerRef}
                    component={Composition}
                    durationInFrames={Math.max(1, totalDuration)}
                    compositionWidth={1920}
                    compositionHeight={1080}
                    controls={false}
                    fps={FPS}
                    acknowledgeRemotionLicense
                    audioLatencyHint="playback"
                    numberOfSharedAudioTags={PREVIEW_NUMBER_OF_SHARED_AUDIO_TAGS}
                    style={{
                      width: "100%",
                      height: "100%",
                      minWidth: 0,
                      minHeight: 0,
                    }}
                    renderLoading={() => (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        Loading preview…
                      </div>
                    )}
                    errorFallback={({ error }) => (
                      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 bg-slate-100 px-4 text-center">
                        <p className="text-sm font-medium text-slate-800">
                          Preview playback issue
                        </p>
                        <p className="max-w-sm text-xs leading-relaxed text-slate-600">
                          The browser could not play or decode the timeline (common after
                          heavy seeking with remote clips). Try Play again, nudge the
                          playhead, or remove the problematic clip.
                        </p>
                        <p className="max-w-full truncate px-2 font-mono text-[10px] text-slate-400">
                          {error.message}
                        </p>
                      </div>
                    )}
                    inputProps={{}}
                  />
                )
              ) : (
                <div className="flex min-h-[200px] w-full flex-1 items-center justify-center text-sm text-slate-500">
                  Loading preview…
            </div>
              )}
              <PreviewInteractionLayer
                wrapRef={previewWrapRef}
                currentFrame={activeFrame}
                clips={clips}
                textOverlays={textOverlays}
                selected={selected}
                onSelect={setSelected}
                onPatchClip={(id, patch) => updateClip(id, patch)}
                onPatchText={(id, patch) => updateTextOverlay(id, patch)}
              />
                </div>
              </div>
            <div className="mt-2 flex items-center justify-center gap-5 pt-2">
              <span className="min-w-[3.5rem] text-right text-xs font-semibold tabular-nums text-slate-500">
                {currentTimeLabel}
              </span>
            <button
                type="button"
                disabled={!previewPlayerReady}
                onClick={() => {
                  void handlePreviewPlayToggle();
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-md transition hover:scale-[1.03] hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-40"
                aria-label={previewIsPlaying ? "Pause preview" : "Play preview"}
              >
                {previewIsPlaying ? (
                  <Pause
                    className="h-5 w-5 shrink-0"
                    fill="currentColor"
                    aria-hidden
                  />
                ) : (
                  <Play
                    className="ml-0.5 h-5 w-5 shrink-0"
                    fill="currentColor"
                    aria-hidden
                  />
                )}
            </button>
              <span className="min-w-[3.5rem] text-xs font-semibold tabular-nums text-slate-500">
                {totalTimeLabel}
              </span>
            </div>
            {previewNotice ? (
              <p className="mt-2 text-center text-xs text-amber-600">{previewNotice}</p>
            ) : null}
            </div>
          </div>
          <div
            className="mt-2 w-full shrink-0 cursor-row-resize touch-none select-none"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize playback and timeline"
            onPointerDown={(e) => {
              e.preventDefault();
              playbackPaneUserResizedRef.current = true;
              playbackResizeStartRef.current = { y: e.clientY, h: playbackPaneHeight };
              setIsPlaybackResizing(true);
            }}
          >
            <div className="mx-auto h-2 w-2 rounded-full bg-slate-300/80 transition-colors hover:bg-slate-400/90" />
          </div>

        <div className="mt-2 min-h-0 flex-1 bg-white px-1 pb-4 pt-3">
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
            <div
              className="flex min-h-0 w-full flex-1 overflow-hidden"
              style={{ minHeight: minTimelinePaneHeight }}
            >
              <div
                ref={timelineScrollRef}
                className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto bg-white"
              >
                <div
                  className="relative shrink-0"
                  style={{ width: effectiveTrackWidthPx }}
                  onPointerMove={(e) => {
                    if (dragging || resizeDragging || playheadScrubbingRef.current) {
                      setHoverFrame((prev) => (prev === null ? prev : null));
                      return;
                    }
                    const target = e.target as HTMLElement | null;
                    if (target?.closest('button[aria-label^="Resize "]')) {
                      setHoverFrame((prev) => (prev === null ? prev : null));
                      return;
                    }
                    const nextHover = frameFromClientX(e.clientX);
                    setHoverFrame((prev) => (prev === nextHover ? prev : nextHover));
                  }}
                  onPointerLeave={() =>
                    setHoverFrame((prev) => (prev === null ? prev : null))
                  }
                >
                  <div
                    className="relative cursor-pointer border-b border-slate-200 bg-white"
                    style={{ height: RULER_H }}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      beginPlayheadScrub(e.clientX);
                    }}
                  >
                    {Array.from(
                      {
                        length:
                          Math.floor(rulerTickSpanFrames / (30 * 2)) + 2,
                      },
                      (_, i) => i * (30 * 2)
                    ).map((frame) => {
                      const isMajorTenSecondMark = frame % (30 * 10) === 0;
                      return (
                        <div
                          key={frame}
                          className={`absolute bottom-0 border-l ${
                            isMajorTenSecondMark
                              ? "top-0 border-slate-200/90"
                              : "top-2 border-slate-200/65"
                          }`}
                          style={{
                            left: TIMELINE_PAD_LEFT + frame * PX_PER_FRAME,
                          }}
                        >
                          {isMajorTenSecondMark ? (
                            <span className="absolute left-1 top-0.5 text-[9px] tabular-nums text-slate-400">
                              {frame === 0 ? "0s" : `${frame / 30}s`}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                    {!timelineHasContent ? (
                      <span
                        className="pointer-events-none absolute right-2 top-0.5 text-[9px] tabular-nums text-slate-400"
                        title="Time at the right edge of the visible timeline width"
                      >
                        {formatSecondsFromFrames(
                          Math.max(0, rulerTickSpanFrames - 1),
                          FPS,
                        )}
                      </span>
                    ) : null}
                  </div>

                  <div
                    className="relative cursor-default border-t border-slate-200 bg-white"
                    style={{ height: tracksBodyHeightPx }}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      if (
                        (e.target as HTMLElement).closest('[role="group"]')
                      ) {
                        return;
                      }
                      setSelected(null);
                      beginPlayheadScrub(e.clientX);
                    }}
                    role="presentation"
                  >
                    {dragging && dragEdgeIndicator ? (
                      <div
                        className={`pointer-events-none absolute bottom-0 top-0 z-40 w-2 transition-opacity ${
                          dragEdgeIndicator === "left"
                            ? "left-0 bg-gradient-to-r from-violet-400/70 to-transparent"
                            : "right-0 bg-gradient-to-l from-violet-400/70 to-transparent"
                        }`}
                      />
                    ) : null}
                    <div
                      className="pointer-events-none absolute inset-0 z-0"
                style={{
                        backgroundImage: [
                          `linear-gradient(to bottom, transparent ${trackRowMetrics.videoTop + trackRowMetrics.videoRowH - 1}px, rgba(226,232,240,0.9) ${trackRowMetrics.videoTop + trackRowMetrics.videoRowH - 1}px, rgba(226,232,240,0.9) ${trackRowMetrics.videoTop + trackRowMetrics.videoRowH}px, transparent ${trackRowMetrics.videoTop + trackRowMetrics.videoRowH}px)`,
                          `linear-gradient(to bottom, transparent ${trackRowMetrics.audioTop + trackRowMetrics.audioRowH - 1}px, rgba(226,232,240,0.9) ${trackRowMetrics.audioTop + trackRowMetrics.audioRowH - 1}px, rgba(226,232,240,0.9) ${trackRowMetrics.audioTop + trackRowMetrics.audioRowH}px, transparent ${trackRowMetrics.audioTop + trackRowMetrics.audioRowH}px)`,
                          `linear-gradient(to bottom, transparent ${trackRowMetrics.textTop + trackRowMetrics.textRowH - 1}px, rgba(226,232,240,0.9) ${trackRowMetrics.textTop + trackRowMetrics.textRowH - 1}px, rgba(226,232,240,0.9) ${trackRowMetrics.textTop + trackRowMetrics.textRowH}px, transparent ${trackRowMetrics.textTop + trackRowMetrics.textRowH}px)`,
                        ].join(", "),
                      }}
                    />
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-10 border-t border-slate-200/90"
                      style={{ top: Math.max(0, trackRowMetrics.videoTop - 1) }}
                    />
                    {!hasElementTrackBars ? (
                      <button
                        type="button"
                        className="absolute left-3 z-40 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                        style={{
                          top:
                            trackRowMetrics.textTop +
                            trackRowMetrics.elementsBlockH / 2,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => {
                          setIsPreviewFullscreen(false);
                          setIsSamplesPanelVisible(true);
                          setNavPanel("text");
                        }}
                      >
                        <Shapes className="h-3.5 w-3.5" />
                        Add Elements
                      </button>
                    ) : null}
                    {!hasMediaTrackBars ? (
                      <button
                        type="button"
                        className="absolute left-3 z-40 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                        style={{
                          top:
                            trackRowMetrics.videoTop +
                            trackRowMetrics.videoRowH / 2,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => {
                          setIsPreviewFullscreen(false);
                          setIsSamplesPanelVisible(true);
                          setNavPanel("videos");
                        }}
                      >
                        <Clapperboard className="h-3.5 w-3.5" />
                        Add Media
                      </button>
                    ) : null}
                    {!hasAudioTrackBars ? (
                      <button
                        type="button"
                        className="absolute left-3 z-40 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                        style={{
                          top:
                            trackRowMetrics.audioTop +
                            trackRowMetrics.audioRowH / 2,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => {
                          setIsPreviewFullscreen(false);
                          setIsSamplesPanelVisible(true);
                          setNavPanel("audios");
                        }}
                      >
                        <Mic2 className="h-3.5 w-3.5" />
                        Add Audio
                      </button>
                    ) : null}
                    {(() => {
                      const mediaBarH = MEDIA_ITEM_H;
                      const mediaLaneTop =
                        trackRowMetrics.videoTop +
                        Math.max(
                          2,
                          Math.floor((trackRowMetrics.videoRowH - mediaBarH) / 2)
                        );
                      return (
                        <div
                          className="absolute left-0 right-0 z-20"
                          style={{ top: mediaLaneTop, height: mediaBarH }}
                        >
                          {dragging?.kind === "clip" && clipDragInsertFrame !== null ? (
                            <div
                              className="pointer-events-none absolute z-30 w-[2px] rounded-full bg-violet-500/90 shadow-[0_0_0_1px_rgba(255,255,255,0.8)]"
                              style={{
                                left:
                                  TIMELINE_PAD_LEFT +
                                  clipDragInsertFrame * PX_PER_FRAME -
                                  1,
                                top: 2,
                                bottom: 2,
                              }}
                            />
                          ) : null}
                          {clips.map((clip) => {
                      const isSel =
                        selected?.kind === "clip" && selected.id === clip.id;
                      const isDraggingClip =
                        dragging?.kind === "clip" && dragging.id === clip.id;
                      const isClipDragActive = dragging?.kind === "clip";
                      const w = Math.max(
                        RESIZE_HANDLE_W * 2 + 8,
                        clip.duration * PX_PER_FRAME - TIMELINE_GAP_PX
                      );
                      const barH = mediaBarH;
                      const clipBarText = clipBarDisplayTitle(
                        clip.sourceName,
                        clip.sourceAuthor,
                        clip.overlayClip
                          ? clip.mediaType === "image"
                            ? stableBarFallback(clip.id, "Photo")
                            : stableBarFallback(clip.id, "GIF")
                          : stableBarFallback(clip.id, "Video"),
                      );
                      return (
                        <div
                          key={clip.id}
                          role="group"
                          aria-label={clipBarText}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            focusTimelineItem("clip", clip.id);
                            setTrackContextMenu({
                              kind: "clip",
                              id: clip.id,
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          className={`absolute z-20 flex overflow-hidden border-2 ${
                            clip.overlayClip
                              ? "bg-gradient-to-br from-teal-300 to-cyan-400"
                              : "bg-gradient-to-br from-violet-300 to-purple-400"
                          } ${
                            clip.fromAI
                              ? "border-amber-300"
                              : ""
                          } ${
                            isSel
                              ? "border-violet-300"
                              : "border-white/30"
                          } ${
                            isClipDragActive && !isDraggingClip ? "opacity-45" : "opacity-100"
                          }`}
                          style={{
                            left:
                              TIMELINE_PAD_LEFT + clip.start * PX_PER_FRAME,
                            width: w,
                            top: 0,
                            height: barH,
                            borderRadius: TRACK_ITEM_RADIUS,
                            willChange:
                              dragging?.kind === "clip" && dragging.id === clip.id
                                ? "left"
                                : undefined,
                            transform:
                              dragging?.kind === "clip" && dragging.id === clip.id
                                ? "translateZ(0)"
                                : undefined,
                          }}
                        >
                          <button
                            type="button"
                            aria-label="Resize clip start"
                            className="z-30 shrink-0 cursor-ew-resize border-r border-white/25 bg-black/20 hover:bg-black/35"
                            style={{ width: RESIZE_HANDLE_W }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setResizeDragging({
                                kind: "clip",
                                id: clip.id,
                                edge: "left",
                                startClientX: e.clientX,
                                initialStart: clip.start,
                                initialDuration: clip.duration,
                                initialTrim: clip.trimStart ?? 0,
                              });
                            }}
                          />
                          <div
                            role="button"
                            tabIndex={0}
                            className="flex min-w-0 flex-1 cursor-grab items-center justify-start active:cursor-grabbing"
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              e.preventDefault();
                              const clickedFrame = frameFromClientX(e.clientX);
                              if (previewMode === "cached") {
                                switchToLivePlayback(clickedFrame);
                              }
                              const player = playerRef.current;
                              if (player) {
                                player.pause();
                                safeSeekPlayer(player, clickedFrame);
                              }
                              playActionFrameRef.current = clickedFrame;
                              setCurrentFrame(clickedFrame);
                              setPlaybackFrame(clickedFrame);
                              setHoverFrame(clickedFrame);
                              // Keep selection from snapping playhead to clip start/end.
                              preservePlayheadOnNextSelectionRef.current = true;
                              setSelected({ kind: "clip", id: clip.id });
                              clipDragSnapshotRef.current = clips.map((c) => ({ ...c }));
                              setDragging({
                                kind: "clip",
                                id: clip.id,
                                startClientX: e.clientX,
                                initialStart: clip.start,
                                initialScrollLeft:
                                  timelineScrollRef.current?.scrollLeft ?? 0,
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                focusTimelineItem("clip", clip.id);
                              }
                            }}
                          >
                            <span
                              className="pointer-events-none min-w-0 max-w-full truncate px-2 text-left text-[10px] font-bold leading-tight text-white drop-shadow-sm"
                              title={clipBarText}
                            >
                              {clipBarText}
                            </span>
                  </div>
                          <button
                            type="button"
                            aria-label="Resize clip end"
                            className="z-30 shrink-0 cursor-ew-resize border-l border-white/25 bg-black/20 hover:bg-black/35"
                            style={{ width: RESIZE_HANDLE_W }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setResizeDragging({
                                kind: "clip",
                                id: clip.id,
                                edge: "right",
                                startClientX: e.clientX,
                                initialStart: clip.start,
                                initialDuration: clip.duration,
                                initialTrim: clip.trimStart ?? 0,
                              });
                            }}
                          />
                </div>
                      );
                    })}
                        </div>
                      );
                    })()}
                    {audioTracks.map((track) => {
                      const isSel =
                        selected?.kind === "audio" && selected.id === track.id;
                      const w = Math.max(
                        RESIZE_HANDLE_W * 2 + 8,
                        track.duration * PX_PER_FRAME - TIMELINE_GAP_PX
                      );
                      const stackSlot = audioStackLayout.get(track.id) ?? {
                        lane: 0,
                        lanes: 1,
                      };
                      const stackGap = trackRowMetrics.audioStackGap;
                      const barH = AUDIO_ITEM_H;
                      const topOffset =
                        trackRowMetrics.audioTop +
                        2 +
                        stackSlot.lane * (barH + stackGap);
                      const audioBarText = clipBarDisplayTitle(
                        track.label,
                        track.sourceAuthor,
                        stableBarFallback(track.id, "Audio"),
                      );
                      return (
                        <div
                          key={track.id}
                          role="group"
                          aria-label={audioBarText}
                          title={audioBarText}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            focusTimelineItem("audio", track.id);
                            setTrackContextMenu({
                              kind: "audio",
                              id: track.id,
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          className={`absolute z-20 flex overflow-hidden border-2 bg-gradient-to-br from-emerald-300 to-teal-400 shadow-md ${
                            isSel
                              ? "border-emerald-300 ring-2 ring-emerald-200 ring-offset-2 ring-offset-white"
                              : "border-white/30"
                          } ${
                            dragging?.kind === "audio" && dragging.id !== track.id
                              ? "opacity-45"
                              : "opacity-100"
                          }`}
                          style={{
                            left:
                              TIMELINE_PAD_LEFT + track.start * PX_PER_FRAME,
                            width: w,
                            top: topOffset,
                            height: barH,
                            borderRadius: TRACK_ITEM_RADIUS,
                            willChange:
                              dragging?.kind === "audio" &&
                              dragging.id === track.id
                                ? "left"
                                : undefined,
                            transform:
                              dragging?.kind === "audio" &&
                              dragging.id === track.id
                                ? "translateZ(0)"
                                : undefined,
                          }}
                        >
                          <button
                            type="button"
                            aria-label="Resize audio start"
                            className="z-30 shrink-0 cursor-ew-resize border-r border-white/25 bg-black/20 hover:bg-black/35"
                            style={{ width: RESIZE_HANDLE_W }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setResizeDragging({
                                kind: "audio",
                                id: track.id,
                                edge: "left",
                                startClientX: e.clientX,
                                initialStart: track.start,
                                initialDuration: track.duration,
                                initialTrim: track.trimStart ?? 0,
                              });
                            }}
                          />
                          <div
                            role="button"
                            tabIndex={0}
                            className="flex min-w-0 flex-1 cursor-grab items-center justify-start active:cursor-grabbing"
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              e.preventDefault();
                              const clickedFrame = frameFromClientX(e.clientX);
                              if (previewMode === "cached") {
                                switchToLivePlayback(clickedFrame);
                              }
                              const player = playerRef.current;
                              if (player) {
                                player.pause();
                                safeSeekPlayer(player, clickedFrame);
                              }
                              playActionFrameRef.current = clickedFrame;
                              setCurrentFrame(clickedFrame);
                              setPlaybackFrame(clickedFrame);
                              setHoverFrame(clickedFrame);
                              preservePlayheadOnNextSelectionRef.current = true;
                              setSelected({ kind: "audio", id: track.id });
                              setDragging({
                                kind: "audio",
                                id: track.id,
                                startClientX: e.clientX,
                                initialStart: track.start,
                                initialScrollLeft:
                                  timelineScrollRef.current?.scrollLeft ?? 0,
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                focusTimelineItem("audio", track.id);
                              }
                            }}
                          >
                            <span className="pointer-events-none min-w-0 max-w-full truncate px-2 text-left text-[10px] font-bold leading-tight text-white drop-shadow-sm">
                              {audioBarText}
                            </span>
                          </div>
                          <button
                            type="button"
                            aria-label="Resize audio end"
                            className="z-30 shrink-0 cursor-ew-resize border-l border-white/25 bg-black/20 hover:bg-black/35"
                            style={{ width: RESIZE_HANDLE_W }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setResizeDragging({
                                kind: "audio",
                                id: track.id,
                                edge: "right",
                                startClientX: e.clientX,
                                initialStart: track.start,
                                initialDuration: track.duration,
                                initialTrim: track.trimStart ?? 0,
                              });
                            }}
                          />
                        </div>
                      );
                    })}
                    {textOverlays.map((overlay) => {
                      const isSel =
                        selected?.kind === "text" && selected.id === overlay.id;
                      const w = Math.max(
                        RESIZE_HANDLE_W * 2 + 8,
                        overlay.duration * PX_PER_FRAME - TIMELINE_GAP_PX
                      );
                      const isShape = (overlay.shapeBackground ?? "none") !== "none";
                      const stackSlot = (
                        isShape ? shapeStackLayout : textOnlyStackLayout
                      ).get(overlay.id) ?? { lane: 0, lanes: 1 };
                      const stackGap = trackRowMetrics.elementsStackGap;
                      const rowTop = isShape
                        ? trackRowMetrics.shapeTop
                        : trackRowMetrics.textTop;
                      const barH = ELEMENTS_ITEM_H;
                      const topOffset =
                        rowTop + 2 + stackSlot.lane * (barH + stackGap);
                      const textName =
                        (overlay.sourceName ?? "").trim() ||
                        overlay.text.trim().replace(/\s+/g, " ").slice(0, 56) ||
                        undefined;
                      const elementBarText = clipBarDisplayTitle(
                        textName,
                        overlay.sourceAuthor,
                        stableBarFallback(
                          overlay.id,
                          isShape ? "Shape" : "Text",
                        ),
                      );
                      return (
                        <div
                    key={overlay.id}
                          role="group"
                          aria-label={elementBarText}
                          title={elementBarText}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            focusTimelineItem("text", overlay.id);
                            setTrackContextMenu({
                              kind: "text",
                              id: overlay.id,
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          className={`absolute z-20 flex overflow-hidden border-2 bg-gradient-to-br from-pink-300 to-rose-400 shadow-md ${
                            isSel
                              ? "border-pink-300 ring-2 ring-pink-200 ring-offset-2 ring-offset-white"
                              : "border-white/30"
                          }`}
                          style={{
                            left:
                              TIMELINE_PAD_LEFT + overlay.start * PX_PER_FRAME,
                            width: w,
                            top: topOffset,
                            height: barH,
                            borderRadius: TRACK_ITEM_RADIUS,
                            willChange:
                              dragging?.kind === "text" &&
                              dragging.id === overlay.id
                                ? "left"
                                : undefined,
                            transform:
                              dragging?.kind === "text" &&
                              dragging.id === overlay.id
                                ? "translateZ(0)"
                                : undefined,
                          }}
                        >
                          <button
                            type="button"
                            aria-label="Resize text start"
                            className="z-30 shrink-0 cursor-ew-resize border-r border-white/25 bg-black/20 hover:bg-black/35"
                            style={{ width: RESIZE_HANDLE_W }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setResizeDragging({
                                kind: "text",
                                id: overlay.id,
                                edge: "left",
                                startClientX: e.clientX,
                                initialStart: overlay.start,
                                initialDuration: overlay.duration,
                                initialTrim: 0,
                              });
                            }}
                          />
                          <div
                            role="button"
                            tabIndex={0}
                            className="flex min-w-0 flex-1 cursor-grab items-center justify-start active:cursor-grabbing"
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              e.preventDefault();
                              const clickedFrame = frameFromClientX(e.clientX);
                              if (previewMode === "cached") {
                                switchToLivePlayback(clickedFrame);
                              }
                              const player = playerRef.current;
                              if (player) {
                                player.pause();
                                safeSeekPlayer(player, clickedFrame);
                              }
                              playActionFrameRef.current = clickedFrame;
                              setCurrentFrame(clickedFrame);
                              setPlaybackFrame(clickedFrame);
                              setHoverFrame(clickedFrame);
                              preservePlayheadOnNextSelectionRef.current = true;
                              setSelected({ kind: "text", id: overlay.id });
                              setDragging({
                                kind: "text",
                                id: overlay.id,
                                startClientX: e.clientX,
                                initialStart: overlay.start,
                                initialScrollLeft:
                                  timelineScrollRef.current?.scrollLeft ?? 0,
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                focusTimelineItem("text", overlay.id);
                              }
                            }}
                          >
                            <span className="pointer-events-none min-w-0 max-w-full truncate px-2 text-left text-[10px] font-bold leading-tight text-white drop-shadow-sm">
                              {elementBarText}
                            </span>
              </div>
                          <button
                            type="button"
                            aria-label="Resize text end"
                            className="z-30 shrink-0 cursor-ew-resize border-l border-white/25 bg-black/20 hover:bg-black/35"
                            style={{ width: RESIZE_HANDLE_W }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setResizeDragging({
                                kind: "text",
                                id: overlay.id,
                                edge: "right",
                                startClientX: e.clientX,
                                initialStart: overlay.start,
                                initialDuration: overlay.duration,
                                initialTrim: 0,
                              });
                            }}
                          />
            </div>
                      );
                    })}
          </div>

          {hoverFrame !== null ? (
            <div
              className="pointer-events-none absolute top-0 z-[45] w-3 -translate-x-1/2"
              style={{
                left: timelinePlayheadLeftPx(hoverFrame, PX_PER_FRAME),
                height: playheadFullHeight,
              }}
            >
              <div
                className="pointer-events-none absolute bottom-0 left-1/2 w-[1.5px] -translate-x-1/2 rounded-full bg-slate-400"
                style={{ top: Math.max(0, RULER_H - 4) }}
              />
              <div className="pointer-events-none absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[9px] border-l-transparent border-r-transparent border-t-slate-400" />
              <span className="pointer-events-none absolute left-1/2 top-[11px] z-[46] -translate-x-1/2 whitespace-nowrap rounded bg-white/90 px-1 py-0.5 text-[9px] font-medium tabular-nums text-slate-400 shadow-sm">
                {formatSecondsFromFrames(hoverFrame, FPS)}
              </span>
            </div>
          ) : null}

          <TimelineMarker
            currentFrame={activeFrame}
            pxPerFrame={PX_PER_FRAME}
            heightPx={playheadFullHeight}
            maxFrame={Math.max(0, Math.max(1, totalDuration) - 1)}
            onBeginScrub={beginPlayheadScrub}
          />
        </div>
      </div>
      </div>
    </div>
        </div>
      </div>
      </div>

      {trackContextMenu ? (
        <div
          ref={trackMenuRef}
          role="menu"
          aria-label="Track actions"
          className="fixed z-[200] min-w-[12.5rem] overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1 text-sm shadow-[0_16px_48px_rgba(15,23,42,0.15)] ring-1 ring-slate-900/5"
      style={{
            left: Math.min(
              trackContextMenu.x,
              typeof window !== "undefined"
                ? window.innerWidth - 220
                : trackContextMenu.x
            ),
            top: Math.min(
              trackContextMenu.y,
              typeof window !== "undefined"
                ? window.innerHeight - 340
                : trackContextMenu.y
            ),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={!contextActionFlags.canSplit}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-violet-50 disabled:pointer-events-none disabled:opacity-35"
            onClick={() => {
              splitLayerAtPlayhead(
                trackContextMenu.kind,
                trackContextMenu.id
              );
              setTrackContextMenu(null);
            }}
          >
            <Scissors className="h-4 w-4 shrink-0 text-violet-600" />
            Split at playhead
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!contextActionFlags.canTrimHead}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-35"
            onClick={() =>
              trimHeadAtPlayhead(trackContextMenu.kind, trackContextMenu.id)
            }
          >
            <Scissors className="h-4 w-4 shrink-0 rotate-[-90deg] text-slate-500" />
            Trim before playhead
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!contextActionFlags.canTrimTail}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-35"
            onClick={() =>
              trimTailAtPlayhead(trackContextMenu.kind, trackContextMenu.id)
            }
          >
            <Scissors className="h-4 w-4 shrink-0 rotate-90 text-slate-500" />
            Trim after playhead
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            role="menuitem"
            disabled={!contextActionFlags.canJoinPrev}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-35"
            onClick={() =>
              joinWithPrev(trackContextMenu.kind, trackContextMenu.id)
            }
          >
            <Link2 className="h-4 w-4 shrink-0 text-slate-600" />
            Join with previous
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!contextActionFlags.canJoinNext}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-35"
            onClick={() =>
              joinWithNext(trackContextMenu.kind, trackContextMenu.id)
            }
          >
            <Link2 className="h-4 w-4 shrink-0 scale-x-[-1] text-slate-600" />
            Join with next
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
            onClick={() => {
              copyLayer(trackContextMenu.kind, trackContextMenu.id);
              setTrackContextMenu(null);
            }}
          >
            <Clipboard className="h-4 w-4 shrink-0 text-slate-600" />
            Copy
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
            onClick={() =>
              duplicateLayer(trackContextMenu.kind, trackContextMenu.id)
            }
          >
            <Copy className="h-4 w-4 shrink-0 text-slate-600" />
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-700 hover:bg-red-50"
            onClick={() => {
              pushUndo();
              deleteLayerById(trackContextMenu.kind, trackContextMenu.id);
            }}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default ReactVideoEditor;
