"use client";

import { ChevronLeft, Music2, Plus, Volume2 } from "lucide-react";
import type { TimelineAudio } from "@/types/types";

/** Small royalty-free clips via jsDelivr (npm `test-audio` package). */
export const SAMPLE_AUDIO_ITEMS: {
  src: string;
  label: string;
  fallbackSec: number;
}[] = [
  {
    src: "https://cdn.jsdelivr.net/npm/test-audio@1.0.0/test_1.ogg",
    label: "Sample loop A",
    fallbackSec: 2,
  },
  {
    src: "https://cdn.jsdelivr.net/npm/test-audio@1.0.0/test_2.ogg",
    label: "Sample loop B",
    fallbackSec: 12,
  },
  {
    src: "https://cdn.jsdelivr.net/npm/test-audio@1.0.0/test_4.wav",
    label: "Sample clip (WAV)",
    fallbackSec: 1.5,
  },
];

function audioDisplayName(track: TimelineAudio): string {
  const u = track.src;
  if (u.startsWith("blob:")) return track.label || "Uploaded audio";
  if (SAMPLE_AUDIO_ITEMS.some((s) => s.src === u)) {
    return track.label || "Sample audio";
  }
  return track.label?.trim() || `Audio ${track.id.slice(-8)}`;
}

function AudioMetaLine({ track, fps }: { track: TimelineAudio; fps: number }) {
  const sec = track.duration / fps;
  const dur = `${sec < 10 ? sec.toFixed(2) : sec.toFixed(1)}s`;
  const source = track.src.startsWith("blob:")
    ? "Upload"
    : SAMPLE_AUDIO_ITEMS.some((s) => s.src === track.src)
      ? "Sample"
      : "Remote";
  return (
    <p className="text-[11px] leading-snug text-slate-500">
      {dur} · {track.duration} fr · {source}
    </p>
  );
}

type Props = {
  audioTracks: TimelineAudio[];
  selectedAudioId: string | null;
  fps: number;
  onSelectAudio: (id: string) => void;
  onSeekToFrame: (frame: number) => void;
  onAddSampleAudio: (
    src: string,
    label: string,
    fallbackDurationSec: number
  ) => void;
  onBackToPreview: () => void;
  backLabel?: string;
};

export function AudiosLibraryPanel({
  audioTracks,
  selectedAudioId,
  fps,
  onSelectAudio,
  onSeekToFrame,
  onAddSampleAudio,
  onBackToPreview,
  backLabel = "Preview",
}: Props) {
  const sorted = [...audioTracks].sort((a, b) => a.start - b.start);

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
                Audios
              </p>
              <h1 className="text-lg font-semibold text-slate-900">
                Timeline audio
              </h1>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-4">
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Sample library
            </p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SAMPLE_AUDIO_ITEMS.map((item) => (
                <li
                  key={item.src}
                  className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <div className="flex items-center gap-2 border-b border-slate-100 bg-emerald-50/50 px-3 py-2">
                    <Volume2
                      className="h-4 w-4 shrink-0 text-emerald-700"
                      aria-hidden
                    />
                    <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                      {item.label}
                    </p>
                  </div>
                  <div className="p-3">
                    <audio
                      src={item.src}
                      controls
                      preload="metadata"
                      className="mb-3 h-9 w-full"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onAddSampleAudio(item.src, item.label, item.fallbackSec)
                      }
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      Add at playhead
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              On your timeline
            </p>
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center">
                <Music2 className="h-10 w-10 text-slate-300" aria-hidden />
                <p className="text-sm font-medium text-slate-600">
                  No audio clips yet
                </p>
                <p className="max-w-md text-xs text-slate-500">
                  Add a sample above, upload from Files, or generate with AI
                  music below.
                </p>
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sorted.map((track) => {
                  const sel = selectedAudioId === track.id;
                  return (
                    <li key={track.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectAudio(track.id);
                          onSeekToFrame(track.start);
                        }}
                        className={`flex w-full flex-col overflow-hidden rounded-xl border text-left transition ${
                          sel
                            ? "border-emerald-400 bg-emerald-50/90 ring-2 ring-emerald-200"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-3">
                          <Music2
                            className="h-8 w-8 shrink-0 text-emerald-600"
                            aria-hidden
                          />
                          <audio
                            src={track.src}
                            controls
                            preload="metadata"
                            className="h-8 min-w-0 flex-1"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="p-3">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {audioDisplayName(track)}
                          </p>
                          <AudioMetaLine track={track} fps={fps} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
