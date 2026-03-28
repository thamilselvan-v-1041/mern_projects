"use client";

import {
  Clapperboard,
  FileUp,
  Images,
  Mic2,
  PenTool,
  Type,
} from "lucide-react";

export type WorkspaceNavPanel =
  | "videos"
  | "audios"
  | "giffy"
  | "text"
  | "tools"
  | "files";

type Props = {
  navPanel: WorkspaceNavPanel;
  onNavigate: (panel: WorkspaceNavPanel) => void;
};

function navBtnClass(active: boolean) {
  return `flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
    active
      ? "border-violet-300 bg-violet-50 text-slate-900 ring-1 ring-violet-200"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
  }`;
}

/** Left rail for the standalone `/editor` window. */
export function EditorWorkspaceSidebar({ navPanel, onNavigate }: Props) {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Editor
        </p>
      </div>
      <nav className="flex flex-col gap-2 p-3">
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
            <span className="text-xs text-slate-500">Clips &amp; AI video</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("audios")}
          className={navBtnClass(navPanel === "audios")}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
            <Mic2 className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">Audios</span>
            <span className="text-xs text-slate-500">AI music &amp; uploads</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("giffy")}
          className={navBtnClass(navPanel === "giffy")}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-sm">
            <Images className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">Giffy</span>
            <span className="text-xs text-slate-500">GIF &amp; stock media</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("text")}
          className={navBtnClass(navPanel === "text")}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-sm">
            <Type className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">Text</span>
            <span className="text-xs text-slate-500">Titles &amp; captions</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("tools")}
          className={navBtnClass(navPanel === "tools")}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <PenTool className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">Tools</span>
            <span className="text-xs text-slate-500">
              Shapes, colors, motion
            </span>
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
            <span className="text-xs text-slate-500">Upload video &amp; audio</span>
          </span>
        </button>
      </nav>

      <div className="mt-auto border-t border-slate-100 p-3">
        <p className="text-[10px] leading-relaxed text-slate-500">
          Three columns: categories · inspector &amp; layer properties · preview
          &amp; timeline.
        </p>
      </div>
    </aside>
  );
}
