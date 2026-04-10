"use client";

import { useMemo, useRef, useState } from "react";
import type { EditorV2Project } from "@/types/editor-v2";

const MIN_CLIP_FRAMES = 6;

type DragMode = "scrub" | "move" | "trim-start" | "trim-end";

type DragState = {
  mode: DragMode;
  clipId?: string;
  anchorX: number;
  originStartFrame?: number;
  originDurationFrames?: number;
};

type TimelineV2Props = {
  project: EditorV2Project;
  playheadFrame: number;
  onPlayheadChange: (frame: number) => void;
  onProjectChange: (nextProject: EditorV2Project) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function TimelineV2({
  project,
  playheadFrame,
  onPlayheadChange,
  onProjectChange,
}: TimelineV2Props) {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const pxPerFrame = 2;
  const timelineWidth = project.totalFrames * pxPerFrame;

  const clipLookup = useMemo(() => {
    const map = new Map<string, { trackId: string }>();
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        map.set(clip.id, { trackId: track.id });
      }
    }
    return map;
  }, [project.tracks]);

  const toFrameFromClientX = (clientX: number): number => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return playheadFrame;
    const localX = clamp(clientX - rect.left, 0, rect.width);
    return clamp(Math.round(localX / pxPerFrame), 0, project.totalFrames);
  };

  const updateClip = (
    clipId: string,
    updater: (clip: EditorV2Project["tracks"][number]["clips"][number]) => EditorV2Project["tracks"][number]["clips"][number]
  ) => {
    const nextTracks = project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => (clip.id === clipId ? updater(clip) : clip)),
    }));
    onProjectChange({ ...project, tracks: nextTracks });
  };

  const beginScrub = (clientX: number) => {
    onPlayheadChange(toFrameFromClientX(clientX));
    setDragState({ mode: "scrub", anchorX: clientX });
  };

  const beginClipDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    mode: DragMode,
    clipId: string
  ) => {
    event.stopPropagation();
    const clip = project.tracks
      .flatMap((track) => track.clips)
      .find((item) => item.id === clipId);
    if (!clip) return;
    setDragState({
      mode,
      clipId,
      anchorX: event.clientX,
      originStartFrame: clip.startFrame,
      originDurationFrames: clip.durationFrames,
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;

    if (dragState.mode === "scrub") {
      onPlayheadChange(toFrameFromClientX(event.clientX));
      return;
    }

    if (!dragState.clipId) return;
    const deltaFrames = Math.round((event.clientX - dragState.anchorX) / pxPerFrame);
    const clipMeta = clipLookup.get(dragState.clipId);
    if (!clipMeta) return;

    if (dragState.mode === "move") {
      const nextStart = clamp(
        (dragState.originStartFrame ?? 0) + deltaFrames,
        0,
        project.totalFrames - MIN_CLIP_FRAMES
      );
      updateClip(dragState.clipId, (clip) => ({
        ...clip,
        startFrame: nextStart,
      }));
      return;
    }

    if (dragState.mode === "trim-start") {
      updateClip(dragState.clipId, (clip) => {
        const nextStart = clamp(
          (dragState.originStartFrame ?? clip.startFrame) + deltaFrames,
          0,
          clip.startFrame + clip.durationFrames - MIN_CLIP_FRAMES
        );
        const moved = nextStart - clip.startFrame;
        return {
          ...clip,
          startFrame: nextStart,
          durationFrames: clip.durationFrames - moved,
          trimInFrames: clip.trimInFrames + moved,
        };
      });
      return;
    }

    if (dragState.mode === "trim-end") {
      updateClip(dragState.clipId, (clip) => {
        const maxDuration = project.totalFrames - clip.startFrame;
        const nextDuration = clamp(
          (dragState.originDurationFrames ?? clip.durationFrames) + deltaFrames,
          MIN_CLIP_FRAMES,
          maxDuration
        );
        const removed = clip.durationFrames - nextDuration;
        return {
          ...clip,
          durationFrames: nextDuration,
          trimOutFrames: clip.trimOutFrames + removed,
        };
      });
    }
  };

  const handlePointerUp = () => {
    setDragState(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Timeline V2
      </div>
      <div
        ref={timelineRef}
        className="relative overflow-x-auto rounded border border-slate-200 bg-slate-50"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerDown={(event) => beginScrub(event.clientX)}
      >
        <div style={{ width: timelineWidth, minHeight: 180 }}>
          <div className="relative h-9 border-b border-slate-200 bg-white">
            {Array.from({ length: Math.ceil(project.totalFrames / 30) + 1 }).map((_, idx) => {
              const frame = idx * 30;
              const left = frame * pxPerFrame;
              return (
                <div
                  key={frame}
                  className="absolute top-0 h-full"
                  style={{ left }}
                >
                  <div className="h-4 border-l border-slate-300" />
                  <span className="pl-1 text-[10px] text-slate-500">{frame}</span>
                </div>
              );
            })}
            <div
              className="pointer-events-none absolute bottom-0 top-0 w-px bg-red-500"
              style={{ left: playheadFrame * pxPerFrame }}
            />
          </div>

          <div className="space-y-2 p-2">
            {project.tracks.map((track) => (
              <div
                key={track.id}
                className="relative h-14 rounded border border-slate-200 bg-white"
              >
                <div className="absolute left-2 top-1 text-[10px] uppercase text-slate-400">
                  {track.label}
                </div>
                {track.clips.map((clip) => (
                  <div
                    key={clip.id}
                    className="group absolute top-5 h-7 cursor-grab rounded bg-blue-500 px-2 text-xs text-white"
                    style={{
                      left: clip.startFrame * pxPerFrame,
                      width: clip.durationFrames * pxPerFrame,
                    }}
                    onPointerDown={(event) => beginClipDrag(event, "move", clip.id)}
                    title={`${clip.label} (${clip.startFrame}f - ${
                      clip.startFrame + clip.durationFrames
                    }f)`}
                  >
                    <div
                      className="absolute left-0 top-0 h-full w-1 cursor-ew-resize rounded-l bg-blue-800/70"
                      onPointerDown={(event) => beginClipDrag(event, "trim-start", clip.id)}
                    />
                    <div
                      className="absolute right-0 top-0 h-full w-1 cursor-ew-resize rounded-r bg-blue-800/70"
                      onPointerDown={(event) => beginClipDrag(event, "trim-end", clip.id)}
                    />
                    <span className="block truncate leading-7">{clip.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
