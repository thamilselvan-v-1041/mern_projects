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
import { AbsoluteFill, Sequence } from "remotion";
import { Copy, Link2, Pause, Play, Scissors, Trash2 } from "lucide-react";
import { AiGenerateHubModal } from "./ai-generate-hub-modal";
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
import { LayerPropertiesPanel } from "./layer-properties-panel";
import { PreviewInteractionLayer } from "./preview-interaction-layer";
import { computeVideoClipStackLayout } from "./timeline-video-stack-layout";
import { getStoredProjectById, upsertStoredProject } from "@/lib/video-project-storage";

import { Clip, TextOverlay, TimelineAudio, type TextAnimationPreset } from "@/types/types";

/** Pixels per frame — timeline scroll width scales with project length (KineMaster-style ruler). */
const PX_PER_FRAME = 4;
/** Video/audio/text lane height (~33% shorter than original 48px). */
const TRACK_ROW_H = Math.round(48 * (1 - 0.33));
const RULER_H = Math.round(28 * (1 - 0.33));
const VIDEO_TRACK_ROW = 0;
/** Middle lane — mixed uploads + Suno (Remotion `<Audio />`). */
const AUDIO_TRACK_ROW = 1;
/** Top text overlays in preview; bottom timeline lane. */
const TEXT_TRACK_ROW = 2;
const TIMELINE_GAP_PX = 2;
const FPS = 30;
const DEFAULT_UPLOAD_AUDIO_FRAMES = 30 * 15;
const RESIZE_HANDLE_W = 6;
const MAX_STRETCH_FRAMES = 30 * 120;

const INSPECTOR_SECTION_LABEL: Record<WorkspaceNavPanel, string> = {
  videos: "Videos & AI video",
  audios: "Audios & AI music",
  giffy: "GIF & stock media",
  text: "Text layers",
  tools: "Shapes & motion",
  files: "File uploads",
};

function selectionInspectorTitle(
  selected: { kind: "clip" | "text" | "audio"; id: string },
  clip: Clip | null,
  audio: TimelineAudio | null,
): string {
  if (selected.kind === "clip") {
    if (!clip) return "Video clip";
    if (clip.overlayClip)
      return clip.mediaType === "image" ? "Image layer" : "GIF / stock";
    if (clip.fromAI) return "AI video";
    return "Video clip";
  }
  if (selected.kind === "text") return "Text layer";
  if (selected.kind === "audio")
    return audio?.label?.trim() || "Audio track";
  return "Layer";
}

const MAX_UNDO = 80;

type TimelineSnapshot = {
  clips: Clip[];
  textOverlays: TextOverlay[];
  audioTracks: TimelineAudio[];
};

