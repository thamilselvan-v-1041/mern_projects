"use client";

import { Clapperboard, Monitor } from "lucide-react";

type Props = {
  onOpenVideos: () => void;
};

/** Home / Preview tab — no player; editing happens under Videos after opening a project. */
export function PreviewLandingPage({ onOpenVideos }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white px-6 py-12">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
          <Monitor className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Video workspace
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Go to <strong className="font-semibold text-slate-800">Videos</strong>{" "}
          to start a project. <strong className="font-semibold text-slate-800">New video</strong>{" "}
          and <strong className="font-semibold text-slate-800">Edit</strong> open
          the full editor in a <strong className="font-semibold text-slate-800">new browser tab</strong>{" "}
          with timeline, preview, and media tools.
        </p>
        <button
          type="button"
          onClick={onOpenVideos}
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-violet-700"
        >
          <Clapperboard className="h-4 w-4" aria-hidden />
          Open Videos
        </button>
      </div>
    </div>
  );
}
