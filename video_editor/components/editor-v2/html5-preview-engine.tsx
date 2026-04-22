"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineClipV2 } from "@/types/editor-v2";

type Props = {
  clips: TimelineClipV2[];
  audioClips: TimelineClipV2[];
  playheadSec: number;
  isPlaying: boolean;
  projectDurationSec: number;
  loopEnabled: boolean;
  onPlayheadChange: (nextPlayheadSec: number) => void;
  onPlaybackStateChange: (isPlaying: boolean) => void;
  onReplay: () => void;
  onPlaybackNotice: (text: string) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function Html5PreviewEngine({
  clips,
  audioClips,
  playheadSec,
  isPlaying,
  projectDurationSec,
  loopEnabled,
  onPlayheadChange,
  onPlaybackStateChange,
  onReplay,
  onPlaybackNotice,
}: Props) {
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const rafIdRef = useRef<number | null>(null);
  const activeVideoIdRef = useRef<string | null>(null);
  const activeAudioIdRef = useRef<string | null>(null);
  const lastEmittedPlayheadRef = useRef<number>(0);
  const wasPlayingRef = useRef(false);
  const playClockStartPerfMsRef = useRef<number | null>(null);
  const playClockStartTimelineSecRef = useRef(0);
  const [enginePlayheadSec, setEnginePlayheadSec] = useState(playheadSec);
  const emptyActiveSinceMsRef = useRef<number | null>(null);

  const sortedClips = useMemo(
    () => [...clips].sort((a, b) => a.timelineStartSec - b.timelineStartSec),
    [clips]
  );

  const effectivePlayheadSec = isPlaying ? enginePlayheadSec : playheadSec;

  const activeClip = useMemo(() => {
    return sortedClips.find((clip) => {
      const clipEnd = clip.timelineStartSec + clip.timelineDurationSec;
      return (
        effectivePlayheadSec >= clip.timelineStartSec &&
        effectivePlayheadSec < clipEnd
      );
    });
  }, [effectivePlayheadSec, sortedClips]);

  const sortedAudioClips = useMemo(
    () => [...audioClips].sort((a, b) => a.timelineStartSec - b.timelineStartSec),
    [audioClips]
  );

  const activeAudioClip = useMemo(() => {
    return sortedAudioClips.find((clip) => {
      const clipEnd = clip.timelineStartSec + clip.timelineDurationSec;
      return (
        effectivePlayheadSec >= clip.timelineStartSec &&
        effectivePlayheadSec < clipEnd
      );
    });
  }, [effectivePlayheadSec, sortedAudioClips]);

  useEffect(() => {
    if (!isPlaying) setEnginePlayheadSec(playheadSec);
  }, [isPlaying, playheadSec]);

  const seekWhenReady = (media: HTMLMediaElement, targetTimeSec: number): Promise<void> => {
    if (media.readyState >= 1) {
      media.currentTime = targetTimeSec;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const onLoadedMetadata = () => {
        media.currentTime = targetTimeSec;
        media.removeEventListener("loadedmetadata", onLoadedMetadata);
        resolve();
      };
      media.addEventListener("loadedmetadata", onLoadedMetadata);
    });
  };

  const playWhenReady = (media: HTMLMediaElement): Promise<void> => {
    if (media.readyState >= 2) {
      return media.play();
    }
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        media.removeEventListener("canplay", onCanPlay);
        media.removeEventListener("error", onError);
      };
      const onCanPlay = () => {
        cleanup();
        void media.play().then(() => resolve()).catch(reject);
      };
      const onError = () => {
        cleanup();
        reject(new Error("media_error"));
      };
      media.addEventListener("canplay", onCanPlay);
      media.addEventListener("error", onError);
    });
  };

  const isIgnorableMediaError = (err: unknown): boolean => {
    const name = (err as { name?: string } | null)?.name;
    return (
      name === "AbortError" ||
      name === "NotAllowedError" ||
      name === "NotSupportedError"
    );
  };

  useEffect(() => {
    const syncActiveMedia = async () => {
      const activeVideoEl = activeClip ? videoElsRef.current.get(activeClip.id) ?? null : null;
      const activeAudioEl = activeAudioClip
        ? audioElsRef.current.get(activeAudioClip.id) ?? null
        : null;
      const videoChanged = activeVideoIdRef.current !== (activeClip?.id ?? null);
      const audioChanged = activeAudioIdRef.current !== (activeAudioClip?.id ?? null);
      activeVideoIdRef.current = activeClip?.id ?? null;
      activeAudioIdRef.current = activeAudioClip?.id ?? null;

      // Pause non-active stacked slots.
      videoElsRef.current.forEach((el, id) => {
        if (!activeClip || id !== activeClip.id) {
          if (!el.paused) el.pause();
        }
      });
      audioElsRef.current.forEach((el, id) => {
        if (!activeAudioClip || id !== activeAudioClip.id) {
          if (!el.paused) el.pause();
        }
      });

      if (!activeVideoEl && !activeAudioEl) {
        const now = performance.now();
        if (emptyActiveSinceMsRef.current == null) {
          emptyActiveSinceMsRef.current = now;
        }
        // Avoid hard failure on transient active-clip gaps during drag/reorder.
        if (now - emptyActiveSinceMsRef.current > 350) {
          onPlaybackStateChange(false);
        }
        return;
      }
      emptyActiveSinceMsRef.current = null;

      try {
        if (activeVideoEl && activeClip) {
          const videoLocalTime = clamp(
            activeClip.sourceOffsetSec +
              (effectivePlayheadSec - activeClip.timelineStartSec),
            0,
            Number.MAX_SAFE_INTEGER
          );
          if ((!isPlaying || videoChanged) && Math.abs(activeVideoEl.currentTime - videoLocalTime) > 0.03) {
            void seekWhenReady(activeVideoEl, videoLocalTime);
          }
        }
        if (activeAudioEl && activeAudioClip) {
          const audioLocalTime = clamp(
            activeAudioClip.sourceOffsetSec +
              (effectivePlayheadSec - activeAudioClip.timelineStartSec),
            0,
            Number.MAX_SAFE_INTEGER
          );
          if ((!isPlaying || audioChanged) && Math.abs(activeAudioEl.currentTime - audioLocalTime) > 0.03) {
            void seekWhenReady(activeAudioEl, audioLocalTime);
          }
        }

        if (isPlaying) {
          const playVideo =
            activeVideoEl && activeVideoEl.paused
              ? playWhenReady(activeVideoEl)
              : Promise.resolve();
          const playAudio =
            activeAudioEl && activeAudioEl.paused
              ? playWhenReady(activeAudioEl)
              : Promise.resolve();
          const results = await Promise.allSettled([playVideo, playAudio]);
          const hardFailures = results.filter(
            (r) =>
              r.status === "rejected" &&
              !isIgnorableMediaError((r as PromiseRejectedResult).reason)
          );
          if (hardFailures.length > 0) {
            onPlaybackNotice("Media transition warning. Continuing playback.");
          }
        }
      } catch (err) {
        // Never hard-stop transport on transition errors; keep clock running.
        if (!isIgnorableMediaError(err)) {
          onPlaybackNotice("Media transition warning. Continuing playback.");
        }
      }
    };
    void syncActiveMedia();
  }, [
    activeAudioClip,
    activeClip,
    isPlaying,
    onPlaybackNotice,
    onPlaybackStateChange,
    effectivePlayheadSec,
  ]);

  useEffect(() => {
    if (!isPlaying) {
      lastEmittedPlayheadRef.current = playheadSec;
      wasPlayingRef.current = false;
      playClockStartPerfMsRef.current = null;
      return;
    }
    if (!wasPlayingRef.current) {
      wasPlayingRef.current = true;
      playClockStartPerfMsRef.current = performance.now();
      playClockStartTimelineSecRef.current = playheadSec;
    }

    const tick = () => {
      const now = performance.now();
      const startPerf = playClockStartPerfMsRef.current ?? now;
      const elapsedSec = (now - startPerf) / 1000;
      const expectedTimeline =
        playClockStartTimelineSecRef.current + Math.max(0, elapsedSec);
      let nextTimeline = clamp(expectedTimeline, 0, projectDurationSec);
      const prevTimeline = lastEmittedPlayheadRef.current;
      const crossedLoopBoundary =
        loopEnabled && prevTimeline >= projectDurationSec - 0.04 && nextTimeline < 0.1;

      // During playback, never allow backward drift at clip boundaries unless this is a loop reset.
      if (!crossedLoopBoundary && nextTimeline + 0.02 < prevTimeline) {
        nextTimeline = prevTimeline;
      }

      lastEmittedPlayheadRef.current = nextTimeline;
      setEnginePlayheadSec(nextTimeline);
      onPlayheadChange(nextTimeline);
      rafIdRef.current = window.requestAnimationFrame(tick);
    };

    rafIdRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [isPlaying, loopEnabled, onPlayheadChange, playheadSec, projectDurationSec]);

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      {sortedClips.length === 0 ? (
        <p className="text-sm text-slate-300">No clip at current playhead.</p>
      ) : null}
      {sortedClips.map((clip) => (
        <video
          key={clip.id}
          ref={(node) => {
            if (!node) {
              videoElsRef.current.delete(clip.id);
              return;
            }
            videoElsRef.current.set(clip.id, node);
          }}
          src={clip.src}
          className={`absolute inset-0 h-full w-full object-contain ${
            activeClip?.id === clip.id ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          controls={false}
          playsInline
          preload="auto"
          muted
        />
      ))}
      {sortedAudioClips.map((clip) => (
        <audio
          key={clip.id}
          ref={(node) => {
            if (!node) {
              audioElsRef.current.delete(clip.id);
              return;
            }
            audioElsRef.current.set(clip.id, node);
          }}
          src={clip.src}
          preload="auto"
        />
      ))}
    </div>
  );
}
