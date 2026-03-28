"use client";

import { Clapperboard, Monitor } from "lucide-react";

export type HubNavPanel = "canvas" | "videos";

type Props = {
  navPanel: HubNavPanel;
  onNavigate: (panel: HubNavPanel) => void;
};

function navBtnClass(active: boolean) {
  return `flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
    active
      ? "border-violet-300 bg-violet-50 text-slate-900 ring-1 ring-violet-200"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
  }`;
}

export function HubSidebar({ navPanel, onNavigate }: Props) {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Workspace
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
            <span className="text-xs text-slate-500">Home &amp; overview</span>
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
            <span className="text-xs text-slate-500">
              Open editor in new tab
            </span>
          </span>
        </button>
      </nav>
      <div className="mt-auto border-t border-slate-100 p-3">
        <p className="text-[10px] leading-relaxed text-slate-500">
          New video and Edit launch the full editor in a separate browser tab.
        </p>
      </div>
    </aside>
  );
}
