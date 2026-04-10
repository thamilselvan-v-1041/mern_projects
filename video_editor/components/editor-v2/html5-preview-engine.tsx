"use client";

import { useEffect, useMemo, useRef } from "react";
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const syncingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  const sortedClips = useMemo(
    () => [...clips].sort((a, b) => a.timelineStartSec - b.timelineStartSec),
    [clips]
  );

  const activeClip = useMemo(() => {
    return sortedClips.find((clip) => {
      const clipEnd = clip.timelineStartSec + clip.timelineDurationSec;
      return playheadSec >= clip.timelineStartSec && playheadSec < clipEnd;
    });
  }, [sortedClips, playheadSec]);

  const sortedAudioClips = useMemo(
    () => [...audioClips].sort((a, b) => a.timelineStartSec - b.timelineStartSec),
    [audioClips]
  );

  const activeAudioClip = useMemo(() => {
    return sortedAudioClips.find((clip) => {
      const clipEnd = clip.timelineStartSec + clip.timelineDurationSec;
      return playheadSec >= clip.timelineStartSec && playheadSec < clipEnd;
    });
  }, [sortedAudioClips, playheadSec]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!activeClip) return;

    const clipLocalTime = clamp(
      activeClip.sourceOffsetSec + (playheadSec - activeClip.timelineStartSec),
      0,
      Number.MAX_SAFE_INTEGER
    );

    if (Math.abs(video.currentTime - clipLocalTime) > 0.05) {
      syncingRef.current = true;
      video.currentTime = clipLocalTime;
      queueMicrotask(() => {
        syncingRef.current = false;
      });
    }
  }, [activeClip, playheadSec]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!activeAudioClip) return;

    const clipLocalTime = clamp(
      activeAudioClip.sourceOffsetSec + (playheadSec - activeAudioClip.timelineStartSec),
      0,
      Number.MAX_SAFE_INTEGER
    );
    if (Math.abs(audio.currentTime - clipLocalTime) > 0.08) {
      audio.currentTime = clipLocalTime;
    }
  }, [activeAudioClip, playheadSec]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video && !audio) return;

    if (!activeClip && !activeAudioClip) {
      if (video && !video.paused) video.pause();
      if (audio && !audio.paused) audio.pause();
      onPlaybackStateChange(false);
      return;
    }

    if (isPlaying) {
      const playVideo = activeClip && video ? video.play() : Promise.resolve();
      const playAudio = activeAudioClip && audio ? audio.play() : Promise.resolve();
      void Promise.all([playVideo, playAudio]).catch(() => {
        onPlaybackStateChange(false);
        onPlaybackNotice("Playback blocked by browser autoplay policy.");
      });
      return;
    }

    if (video && !video.paused) video.pause();
    if (audio && !audio.paused) audio.pause();
  }, [activeAudioClip, activeClip, isPlaying, onPlaybackNotice, onPlaybackStateChange]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const tick = () => {
      const currentClip = activeClip;
      if (currentClip && !video.paused && !syncingRef.current) {
        const timelineTime =
          currentClip.timelineStartSec +
          (video.currentTime - currentClip.sourceOffsetSec);
        onPlayheadChange(clamp(timelineTime, 0, projectDurationSec));
      }
      rafIdRef.current = window.requestAnimationFrame(tick);
    };

    rafIdRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [activeClip, onPlayheadChange, projectDurationSec]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onEnded = () => {
      const atProjectEnd = playheadSec >= projectDurationSec - 0.04;
      if (!atProjectEnd) {
        onPlaybackStateChange(false);
        return;
      }

      if (!loopEnabled) {
        onPlaybackStateChange(false);
        onPlaybackNotice("Reached end of timeline.");
        return;
      }

      onReplay();
      onPlaybackNotice("Loop replay.");
      onPlayheadChange(0);
      onPlaybackStateChange(true);
    };

    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("ended", onEnded);
    };
  }, [
    loopEnabled,
    onPlaybackNotice,
    onPlaybackStateChange,
    onPlayheadChange,
    onReplay,
    playheadSec,
    projectDurationSec,
  ]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      {activeClip ? (
        <video
          ref={videoRef}
          key={activeClip.id}
          src={activeClip.src}
          className="h-full w-full object-contain"
          controls={false}
          playsInline
          preload="metadata"
          muted
        />
      ) : (
        <p className="text-sm text-slate-300">No clip at current playhead.</p>
      )}
      {activeAudioClip ? (
        <audio
          ref={audioRef}
          key={activeAudioClip.id}
          src={activeAudioClip.src}
          preload="metadata"
        />
      ) : null}
    </div>
  );
}
