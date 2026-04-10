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
  return `flex w-full items-center justify-center rounded-lg border px-2 py-2.5 transition ${
    active
      ? "border-violet-300 bg-violet-50 text-slate-900 ring-1 ring-violet-200"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
  }`;
}

/** Left rail for the standalone `/editor` window. */
export function EditorWorkspaceSidebar({ navPanel, onNavigate }: Props) {
  return (
    <aside className="flex w-[78px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <nav className="flex flex-col gap-2 p-3">
        <div className="group relative">
          <button
            type="button"
            onClick={() => onNavigate("videos")}
            className={navBtnClass(navPanel === "videos")}
            aria-label="Videos - Clips and AI video"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
              <Clapperboard className="h-4 w-4" aria-hidden />
            </span>
          </button>
          <span className="pointer-events-none absolute left-[calc(100%+6px)] top-1/2 z-[140] hidden w-max -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 shadow-md group-hover:block">
            <span className="block text-[11px] font-semibold leading-tight text-slate-800">
              Videos
            </span>
            <span className="block text-[10px] leading-tight text-slate-500">
              Clips &amp; AI video
            </span>
          </span>
        </div>

        <div className="group relative">
          <button
            type="button"
            onClick={() => onNavigate("audios")}
            className={navBtnClass(navPanel === "audios")}
            aria-label="Audios - AI music and uploads"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <Mic2 className="h-4 w-4" aria-hidden />
            </span>
          </button>
          <span className="pointer-events-none absolute left-[calc(100%+6px)] top-1/2 z-[140] hidden w-max -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 shadow-md group-hover:block">
            <span className="block text-[11px] font-semibold leading-tight text-slate-800">
              Audios
            </span>
            <span className="block text-[10px] leading-tight text-slate-500">
              AI music &amp; uploads
            </span>
          </span>
        </div>

        <div className="group relative">
          <button
            type="button"
            onClick={() => onNavigate("giffy")}
            className={navBtnClass(navPanel === "giffy")}
            aria-label="Giffy - GIF and stock media"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-sm">
              <Images className="h-4 w-4" aria-hidden />
            </span>
          </button>
          <span className="pointer-events-none absolute left-[calc(100%+6px)] top-1/2 z-[140] hidden w-max -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 shadow-md group-hover:block">
            <span className="block text-[11px] font-semibold leading-tight text-slate-800">
              Giffy
            </span>
            <span className="block text-[10px] leading-tight text-slate-500">
              GIF &amp; stock media
            </span>
          </span>
        </div>

        <div className="group relative">
          <button
            type="button"
            onClick={() => onNavigate("text")}
            className={navBtnClass(navPanel === "text")}
            aria-label="Text - Titles and captions"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-sm">
              <Type className="h-4 w-4" aria-hidden />
            </span>
          </button>
          <span className="pointer-events-none absolute left-[calc(100%+6px)] top-1/2 z-[140] hidden w-max -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 shadow-md group-hover:block">
            <span className="block text-[11px] font-semibold leading-tight text-slate-800">
              Text
            </span>
            <span className="block text-[10px] leading-tight text-slate-500">
              Titles &amp; captions
            </span>
          </span>
        </div>

        <div className="group relative">
          <button
            type="button"
            onClick={() => onNavigate("tools")}
            className={navBtnClass(navPanel === "tools")}
            aria-label="Tools - Shapes, colors, motion"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
              <PenTool className="h-4 w-4" aria-hidden />
            </span>
          </button>
          <span className="pointer-events-none absolute left-[calc(100%+6px)] top-1/2 z-[140] hidden w-max -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 shadow-md group-hover:block">
            <span className="block text-[11px] font-semibold leading-tight text-slate-800">
              Tools
            </span>
            <span className="block text-[10px] leading-tight text-slate-500">
              Shapes, colors, motion
            </span>
          </span>
        </div>

        <div className="group relative">
          <button
            type="button"
            onClick={() => onNavigate("files")}
            className={navBtnClass(navPanel === "files")}
            aria-label="Files - Upload video and audio"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
              <FileUp className="h-4 w-4" aria-hidden />
            </span>
          </button>
          <span className="pointer-events-none absolute left-[calc(100%+6px)] top-1/2 z-[140] hidden w-max -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 shadow-md group-hover:block">
            <span className="block text-[11px] font-semibold leading-tight text-slate-800">
              Files
            </span>
            <span className="block text-[10px] leading-tight text-slate-500">
              Upload video &amp; audio
            </span>
          </span>
        </div>
      </nav>
    </aside>
  );
}
