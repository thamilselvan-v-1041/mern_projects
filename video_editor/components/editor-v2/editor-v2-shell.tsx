"use client";

import { useMemo, useState } from "react";
import Html5PreviewEngine from "@/components/editor-v2/html5-preview-engine";
import TimelineV2 from "@/components/editor-v2/timeline-v2";
import type { EditorV2Project } from "@/types/editor-v2";

type EditorV2ShellProps = {
  projectId: string;
  playbackSourceUrl?: string;
};

function createInitialProject(
  projectId: string,
  _playbackSourceUrl?: string
): EditorV2Project {
  return {
    id: projectId,
    fps: 30,
    totalFrames: 900,
    tracks: [
      {
        id: "track-video",
        label: "Video",
        clips: [],
      },
      {
        id: "track-audio",
        label: "Audio",
        clips: [],
      },
    ],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function EditorV2Shell({
  projectId,
  playbackSourceUrl,
}: EditorV2ShellProps) {
  const [project, setProject] = useState<EditorV2Project>(() =>
    createInitialProject(projectId, playbackSourceUrl)
  );
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [replayCount, setReplayCount] = useState(0);
  const [notice, setNotice] = useState("Ready.");

  const projectDurationSec = useMemo(
    () => Math.max(project.totalFrames / project.fps, 0.01),
    [project.fps, project.totalFrames]
  );

  const playheadSec = useMemo(
    () => clamp(playheadFrame / project.fps, 0, projectDurationSec),
    [playheadFrame, project.fps, projectDurationSec]
  );

  const timelineClips = useMemo(() => {
    return project.tracks
      .filter((track) => track.id === "track-video")
      .flatMap((track) => track.clips)
      .filter((clip) => Boolean(clip.src))
      .map((clip) => ({
        id: clip.id,
        label: clip.label,
        src: clip.src ?? "",
        timelineStartSec: clip.startFrame / project.fps,
        timelineDurationSec: clip.durationFrames / project.fps,
        sourceOffsetSec: clip.trimInFrames / project.fps,
      }));
  }, [project.fps, project.tracks]);

  const timelineAudioClips = useMemo(() => {
    return project.tracks
      .filter((track) => track.id === "track-audio")
      .flatMap((track) => track.clips)
      .filter((clip) => Boolean(clip.src))
      .map((clip) => ({
        id: clip.id,
        label: clip.label,
        src: clip.src ?? "",
        timelineStartSec: clip.startFrame / project.fps,
        timelineDurationSec: clip.durationFrames / project.fps,
        sourceOffsetSec: clip.trimInFrames / project.fps,
      }));
  }, [project.fps, project.tracks]);

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-800">Editor V2</h1>
          <p className="mt-1 text-sm text-slate-600">
            Project: {project.id} | Playhead: {playheadFrame}f ({playheadSec.toFixed(2)}s)
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsPlaying(true);
                setNotice("Playing.");
              }}
              className="rounded-md bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500"
            >
              Play
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setNotice("Paused.");
              }}
              className="rounded-md bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-600"
            >
              Pause
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setPlayheadFrame(0);
                setNotice("Seeked to start.");
              }}
              className="rounded-md bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-600"
            >
              Seek 0s
            </button>
            <label className="ml-2 inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={loopEnabled}
                onChange={(event) => setLoopEnabled(event.target.checked)}
              />
              Loop
            </label>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-5">
            <p>Mode: {isPlaying ? "playing" : "paused"}</p>
            <p>Playhead: {playheadSec.toFixed(2)}s</p>
            <p>Duration: {projectDurationSec.toFixed(2)}s</p>
            <p>Replay count: {replayCount}</p>
            <p>Clips w/ src: {timelineClips.length}</p>
          </div>
          <p className="mt-2 text-xs text-emerald-700">Status: {notice}</p>
        </div>

        <div className="h-[360px] overflow-hidden rounded-xl border border-slate-200 bg-black shadow-sm">
          <Html5PreviewEngine
            clips={timelineClips}
            audioClips={timelineAudioClips}
            playheadSec={playheadSec}
            isPlaying={isPlaying}
            projectDurationSec={projectDurationSec}
            loopEnabled={loopEnabled}
            onPlayheadChange={(nextSec) => {
              setPlayheadFrame(
                clamp(Math.round(nextSec * project.fps), 0, project.totalFrames)
              );
            }}
            onPlaybackStateChange={setIsPlaying}
            onReplay={() => setReplayCount((count) => count + 1)}
            onPlaybackNotice={setNotice}
          />
        </div>

        {!playbackSourceUrl ? (
          <p className="text-xs text-amber-700">
            No `src` query parameter provided. Add `?src=https://...` to preview clips.
          </p>
        ) : null}

        <TimelineV2
          project={project}
          playheadFrame={playheadFrame}
          onPlayheadChange={(frame) => {
            setPlayheadFrame(frame);
            setIsPlaying(false);
          }}
          onProjectChange={setProject}
        />
      </div>
    </div>
  );
}