type ClipboardEntry =
  | { kind: "clip"; data: Clip }
  | { kind: "text"; data: TextOverlay }
  | { kind: "audio"; data: TimelineAudio };

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
}> = React.memo(({ currentFrame, pxPerFrame, heightPx }) => {
  const leftPx = currentFrame * pxPerFrame;

  return (
    <div
      className="pointer-events-none absolute top-0 z-50 w-0.5 rounded-full bg-slate-700"
      style={{
        left: leftPx,
        transform: "translateX(-50%)",
        height: heightPx,
      }}
    >
      <div className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[9px] border-l-transparent border-r-transparent border-t-slate-700" />
    </div>
  );
});

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
  const [clips, setClips] = useState<Clip[]>([]);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [totalDuration, setTotalDuration] = useState(1);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [navPanel, setNavPanel] = useState<WorkspaceNavPanel>("videos");
  const [projectName, setProjectName] = useState("Untitled video");
  const [loadError, setLoadError] = useState(false);
  const [audioTracks, setAudioTracks] = useState<TimelineAudio[]>([]);
  const [selected, setSelected] = useState<{
    kind: "clip" | "text" | "audio";
    id: string;
  } | null>(null);
  const [dragging, setDragging] = useState<{
    kind: "clip" | "text" | "audio";
    id: string;
    startClientX: number;
    initialStart: number;
  } | null>(null);
  const [resizeDragging, setResizeDragging] = useState<ResizeDragState | null>(
    null
  );
  const [trackContextMenu, setTrackContextMenu] =
    useState<TrackContextMenuState | null>(null);

  // Refs
  const playerRef = useRef<PlayerRef>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const videoUploadInputRef = useRef<HTMLInputElement>(null);
  const audioUploadInputRef = useRef<HTMLInputElement>(null);
  const trackMenuRef = useRef<HTMLDivElement | null>(null);
  /** Monotonic stack for AI clips so newer AI layers draw above older when overlapping. */
  const aiClipStackRef = useRef(0);
  const mediaOverlayStackRef = useRef(0);

  const undoStackRef = useRef<TimelineSnapshot[]>([]);
  const redoStackRef = useRef<TimelineSnapshot[]>([]);
  const clipboardRef = useRef<ClipboardEntry | null>(null);
  const editorStateRef = useRef<TimelineSnapshot>({
    clips: [],
    textOverlays: [],
    audioTracks: [],
  });
  const currentFrameRef = useRef(0);
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
  } | null>(null);

  /** Avoid mounting Remotion Player before the preview box has real size (prevents NaN width in Player internals). */
  const [previewPlayerReady, setPreviewPlayerReady] = useState(false);
  const [previewIsPlaying, setPreviewIsPlaying] = useState(false);

  editorStateRef.current = { clips, textOverlays, audioTracks };
  currentFrameRef.current = currentFrame;
  selectedRef.current = selected;

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
    if (!p || !previewPlayerReady) return;
    const onPlay = () => setPreviewIsPlaying(true);
    const onPause = () => setPreviewIsPlaying(false);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    setPreviewIsPlaying(p.isPlaying());
    return () => {
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
    };
  }, [previewPlayerReady, totalDuration]);

  const trackWidthPx = useMemo(
    () => Math.max(960, totalDuration * PX_PER_FRAME + 240),
    [totalDuration]
  );

  const tracksBodyHeightPx = TRACK_ROW_H * 3;
  const playheadFullHeight = RULER_H + tracksBodyHeightPx;

  const videoStackLayout = useMemo(
    () => computeVideoClipStackLayout(clips, AUDIO_TRACK_ROW, TEXT_TRACK_ROW),
    [clips]
  );

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
      setClips(s.clips);
      setTextOverlays(s.textOverlays);
      setAudioTracks(s.audioTracks);
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
    const p = getStoredProjectById(projectId);
    if (!p) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setClips(p.clips);
    setTextOverlays(p.textOverlays);
    setAudioTracks(p.audioTracks);
    setProjectName(p.name);
    setCurrentFrame(0);
    setSelected(null);
    syncRefsFromClips(p.clips);
    undoStackRef.current = [];
    redoStackRef.current = [];
    clipboardRef.current = null;
  }, [projectId, syncRefsFromClips]);

  const exitToHub = useCallback(() => {
    saveCurrentProjectToStorage();
    window.location.href = "/";
  }, [saveCurrentProjectToStorage]);

  const goBackFromAuxPanel = useCallback(() => {
    setNavPanel("videos");
  }, []);

  const ensureActiveProject = useCallback(() => {}, []);

  const insertAudioAtPlayhead = useCallback(
    (src: string, label: string, durationFrames: number) => {
      ensureActiveProject();
      const insertFrame = currentFrame;
      const d = Math.max(1, durationFrames);
      const newAudio: TimelineAudio = {
        id: `audio-${Date.now()}`,
        start: insertFrame,
        duration: d,
        src,
        label,
        row: AUDIO_TRACK_ROW,
      };
      const shiftClip = (c: Clip): Clip =>
        c.start >= insertFrame ? { ...c, start: c.start + d } : c;
      const shiftOverlay = (o: TextOverlay): TextOverlay =>
        o.start >= insertFrame ? { ...o, start: o.start + d } : o;
      const shiftAudio = (a: TimelineAudio): TimelineAudio =>
        a.start >= insertFrame ? { ...a, start: a.start + d } : a;

      setClips((prev) => prev.map(shiftClip));
      setTextOverlays((prev) => prev.map(shiftOverlay));
      setAudioTracks((prev) =>
        [...prev.map(shiftAudio), newAudio].sort((a, b) => a.start - b.start)
      );
      setSelected({ kind: "audio", id: newAudio.id });
    },
    [currentFrame, ensureActiveProject]
  );

  const onSunoGenerated = useCallback(
    (audioUrl: string, label: string, durationSec?: number) => {
      const frames =
        durationSec != null && durationSec > 0
          ? Math.max(1, Math.round(durationSec * FPS))
          : DEFAULT_UPLOAD_AUDIO_FRAMES;
      insertAudioAtPlayhead(audioUrl, label, frames);
    },
    [insertAudioAtPlayhead]
  );

  const addSampleAudioToTimeline = useCallback(
    (src: string, label: string, fallbackDurationSec: number) => {
      const fallbackFrames = Math.max(
        1,
        Math.round(fallbackDurationSec * FPS)
      );
      const el = document.createElement("audio");
      el.preload = "metadata";
      el.crossOrigin = "anonymous";
      el.src = src;
      el.onloadedmetadata = () => {
        const sec = el.duration;
        const frames =
          Number.isFinite(sec) && sec > 0
            ? Math.max(1, Math.round(sec * FPS))
            : fallbackFrames;
        insertAudioAtPlayhead(src, label, frames);
      };
      el.onerror = () => {
        insertAudioAtPlayhead(src, label, fallbackFrames);
      };
      el.load();
    },
    [FPS, insertAudioAtPlayhead]
  );

  const insertVideoFileAtPlayhead = useCallback(
    (src: string, durationFrames: number) => {
      ensureActiveProject();
      const insertFrame = currentFrame;
      const d = Math.max(1, durationFrames);
      const newClip: Clip = {
        id: `clip-file-${Date.now()}`,
        start: insertFrame,
        duration: d,
        src,
        row: VIDEO_TRACK_ROW,
      };
      setClips((prev) => [...prev, newClip]);
      setSelected({ kind: "clip", id: newClip.id });
    },
    [currentFrame, ensureActiveProject]
  );

  const onMediaFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const url = URL.createObjectURL(file);

      if (file.type.startsWith("video/")) {
        const el = document.createElement("video");
        el.preload = "metadata";
        el.src = url;
        el.onloadedmetadata = () => {
          const sec = el.duration;
          const frames =
            Number.isFinite(sec) && sec > 0
              ? Math.max(1, Math.round(sec * FPS))
              : 200;
          insertVideoFileAtPlayhead(url, frames);
        };
        el.onerror = () => {
          insertVideoFileAtPlayhead(url, 200);
        };
        return;
      }

      if (file.type.startsWith("audio/")) {
        const label =
          file.name.replace(/\.[^/.]+$/, "").slice(0, 48) || "Audio";
        const el = document.createElement("audio");
        el.preload = "metadata";
        el.src = url;
        el.onloadedmetadata = () => {
          const sec = el.duration;
          const frames =
            Number.isFinite(sec) && sec > 0
              ? Math.max(1, Math.round(sec * FPS))
              : DEFAULT_UPLOAD_AUDIO_FRAMES;
          insertAudioAtPlayhead(url, label, frames);
        };
        el.onerror = () => {
          insertAudioAtPlayhead(url, label, DEFAULT_UPLOAD_AUDIO_FRAMES);
        };
      }
    },
    [insertAudioAtPlayhead, insertVideoFileAtPlayhead]
  );

  /**
   * Adds a new video clip to the timeline
   * Automatically positions it after the last item
   * @function
   */
  const addClip = useCallback(() => {
    ensureActiveProject();
    const newId = `clip-${Date.now()}`;
    setClips((prev) => {
      const items = [...prev, ...textOverlays, ...audioTracks];
      const lastItem =
        items.length === 0
          ? { start: 0, duration: 0 }
          : items.reduce((latest, item) =>
        item.start + item.duration > latest.start + latest.duration
          ? item
                : latest
    );
    const newClip: Clip = {
        id: newId,
      start: lastItem.start + lastItem.duration,
      duration: 200,
      src: "https://rwxrdxvxndclnqvznxfj.supabase.co/storage/v1/object/public/react-video-editor/open-source-video.mp4?t=2024-12-04T03%3A16%3A12.359Z",
        row: VIDEO_TRACK_ROW,
      };
      return [...prev, newClip];
    });
    setSelected({ kind: "clip", id: newId });
  }, [audioTracks, ensureActiveProject, textOverlays]);

  /**
   * Inserts an AI-generated video at the playhead. Does not shift other layers — overlaps allowed.
   * `fromAI` + `aiStackOrder` place AI above regular video in the preview stack.
   */
  const insertAIClip = useCallback((videoUrl: string) => {
    ensureActiveProject();
    const insertFrame = currentFrame;
    const aiClipDuration = 90; // ~3 sec at 30fps (CogVideoX outputs ~2s, buffer for variance)
    aiClipStackRef.current += 1;

    const newClip: Clip = {
      id: `clip-ai-${Date.now()}`,
      start: insertFrame,
      duration: aiClipDuration,
      src: videoUrl,
      row: VIDEO_TRACK_ROW,
      fromAI: true,
      aiStackOrder: aiClipStackRef.current,
    };

    setClips((prev) => [...prev, newClip]);
    setSelected({ kind: "clip", id: newClip.id });
  }, [currentFrame, ensureActiveProject]);

  /**
   * Giphy / Pexels layer at playhead — stacks above base video like AI clips.
   */
  const insertExplorerClip = useCallback(
    (src: string, opts: { label: string; mediaType: "video" | "image" }) => {
      ensureActiveProject();
      const insertFrame = currentFrame;
      mediaOverlayStackRef.current += 1;
      const durationFrames =
        opts.mediaType === "image" ? 120 : 90;

      const newClip: Clip = {
        id: `clip-media-${Date.now()}`,
        start: insertFrame,
        duration: durationFrames,
        src,
        row: VIDEO_TRACK_ROW,
        mediaType: opts.mediaType,
        overlayClip: true,
        overlayOrder: mediaOverlayStackRef.current,
      };

      setClips((prev) => [...prev, newClip]);
      setSelected({ kind: "clip", id: newClip.id });
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
    setTextOverlays((prev) => {
      const items = [...clips, ...prev, ...audioTracks];
      const lastItem =
        items.length === 0
          ? { start: 0, duration: 0 }
          : items.reduce((latest, item) =>
        item.start + item.duration > latest.start + latest.duration
          ? item
                : latest
    );
    const newOverlay: TextOverlay = {
        id: newId,
      start: lastItem.start + lastItem.duration,
      duration: 100,
        text: `Welcome to Video Editor`,
        row: TEXT_TRACK_ROW,
        ...textOverlayDefaults(),
      };
      return [...prev, newOverlay];
    });
    setSelected({ kind: "text", id: newId });
  }, [audioTracks, clips, ensureActiveProject]);

  const addShapeTextFromTools = useCallback(
    (opts: {
      shape: "rect" | "circle" | "pill";
      fill: string;
      stroke: string;
      animation: TextAnimationPreset;
      label: string;
    }) => {
      const newId = `text-${Date.now()}`;
      setTextOverlays((prev) => {
        const items = [...clips, ...prev, ...audioTracks];
        const lastItem =
          items.length === 0
            ? { start: 0, duration: 0 }
            : items.reduce((latest, item) =>
                item.start + item.duration > latest.start + latest.duration
                  ? item
                  : latest
              );
        const newOverlay: TextOverlay = {
          id: newId,
          start: lastItem.start + lastItem.duration,
          duration: 120,
          text: opts.label,
          row: TEXT_TRACK_ROW,
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
      setSelected({ kind: "text", id: newId });
      setNavPanel("videos");
    },
    [audioTracks, clips]
  );

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
        {[...clips]
          .sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            const za = a.fromAI
              ? 200 + (a.aiStackOrder ?? 0)
              : a.overlayClip
                ? 200 + (a.overlayOrder ?? 0)
                : 20;
            const zb = b.fromAI
              ? 200 + (b.aiStackOrder ?? 0)
              : b.overlayClip
                ? 200 + (b.overlayOrder ?? 0)
                : 20;
            return za - zb;
          })
          .map((item) => {
            const zVideo = item.fromAI
              ? 200 + (item.aiStackOrder ?? 0)
              : item.overlayClip
                ? 200 + (item.overlayOrder ?? 0)
                : 20;
            return (
              <Sequence
                key={item.id}
                from={item.start}
                durationInFrames={item.duration}
              >
                <ClipSequenceContent clip={item} zIndex={zVideo} />
              </Sequence>
            );
          })}
        {[...audioTracks]
          .sort((a, b) => a.start - b.start)
          .map((item) => (
            <Sequence
              key={item.id}
              from={item.start}
              durationInFrames={item.duration}
            >
              <AudioWithFades track={item} />
            </Sequence>
          ))}
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
    [clips, textOverlays, audioTracks]
  );

  useEffect(() => {
    const end = [...clips, ...textOverlays, ...audioTracks].reduce(
      (m, i) => Math.max(m, i.start + i.duration),
      0
    );
    setTotalDuration(Math.max(1, end));
  }, [clips, textOverlays, audioTracks]);

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
        setSelected({ kind: "clip", id: right.id });
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
        setSelected({ kind: "audio", id: rightA.id });
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
      setSelected({ kind: "text", id: rightT.id });
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
      setSelected({ kind: "text", id: newOverlay.id });
    },
    [ensureActiveProject, selected, timelineEnd, updateTextOverlay]
  );

  const deleteLayerById = useCallback(
    (kind: "clip" | "audio" | "text", id: string) => {
      if (kind === "clip") {
        setClips((prev) => prev.filter((c) => c.id !== id));
      } else if (kind === "audio") {
        setAudioTracks((prev) => prev.filter((a) => a.id !== id));
      } else {
        setTextOverlays((prev) => prev.filter((o) => o.id !== id));
      }
      setSelected((s) => (s?.id === id ? null : s));
      setTrackContextMenu(null);
    },
    []
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
        setSelected({ kind: "clip", id: copy.id });
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
        setSelected({ kind: "audio", id: copy.id });
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
        setSelected({ kind: "text", id: copy.id });
      }
      setTrackContextMenu(null);
    },
    [clips, audioTracks, textOverlays]
  );

  const copySelected = useCallback(() => {
    const sel = selectedRef.current;
    const { clips: cList, textOverlays: tList, audioTracks: aList } =
      editorStateRef.current;
    if (!sel) return;
    if (sel.kind === "clip") {
      const item = cList.find((x) => x.id === sel.id);
      if (item) clipboardRef.current = { kind: "clip", data: deepCloneLayer(item) };
      return;
    }
    if (sel.kind === "text") {
      const item = tList.find((x) => x.id === sel.id);
      if (item) clipboardRef.current = { kind: "text", data: deepCloneLayer(item) };
      return;
    }
    const item = aList.find((x) => x.id === sel.id);
    if (item) clipboardRef.current = { kind: "audio", data: deepCloneLayer(item) };
  }, []);

  const pasteAtPlayhead = useCallback(() => {
    const entry = clipboardRef.current;
    if (!entry) return;
    pushUndo();
    const at = Math.max(0, Math.floor(currentFrameRef.current));
    if (entry.kind === "clip") {
      const base = deepCloneLayer(entry.data);
      const id = `clip-${Date.now()}`;
      let next: Clip = { ...base, id, start: at };
      if (next.fromAI) {
        aiClipStackRef.current += 1;
        next = { ...next, aiStackOrder: aiClipStackRef.current };
      }
      if (next.overlayClip) {
        mediaOverlayStackRef.current += 1;
        next = { ...next, overlayOrder: mediaOverlayStackRef.current };
      }
      setClips((prev) => [...prev, next].sort((a, b) => a.start - b.start));
      setSelected({ kind: "clip", id });
      return;
    }
    if (entry.kind === "text") {
      const base = deepCloneLayer(entry.data);
      const id = `text-${Date.now()}`;
      const next: TextOverlay = { ...base, id, start: at };
      setTextOverlays((prev) =>
        [...prev, next].sort((a, b) => a.start - b.start)
      );
      setSelected({ kind: "text", id });
      return;
    }
    const base = deepCloneLayer(entry.data);
    const id = `audio-${Date.now()}`;
    const next: TimelineAudio = { ...base, id, start: at };
    setAudioTracks((prev) =>
      [...prev, next].sort((a, b) => a.start - b.start)
    );
    setSelected({ kind: "audio", id });
  }, [pushUndo]);

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
      player.seekTo(startFrame);
    }
    setCurrentFrame(startFrame);
  }, [selected, clips, textOverlays, audioTracks]);

  useEffect(() => {
    if (!selected) return;
    const sc = timelineScrollRef.current;
    if (!sc || sc.clientWidth < 8) return;
    let start = 0;
    let durationFrames = 30;
    if (selected.kind === "clip") {
      const c = clips.find((x) => x.id === selected.id);
      if (!c) return;
      start = c.start;
      durationFrames = c.duration;
    } else if (selected.kind === "text") {
      const t = textOverlays.find((x) => x.id === selected.id);
      if (!t) return;
      start = t.start;
      durationFrames = t.duration;
    } else {
      const au = audioTracks.find((x) => x.id === selected.id);
      if (!au) return;
      start = au.start;
      durationFrames = au.duration;
    }
    const leftPx = start * PX_PER_FRAME;
    const barW = Math.max(durationFrames * PX_PER_FRAME - TIMELINE_GAP_PX, 48);
    const center = leftPx + barW / 2;
    const targetLeft = Math.max(0, center - sc.clientWidth / 2);
    const raf = requestAnimationFrame(() => {
      sc.scrollTo({ left: targetLeft, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [selected, clips, textOverlays, audioTracks]);

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
    const onMove = (e: MouseEvent) => {
      const delta = Math.round(
        (e.clientX - resizeDragging.startClientX) / PX_PER_FRAME
      );
      const { kind, id, edge, initialStart, initialDuration, initialTrim } =
        resizeDragging;

      if (edge === "right") {
        const newDur = Math.min(
          MAX_STRETCH_FRAMES,
          Math.max(1, initialDuration + delta)
        );
        if (kind === "clip") {
          setClips((prev) =>
            prev.map((c) => (c.id === id ? { ...c, duration: newDur } : c))
          );
        } else if (kind === "audio") {
          setAudioTracks((prev) =>
            prev.map((a) => (a.id === id ? { ...a, duration: newDur } : a))
          );
        } else {
          setTextOverlays((prev) =>
            prev.map((o) => (o.id === id ? { ...o, duration: newDur } : o))
          );
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
        setTextOverlays((prev) =>
          prev.map((o) =>
            o.id === id ? { ...o, start: newStart, duration: newDur } : o
          )
        );
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
        setClips((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, start: newStart, duration: newDur, trimStart: newTrim }
              : c
          )
        );
      } else {
        setAudioTracks((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, start: newStart, duration: newDur, trimStart: newTrim }
              : a
          )
        );
      }
    };
    const onUp = () => setResizeDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizeDragging]);

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
    const onMove = (e: MouseEvent) => {
      const delta = Math.round((e.clientX - dragging.startClientX) / PX_PER_FRAME);
      const newStart = Math.max(0, dragging.initialStart + delta);
      if (dragging.kind === "clip") {
        setClips((prev) =>
          prev.map((c) => (c.id === dragging.id ? { ...c, start: newStart } : c))
        );
      } else if (dragging.kind === "audio") {
        setAudioTracks((prev) =>
          prev.map((a) => (a.id === dragging.id ? { ...a, start: newStart } : a))
        );
      } else {
        setTextOverlays((prev) =>
          prev.map((o) => (o.id === dragging.id ? { ...o, start: newStart } : o))
        );
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, resizeDragging]);

  // Effect for updating current frame
  useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current) {
        const frame = playerRef.current.getCurrentFrame();
        if (frame !== null) {
          setCurrentFrame(frame);
        }
      }
    }, 1000 / 30);

    return () => clearInterval(interval);
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
        <a
          href="/"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Back to projects
        </a>
      </div>
    );
  }

  const selectedClip =
    selected?.kind === "clip"
      ? clips.find((c) => c.id === selected.id) ?? null
      : null;
  const selectedTextOverlay =
    selected?.kind === "text"
      ? textOverlays.find((t) => t.id === selected.id) ?? null
      : null;
  const selectedAudioTrack =
    selected?.kind === "audio"
      ? audioTracks.find((a) => a.id === selected.id) ?? null
      : null;

  return (
    <div className="flex h-[100dvh] min-h-0 w-full overflow-hidden bg-white text-slate-800">
      <input
        ref={videoUploadInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        aria-hidden
        onChange={onMediaFileChange}
      />
      <input
        ref={audioUploadInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        aria-hidden
        onChange={onMediaFileChange}
      />
      <EditorWorkspaceSidebar navPanel={navPanel} onNavigate={setNavPanel} />

      {/* Column 2: tool/source UI + timeline layer properties */}
      <div className="flex w-[min(100%,380px)] shrink-0 flex-col border-r border-slate-200 bg-white min-h-0">
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Inspector
          </p>
          <p className="truncate text-sm font-semibold text-slate-900">
            {selected
              ? selectionInspectorTitle(
                  selected,
                  selectedClip,
                  selectedAudioTrack,
                )
              : INSPECTOR_SECTION_LABEL[navPanel]}
          </p>
          {selected ? (
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {INSPECTOR_SECTION_LABEL[navPanel]}
            </p>
          ) : null}
        </div>

        {navPanel !== "videos" ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-violet-50/50 px-3 py-2">
            <span
              className="min-w-0 max-w-[10rem] truncate text-xs font-semibold text-slate-800"
              title={projectName.trim() || "Untitled video"}
            >
              {projectName.trim() || "Untitled"}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setNavPanel("videos")}
                className="inline-flex items-center rounded-md border border-violet-200 bg-white px-2 py-1 text-[11px] font-semibold text-violet-800 hover:bg-violet-50"
              >
                Videos
              </button>
              <button
                type="button"
                onClick={saveCurrentProjectToStorage}
                className="inline-flex items-center rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
              >
                Save
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60">
            {selected ? (
              <div className="shrink-0 border-b border-violet-200 bg-white">
                <div className="min-h-0 max-h-[min(52vh,520px)] overflow-y-auto">
                  <LayerPropertiesPanel
                    variant="embedded"
                    shellClassName="border-t-0"
                    selected={selected}
                    clip={selectedClip}
                    textOverlay={selectedTextOverlay}
                    audioTrack={selectedAudioTrack}
                    onUpdateClip={updateClip}
                    onUpdateText={updateTextOverlay}
                    onUpdateAudio={updateAudioTrack}
                  />
                </div>
              </div>
            ) : null}
            {navPanel === "videos" ? (
              <div className="flex min-h-0 flex-col">
                <VideosLibraryPanel
                  clips={clips}
                  selectedClipId={
                    selected?.kind === "clip" ? selected.id : null
                  }
                  fps={FPS}
                  onSelectClip={(id) => setSelected({ kind: "clip", id })}
                  onSeekToFrame={(frame) =>
                    playerRef.current?.seekTo(frame)
                  }
                  onAddSampleVideo={addClip}
                  onBackToPreview={exitToHub}
                  backLabel="All projects"
                />
                <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-3">
                  <p className="mb-2 text-[11px] font-semibold text-slate-800">
                    AI video
                  </p>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/80">
                    <AiGenerateHubModal
                      layout="inline"
                      isOpen
                      initialTab="video"
                      onBackToPreview={goBackFromAuxPanel}
                      onVideoGenerated={insertAIClip}
                      onAudioGenerated={onSunoGenerated}
                      onTextApply={applyAiTextToLayer}
                    />
                  </div>
                </div>
              </div>
            ) : null}
            {navPanel === "audios" ? (
              <div className="flex min-h-0 flex-col">
                <AudiosLibraryPanel
                  audioTracks={audioTracks}
                  selectedAudioId={
                    selected?.kind === "audio" ? selected.id : null
                  }
                  fps={FPS}
                  onSelectAudio={(id) => setSelected({ kind: "audio", id })}
                  onSeekToFrame={(frame) =>
                    playerRef.current?.seekTo(frame)
                  }
                  onAddSampleAudio={addSampleAudioToTimeline}
                  onBackToPreview={exitToHub}
                  backLabel="All projects"
                />
                <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-3">
                  <p className="mb-2 text-[11px] font-semibold text-slate-800">
                    AI music
                  </p>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/80">
                    <AiGenerateHubModal
                      layout="inline"
                      isOpen
                      initialTab="audio"
                      onBackToPreview={goBackFromAuxPanel}
                      onVideoGenerated={insertAIClip}
                      onAudioGenerated={onSunoGenerated}
                      onTextApply={applyAiTextToLayer}
                    />
                  </div>
                </div>
              </div>
            ) : null}
            {navPanel === "giffy" ? (
              <div className="min-h-[min(50vh,400px)] overflow-hidden">
                <MediaExplorerModal
                  layout="page"
                  isOpen
                  onPick={insertExplorerClip}
                  onBackToPreview={goBackFromAuxPanel}
                />
              </div>
            ) : null}
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
                onBackToPreview={goBackFromAuxPanel}
                onPickVideo={() => videoUploadInputRef.current?.click()}
                onPickAudio={() => audioUploadInputRef.current?.click()}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Column 3: preview + timeline */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
          <a
            href="/"
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            ← All projects
          </a>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="min-w-[8rem] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-900"
            aria-label="Project name"
          />
          <button
            type="button"
            onClick={saveCurrentProjectToStorage}
            className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Save
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-auto px-4 py-5">
          <div className="mx-auto w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div
              ref={previewWrapRef}
              className="relative w-full min-w-px overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
              style={{
                aspectRatio: "16 / 9",
                maxHeight: "min(56vh, 520px)",
                minHeight: 200,
                width: "100%",
              }}
            >
              {previewPlayerReady ? (
              <Player
                ref={playerRef}
                component={Composition}
                durationInFrames={Math.max(1, totalDuration)}
                compositionWidth={1920}
                compositionHeight={1080}
                  controls={false}
                fps={30}
                  acknowledgeRemotionLicense
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
                inputProps={{}}
              />
              ) : (
                <div className="flex min-h-[200px] w-full flex-1 items-center justify-center text-sm text-slate-500">
                  Loading preview…
            </div>
              )}
              <PreviewInteractionLayer
                wrapRef={previewWrapRef}
                currentFrame={currentFrame}
                clips={clips}
                textOverlays={textOverlays}
                selected={selected}
                onSelect={setSelected}
                onPatchClip={(id, patch) => updateClip(id, patch)}
                onPatchText={(id, patch) => updateTextOverlay(id, patch)}
              />
              {selected?.kind === "audio" ? (
                <div className="pointer-events-none absolute bottom-3 left-2 right-2 z-[35] rounded-lg border border-emerald-200/80 bg-emerald-50/95 px-2 py-1.5 text-center text-[11px] font-medium text-emerald-900 shadow-sm">
                  Audio selected — use the inspector column for volume and
                  fades.
          </div>
              ) : null}
        </div>
            <div className="mt-3 flex items-center justify-center border-t border-slate-100 pt-3">
            <button
                type="button"
                disabled={!previewPlayerReady}
                onClick={() => playerRef.current?.toggle()}
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
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white px-3 pb-4 pt-3">
          <div className="mx-auto flex max-w-[1600px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center border-b border-slate-200 bg-white px-4 py-2.5">
              <p className="text-xs font-semibold text-slate-800">Timeline</p>
            </div>

            <div className="flex min-h-[188px] w-full">
              <div className="flex w-[4.5rem] shrink-0 flex-col border-r border-slate-200 bg-white">
                <div
                  className="flex items-end border-b border-slate-100 pb-1 pl-2 text-[9px] font-semibold uppercase tracking-wide text-slate-400"
                  style={{ height: RULER_H }}
                >
                  Time
                </div>
                <div
                  className="flex items-center border-b border-slate-100 px-2 text-[11px] font-semibold text-violet-600"
                  style={{ height: TRACK_ROW_H }}
                >
                  Video
                </div>
                <div
                  className="flex items-center border-b border-slate-100 px-2 text-[11px] font-semibold text-emerald-600"
                  style={{ height: TRACK_ROW_H }}
                >
                  Audio
                </div>
                <div
                  className="flex items-center px-2 text-[11px] font-semibold text-pink-600"
                  style={{ height: TRACK_ROW_H }}
                >
                  Text
          </div>
        </div>

              <div
                ref={timelineScrollRef}
                className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden bg-white"
              >
                <div
                  className="relative shrink-0"
                  style={{ width: trackWidthPx }}
                >
                  <div
                    className="relative border-b border-slate-200 bg-white"
                    style={{ height: RULER_H }}
                  >
                    {Array.from(
                      { length: Math.floor(totalDuration / 30) + 2 },
                      (_, i) => i * 30
                    ).map((frame) => (
                      <div
                        key={frame}
                        className="absolute bottom-0 top-0 border-l border-slate-200/90"
                        style={{ left: frame * PX_PER_FRAME }}
                      >
                        <span className="absolute left-1 top-0.5 text-[9px] tabular-nums text-slate-400">
                          {frame === 0 ? "0s" : `${frame / 30}s`}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div
                    className="relative cursor-default border-t border-slate-200 bg-white"
                    style={{ height: tracksBodyHeightPx }}
                    onMouseDown={() => setSelected(null)}
                    role="presentation"
                  >
                    <div
                      className="pointer-events-none absolute inset-0 z-0"
                style={{
                        backgroundImage: [
                          `linear-gradient(to bottom, transparent ${TRACK_ROW_H - 1}px, rgba(226,232,240,0.9) ${TRACK_ROW_H - 1}px, rgba(226,232,240,0.9) ${TRACK_ROW_H}px, transparent ${TRACK_ROW_H}px)`,
                          `linear-gradient(to bottom, transparent ${TRACK_ROW_H * 2 - 1}px, rgba(226,232,240,0.9) ${TRACK_ROW_H * 2 - 1}px, rgba(226,232,240,0.9) ${TRACK_ROW_H * 2}px, transparent ${TRACK_ROW_H * 2}px)`,
                        ].join(", "),
                      }}
                    />
                    {clips.map((clip, index) => {
                      const isSel =
                        selected?.kind === "clip" && selected.id === clip.id;
                      const w = Math.max(
                        RESIZE_HANDLE_W * 2 + 8,
                        clip.duration * PX_PER_FRAME - TIMELINE_GAP_PX
                      );
                      const row =
                        clip.row === TEXT_TRACK_ROW
                          ? TEXT_TRACK_ROW
                          : clip.row === AUDIO_TRACK_ROW
                            ? AUDIO_TRACK_ROW
                            : VIDEO_TRACK_ROW;
                      const stackSlot = videoStackLayout.get(clip.id) ?? {
                        lane: 0,
                        lanes: 1,
                      };
                      const stackGap = 2;
                      const usableH = TRACK_ROW_H - 8;
                      const barH = Math.max(
                        7,
                        (usableH - stackGap * (stackSlot.lanes - 1)) /
                          stackSlot.lanes
                      );
                      const topOffset =
                        row * TRACK_ROW_H +
                        4 +
                        stackSlot.lane * (barH + stackGap);
                      return (
                        <div
                          key={clip.id}
                          role="group"
                          aria-label={`Video clip ${index + 1}`}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelected({ kind: "clip", id: clip.id });
                            setTrackContextMenu({
                              kind: "clip",
                              id: clip.id,
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          className={`absolute z-20 flex overflow-hidden rounded-xl border-2 shadow-sm ${
                            clip.overlayClip
                              ? "bg-gradient-to-br from-teal-500 to-cyan-600 ring-2 ring-teal-300/80 ring-offset-1 ring-offset-white"
                              : "bg-gradient-to-br from-violet-500 to-purple-600"
                          } ${
                            clip.fromAI
                              ? "ring-2 ring-amber-400/80 ring-offset-1 ring-offset-white"
                              : ""
                          } ${
                            isSel
                              ? "border-violet-400 ring-2 ring-violet-300/60 ring-offset-2 ring-offset-white"
                              : "border-white/30"
                          }`}
                          style={{
                            left: clip.start * PX_PER_FRAME,
                            width: w,
                            top: topOffset,
                            height: barH,
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
                            className="flex min-w-0 flex-1 cursor-grab items-center justify-center active:cursor-grabbing"
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              e.preventDefault();
                              setSelected({ kind: "clip", id: clip.id });
                              setDragging({
                                kind: "clip",
                                id: clip.id,
                                startClientX: e.clientX,
                                initialStart: clip.start,
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelected({ kind: "clip", id: clip.id });
                              }
                            }}
                          >
                            <span className="pointer-events-none text-center text-[10px] font-bold leading-tight text-white drop-shadow-sm">
                              {clip.overlayClip
                                ? clip.mediaType === "image"
                                  ? `I${index + 1}`
                                  : `G${index + 1}`
                                : `V${index + 1}`}
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
                    {audioTracks.map((track, index) => {
                      const isSel =
                        selected?.kind === "audio" && selected.id === track.id;
                      const w = Math.max(
                        RESIZE_HANDLE_W * 2 + 8,
                        track.duration * PX_PER_FRAME - TIMELINE_GAP_PX
                      );
                      const row = AUDIO_TRACK_ROW;
                      return (
                        <div
                          key={track.id}
                          role="group"
                          aria-label={`Audio ${track.label}`}
                          title={track.label}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelected({ kind: "audio", id: track.id });
                            setTrackContextMenu({
                              kind: "audio",
                              id: track.id,
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          className={`absolute z-20 flex overflow-hidden rounded-xl border-2 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md ${
                            isSel
                              ? "border-emerald-300 ring-2 ring-emerald-200 ring-offset-2 ring-offset-white"
                              : "border-white/30"
                          }`}
                          style={{
                            left: track.start * PX_PER_FRAME,
                            width: w,
                            top: row * TRACK_ROW_H + 4,
                            height: TRACK_ROW_H - 8,
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
                            className="flex min-w-0 flex-1 cursor-grab items-center justify-center active:cursor-grabbing"
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              e.preventDefault();
                              setSelected({ kind: "audio", id: track.id });
                              setDragging({
                                kind: "audio",
                                id: track.id,
                                startClientX: e.clientX,
                                initialStart: track.start,
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelected({ kind: "audio", id: track.id });
                              }
                            }}
                          >
                            <span className="pointer-events-none max-w-full truncate px-0.5 text-center text-[10px] font-bold leading-tight text-white drop-shadow-sm">
                              A{index + 1}
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
                    {textOverlays.map((overlay, index) => {
                      const isSel =
                        selected?.kind === "text" && selected.id === overlay.id;
                      const w = Math.max(
                        RESIZE_HANDLE_W * 2 + 8,
                        overlay.duration * PX_PER_FRAME - TIMELINE_GAP_PX
                      );
                      const row =
                        overlay.row === VIDEO_TRACK_ROW
                          ? VIDEO_TRACK_ROW
                          : overlay.row === AUDIO_TRACK_ROW
                            ? AUDIO_TRACK_ROW
                            : TEXT_TRACK_ROW;
                      return (
                        <div
                    key={overlay.id}
                          role="group"
                          aria-label={`Text ${index + 1}`}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelected({ kind: "text", id: overlay.id });
                            setTrackContextMenu({
                              kind: "text",
                              id: overlay.id,
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          className={`absolute z-20 flex overflow-hidden rounded-xl border-2 bg-gradient-to-br from-pink-500 to-rose-600 shadow-md ${
                            isSel
                              ? "border-pink-300 ring-2 ring-pink-200 ring-offset-2 ring-offset-white"
                              : "border-white/30"
                          }`}
                          style={{
                            left: overlay.start * PX_PER_FRAME,
                            width: w,
                            top: row * TRACK_ROW_H + 4,
                            height: TRACK_ROW_H - 8,
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
                            className="flex min-w-0 flex-1 cursor-grab items-center justify-center active:cursor-grabbing"
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              e.preventDefault();
                              setSelected({ kind: "text", id: overlay.id });
                              setDragging({
                                kind: "text",
                                id: overlay.id,
                                startClientX: e.clientX,
                                initialStart: overlay.start,
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelected({ kind: "text", id: overlay.id });
                              }
                            }}
                          >
                            <span className="pointer-events-none text-center text-[10px] font-bold leading-tight text-white drop-shadow-sm">
                              T{index + 1}
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

          <TimelineMarker
            currentFrame={currentFrame}
                    pxPerFrame={PX_PER_FRAME}
                    heightPx={playheadFullHeight}
          />
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
