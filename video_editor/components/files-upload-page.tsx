"use client";

import { ChevronLeft, FileAudio, FileVideo, FileUp } from "lucide-react";

type Props = {
  onBackToPreview: () => void;
  onPickVideo: () => void;
  onPickAudio: () => void;
};

export function FilesUploadPage({
  onBackToPreview,
  onPickVideo,
  onPickAudio,
}: Props) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50/80">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-6 py-5">
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToPreview}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Preview
          </button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Files
            </p>
            <h1 className="text-lg font-semibold text-slate-900">
              Upload media
            </h1>
          </div>
        </div>

        <p className="mb-6 text-sm text-slate-600">
          Add video or audio files to the timeline at the current playhead.
          Duration is read from file metadata when possible.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={onPickVideo}
            className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-amber-300 hover:bg-amber-50/50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
              <FileVideo className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-base font-semibold text-slate-900">
              Upload video
            </span>
            <span className="text-sm text-slate-500">
              MP4, WebM, MOV… — adds a clip on the video track
            </span>
          </button>

          <button
            type="button"
            onClick={onPickAudio}
            className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <FileAudio className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-base font-semibold text-slate-900">
              Upload audio
            </span>
            <span className="text-sm text-slate-500">
              MP3, WAV, AAC… — adds a block on the audio track
            </span>
          </button>
        </div>

        <div className="mt-8 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <FileUp className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p>
            Tip: you can also open this page anytime from the left menu. Files
            are loaded in the browser; large uploads may take a moment.
          </p>
        </div>
      </div>
    </div>
  );
}
