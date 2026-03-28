"use client";

import { Clapperboard, ChevronLeft, Film } from "lucide-react";
import type { Clip } from "@/types/types";

function clipDisplayName(clip: Clip): string {
  if (clip.fromAI) return "AI video";
  if (clip.overlayClip) return "GIF / stock layer";
  const u = clip.src;
  if (u.startsWith("blob:")) return "Uploaded video";
  try {
    const path = new URL(u, "https://placeholder.local").pathname;
    const seg = path.split("/").filter(Boolean).pop() ?? "";
    const base = seg.split("?")[0] ?? "";
    if (base && base.includes(".")) {
      return decodeURIComponent(base).slice(0, 52);
    }
  } catch {
    /* ignore */
  }
  if (u.includes("open-source-video")) return "Sample library clip";
  return `Clip ${clip.id.slice(-8)}`;
}

function ClipMetaLine({
  clip,
  fps,
}: {
  clip: Clip;
  fps: number;
}) {
  const sec = clip.duration / fps;
  const dur = `${sec < 10 ? sec.toFixed(2) : sec.toFixed(1)}s`;
  const frames = clip.duration;
  const source = clip.fromAI
    ? "AI"
    : clip.overlayClip
      ? "Overlay"
      : clip.src.startsWith("blob:")
        ? "Upload"
        : "Remote";
  return (
    <p className="text-[11px] leading-snug text-slate-500">
      {dur} · {frames} fr · 1920×1080 · {source}
    </p>
  );
}

type Props = {
  clips: Clip[];
  selectedClipId: string | null;
  fps: number;
  onSelectClip: (id: string) => void;
  onSeekToFrame: (frame: number) => void;
  onAddSampleVideo: () => void;
  onBackToPreview: () => void;
  /** Back button label (default: Preview). Use e.g. “All videos” when returning to the project list. */
  backLabel?: string;
};

export function VideosLibraryPanel({
  clips,
  selectedClipId,
  fps,
  onSelectClip,
  onSeekToFrame,
  onAddSampleVideo,
  onBackToPreview,
  backLabel = "Preview",
}: Props) {
  const videoClips = clips.filter((c) => c.mediaType !== "image");

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50/80">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToPreview}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              {backLabel}
            </button>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Videos
              </p>
              <h1 className="text-lg font-semibold text-slate-900">
                Timeline clips
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={onAddSampleVideo}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-800 transition hover:bg-violet-100"
          >
            <Clapperboard className="h-4 w-4" aria-hidden />
            Add sample video
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {videoClips.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-16 text-center">
              <Film className="h-12 w-12 text-slate-300" aria-hidden />
              <p className="text-sm font-medium text-slate-600">No videos yet</p>
              <p className="max-w-md text-xs text-slate-500">
                Add a sample, open Files to upload, or use AI studio / GIF
                images to add layers.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {videoClips.map((clip) => {
                const sel = selectedClipId === clip.id;
                return (
                  <li key={clip.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectClip(clip.id);
                        onSeekToFrame(clip.start);
                      }}
                      className={`flex w-full flex-col overflow-hidden rounded-xl border text-left transition ${
                        sel
                          ? "border-violet-400 bg-violet-50/90 ring-2 ring-violet-200"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="relative aspect-video w-full overflow-hidden bg-black">
                        <video
                          src={clip.src}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                          aria-hidden
                        />
                      </div>
                      <div className="p-3">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {clipDisplayName(clip)}
                        </p>
                        <ClipMetaLine clip={clip} fps={fps} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
