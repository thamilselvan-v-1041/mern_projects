"use client";

import {
  Clapperboard,
  LayoutTemplate,
  MessageSquare,
  Music2,
  Sparkles,
  Type,
  Upload,
} from "lucide-react";

type Props = {
  onAddClip: () => void;
  onAddText: () => void;
  onOpenAiVideo: () => void;
  onOpenAiMusic: () => void;
  onOpenAiText: () => void;
  onUploadAudio: () => void;
};

/**
 * Left rail inspired by Canva’s editor: grouped “Elements” with clear icons and soft cards.
 */
export function EditorSidebar({
  onAddClip,
  onAddText,
  onOpenAiVideo,
  onOpenAiMusic,
  onOpenAiText,
  onUploadAudio,
}: Props) {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Elements
        </p>
      </div>
      <nav className="flex flex-col gap-2 p-3">
        <button
          type="button"
          className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-left text-sm text-slate-400"
          title="Coming soon"
          disabled
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-200/60 text-slate-400">
            <LayoutTemplate className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-medium text-slate-500">Templates</span>
            <span className="text-xs text-slate-400">Soon</span>
          </span>
        </button>

        <button
          type="button"
          onClick={onAddClip}
          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
            <Clapperboard className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">Video</span>
            <span className="text-xs text-slate-500">Add clip to timeline</span>
          </span>
        </button>

        <button
          type="button"
          onClick={onAddText}
          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-sm">
            <Type className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">Text</span>
            <span className="text-xs text-slate-500">Labels &amp; titles</span>
          </span>
        </button>

        <div className="px-0.5 pt-1">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            AI studio
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenAiVideo}
          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-800 transition hover:bg-slate-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white shadow-md">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold">AI video</span>
            <span className="text-xs text-slate-500">
              Chat + Replicate / Veo
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onUploadAudio}
          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
            <Upload className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">
              Upload audio
            </span>
            <span className="text-xs text-slate-500">MP3, WAV…</span>
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenAiMusic}
          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-800 transition hover:bg-slate-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-md">
            <Music2 className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold">AI music</span>
            <span className="text-xs text-slate-500">
              Suno · vocals &amp; genre
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenAiText}
          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-800 transition hover:bg-slate-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-white shadow-md">
            <MessageSquare className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold">AI text</span>
            <span className="text-xs text-slate-500">
              Chat copy · Groq
            </span>
          </span>
        </button>
      </nav>

      <div className="mt-auto border-t border-slate-100 p-3">
        <p className="text-[10px] leading-relaxed text-slate-500">
          AI studio uses a chat box for music (Suno), video, and text. Groq
          key optional for text. Drag timeline blocks to move in time.
        </p>
      </div>
    </aside>
  );
}
