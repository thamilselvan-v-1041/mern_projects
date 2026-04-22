"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorV2Project } from "@/types/editor-v2";

const MIN_CLIP_FRAMES = 6;
const CLIP_HEIGHT_PX = 40;

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

type ThumbnailStripMap = Record<string, string[]>;
type WaveformMap = Record<string, number[]>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildFallbackWaveform(seedInput: string, bins: number): number[] {
  let seed = 0;
  for (let i = 0; i < seedInput.length; i += 1) {
    seed = (seed * 31 + seedInput.charCodeAt(i)) >>> 0;
  }
  const out: number[] = [];
  let x = seed || 1;
  for (let i = 0; i < bins; i += 1) {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    const n = Math.abs(x % 1000) / 1000; // 0..1
    out.push(0.15 + n * 0.85); // keep visible baseline
  }
  return out;
}

export default function TimelineV2({
  project,
  playheadFrame,
  onPlayheadChange,
  onProjectChange,
}: TimelineV2Props) {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [thumbnailStrips, setThumbnailStrips] = useState<ThumbnailStripMap>({});
  const [audioWaveforms, setAudioWaveforms] = useState<WaveformMap>({});
  const [thumbModeByClip, setThumbModeByClip] = useState<Record<string, "real" | "fallback">>({});
  const [waveModeByClip, setWaveModeByClip] = useState<Record<string, "real" | "fallback">>({});
  const thumbsInFlightRef = useRef<Set<string>>(new Set());
  const wavesInFlightRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);

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

  const videoTrackClips = useMemo(
    () =>
      project.tracks
        .filter((track) => track.id === "track-video")
        .flatMap((track) => track.clips),
    [project.tracks]
  );

  const audioTrackClips = useMemo(
    () =>
      project.tracks
        .filter((track) => {
          const key = `${track.id} ${track.label}`.toLowerCase();
          return key.includes("audio") || key.includes("music") || key.includes("sound");
        })
        .flatMap((track) => track.clips),
    [project.tracks]
  );

  const isImageSrc = (src: string): boolean =>
    /\.(png|jpe?g|webp|gif|bmp|avif|svg)(\?.*)?$/i.test(src);

  const generateVideoThumbs = async (src: string, count: number): Promise<string[]> => {
    if (!src) return [];
    if (isImageSrc(src)) return [src];

    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.src = src;

      const cleanup = () => {
        video.removeAttribute("src");
        video.load();
      };

      video.onloadedmetadata = async () => {
        try {
          const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
          const step = duration / Math.max(count, 1);
          const canvas = document.createElement("canvas");
          canvas.width = 120;
          canvas.height = 68;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            cleanup();
            resolve([]);
            return;
          }

          const out: string[] = [];
          for (let i = 0; i < count; i += 1) {
            const t = Math.min(duration - 0.05, Math.max(0, i * step));
            // eslint-disable-next-line no-await-in-loop
            await new Promise<void>((next) => {
              const onSeeked = () => {
                video.removeEventListener("seeked", onSeeked);
                next();
              };
              video.addEventListener("seeked", onSeeked, { once: true });
              video.currentTime = t;
            });
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            out.push(canvas.toDataURL("image/jpeg", 0.7));
          }
          cleanup();
          resolve(out);
        } catch {
          cleanup();
          resolve([]);
        }
      };

      video.onerror = () => {
        cleanup();
        resolve([]);
      };
    });
  };

  const getAudioContext = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (audioContextRef.current) return audioContextRef.current;
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioContextRef.current = new Ctx();
    return audioContextRef.current;
  };

  const generateWaveform = async (src: string, bins: number): Promise<number[]> => {
    if (!src) return [];
    const ctx = getAudioContext();
    if (!ctx) return [];
    try {
      const res = await fetch(src);
      if (!res.ok) return [];
      const buf = await res.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(buf.slice(0));
      const channel = audioBuf.getChannelData(0);
      const block = Math.floor(channel.length / bins) || 1;
      const peaks: number[] = [];
      for (let i = 0; i < bins; i += 1) {
        const start = i * block;
        const end = Math.min(channel.length, start + block);
        let peak = 0;
        for (let j = start; j < end; j += 1) {
          const v = Math.abs(channel[j] ?? 0);
          if (v > peak) peak = v;
        }
        peaks.push(Math.max(0.05, Math.min(1, peak)));
      }
      return peaks;
    } catch {
      return [];
    }
  };

  useEffect(() => {
    videoTrackClips.forEach((clip) => {
      const src = clip.src ?? "";
      if (!src) return;
      if (thumbnailStrips[clip.id]) return;
      if (thumbsInFlightRef.current.has(clip.id)) return;
      thumbsInFlightRef.current.add(clip.id);
      const frameCount = Math.max(3, Math.min(12, Math.floor((clip.durationFrames * pxPerFrame) / 28)));
      void generateVideoThumbs(src, frameCount).then((thumbs) => {
        setThumbnailStrips((prev) => ({ ...prev, [clip.id]: thumbs }));
        setThumbModeByClip((prev) => ({
          ...prev,
          [clip.id]: thumbs.length > 0 ? "real" : "fallback",
        }));
        thumbsInFlightRef.current.delete(clip.id);
      });
    });
  }, [thumbnailStrips, videoTrackClips]);

  useEffect(() => {
    audioTrackClips.forEach((clip) => {
      const src = clip.src ?? "";
      if (!src) return;
      if (audioWaveforms[clip.id]) return;
      if (wavesInFlightRef.current.has(clip.id)) return;
      wavesInFlightRef.current.add(clip.id);
      const bins = Math.max(24, Math.min(120, Math.floor((clip.durationFrames * pxPerFrame) / 4)));
      void generateWaveform(src, bins).then((peaks) => {
        const isReal = peaks.length > 0;
        setAudioWaveforms((prev) => ({
          ...prev,
          [clip.id]:
            isReal ? peaks : buildFallbackWaveform(`${clip.id}:${clip.label}`, bins),
        }));
        setWaveModeByClip((prev) => ({
          ...prev,
          [clip.id]: isReal ? "real" : "fallback",
        }));
        wavesInFlightRef.current.delete(clip.id);
      });
    });
  }, [audioTrackClips, audioWaveforms]);

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
                className="relative h-20 rounded border border-slate-200 bg-white"
              >
                <div className="absolute left-2 top-1 text-[10px] uppercase text-slate-400">
                  {track.label}
                </div>
                {track.clips.map((clip) => (
                  (() => {
                    const trackKey = `${track.id} ${track.label}`.toLowerCase();
                    const isAudioTrack =
                      trackKey.includes("audio") ||
                      trackKey.includes("music") ||
                      trackKey.includes("sound");
                    // Treat non-audio lanes as visual/video lanes for thumbnail-strip rendering.
                    const isVideoTrack = !isAudioTrack;
                    return (
                  <div
                    key={clip.id}
                    className={`group absolute top-7 cursor-grab overflow-hidden rounded px-2 text-xs text-white ${
                      isVideoTrack
                        ? "border border-slate-300 bg-slate-900"
                        : isAudioTrack
                          ? "border border-violet-300 bg-violet-700/85"
                          : "border border-blue-400 bg-blue-500"
                    }`}
                    style={{
                      left: clip.startFrame * pxPerFrame,
                      width: clip.durationFrames * pxPerFrame,
                      height: CLIP_HEIGHT_PX,
                    }}
                    onPointerDown={(event) => beginClipDrag(event, "move", clip.id)}
                    title={`${clip.label} (${clip.startFrame}f - ${
                      clip.startFrame + clip.durationFrames
                    }f)`}
                  >
                    {isVideoTrack ? (
                      <div className="absolute inset-0 z-0 overflow-hidden rounded">
                        {thumbnailStrips[clip.id]?.length ? (
                          <div className="flex h-full w-full">
                            {thumbnailStrips[clip.id].map((thumb, i) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={`${clip.id}-thumb-${i}`}
                                src={thumb}
                                alt=""
                                className="h-full flex-1 object-cover opacity-95"
                                draggable={false}
                              />
                            ))}
                          </div>
                        ) : (
                          <video
                            src={clip.src}
                            className="h-full w-full object-cover opacity-95"
                            muted
                            playsInline
                            autoPlay
                            loop
                            preload="metadata"
                          />
                        )}
                      </div>
                    ) : null}
                    {isAudioTrack ? (
                      <div className="absolute inset-0 z-0 overflow-hidden rounded">
                        {audioWaveforms[clip.id]?.length ? (
                          <div className="flex h-full w-full items-center gap-[1px] bg-violet-800/90 px-1">
                            {audioWaveforms[clip.id].map((peak, i) => (
                              <span
                                key={`${clip.id}-wave-${i}`}
                                className="w-[2px] rounded-full bg-violet-100"
                                style={{ height: `${Math.max(24, Math.round(peak * 100))}%` }}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="flex h-full w-full items-center gap-[1px] bg-violet-800/90 px-1">
                            {buildFallbackWaveform(`${clip.id}:${clip.label}`, 64).map((peak, i) => (
                              <span
                                key={`${clip.id}-fallback-wave-${i}`}
                                className="w-[2px] rounded-full bg-violet-100"
                                style={{ height: `${Math.max(24, Math.round(peak * 100))}%` }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {isVideoTrack ? (
                      <span className="absolute right-1 top-1 z-30 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-200">
                        thumb:{thumbModeByClip[clip.id] ?? (thumbnailStrips[clip.id]?.length ? "real" : "fallback")}
                      </span>
                    ) : null}
                    {isAudioTrack ? (
                      <span className="absolute right-1 top-1 z-30 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-200">
                        wave:{waveModeByClip[clip.id] ?? (audioWaveforms[clip.id]?.length ? "real" : "fallback")}
                      </span>
                    ) : null}
                    <div
                      className="absolute left-0 top-0 z-20 h-full w-1 cursor-ew-resize rounded-l bg-black/45"
                      onPointerDown={(event) => beginClipDrag(event, "trim-start", clip.id)}
                    />
                    <div
                      className="absolute right-0 top-0 z-20 h-full w-1 cursor-ew-resize rounded-r bg-black/45"
                      onPointerDown={(event) => beginClipDrag(event, "trim-end", clip.id)}
                    />
                    <span className="relative z-10 block truncate bg-black/35 px-1 leading-10 drop-shadow">
                      {clip.label}
                    </span>
                  </div>
                    );
                  })()
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
