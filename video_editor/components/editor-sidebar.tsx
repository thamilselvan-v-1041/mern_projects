"use client";

import {
  Clapperboard,
  FileUp,
  Images,
  LayoutTemplate,
  Monitor,
  Sparkles,
} from "lucide-react";

export type EditorNavPanel =
  | "canvas"
  | "templates"
  | "videos"
  | "ai-studio"
  | "gif-images"
  | "files";

type Props = {
  navPanel: EditorNavPanel;
  onNavigate: (panel: EditorNavPanel) => void;
};

function navBtnClass(active: boolean) {
  return `flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
    active
      ? "border-violet-300 bg-violet-50 text-slate-900 ring-1 ring-violet-200"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
  }`;
}

/**
 * Each item opens its own full page in the main workspace (Preview = timeline player).
 */
export function EditorSidebar({ navPanel, onNavigate }: Props) {
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
          onClick={() => onNavigate("canvas")}
          className={navBtnClass(navPanel === "canvas")}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-sm">
            <Monitor className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">Preview</span>
            <span className="text-xs text-slate-500">
              Home (opens timeline if a video is open)
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("templates")}
          className={navBtnClass(navPanel === "templates")}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-slate-400 to-slate-600 text-white shadow-sm">
            <LayoutTemplate className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">Templates</span>
            <span className="text-xs text-slate-500">Layouts (soon)</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("videos")}
          className={navBtnClass(navPanel === "videos")}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
            <Clapperboard className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">Videos</span>
            <span className="text-xs text-slate-500">Your timeline clips</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("ai-studio")}
          className={navBtnClass(navPanel === "ai-studio")}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">AI studio</span>
            <span className="text-xs text-slate-500">
              Video, music &amp; text
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("gif-images")}
          className={navBtnClass(navPanel === "gif-images")}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-sm">
            <Images className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">GIF images</span>
            <span className="text-xs text-slate-500">Giphy + Pexels</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("files")}
          className={navBtnClass(navPanel === "files")}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
            <FileUp className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">Files</span>
            <span className="text-xs text-slate-500">Upload audio &amp; video</span>
          </span>
        </button>
      </nav>

      <div className="mt-auto border-t border-slate-100 p-3">
        <p className="text-[10px] leading-relaxed text-slate-500">
          Open or create a video under Videos, then use AI studio, GIF images,
          or Files to add layers — the timeline stays visible while a project is
          open.
        </p>
      </div>
    </aside>
  );
}
