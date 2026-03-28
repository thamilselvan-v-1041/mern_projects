"use client";

import { Clapperboard, Film, Pencil, Plus, Trash2 } from "lucide-react";
import type { StoredVideoProject } from "@/lib/video-project-storage";

type Props = {
  projects: StoredVideoProject[];
  onCreateNew: () => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onBackToPreview: () => void;
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function VideoProjectsHome({
  projects,
  onCreateNew,
  onOpenProject,
  onDeleteProject,
  onBackToPreview,
}: Props) {
  const sorted = [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50/80">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={onBackToPreview}
              className="mb-2 text-xs font-semibold text-violet-600 hover:text-violet-800"
            >
              ← Preview
            </button>
            <h1 className="text-xl font-bold text-slate-900">Your videos</h1>
            <p className="mt-1 text-sm text-slate-600">
              New video and Edit open the editor in a new tab (same device —
              projects are stored in this browser).
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New video
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-8 py-16 text-center">
              <Film className="mb-4 h-14 w-14 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">No videos yet</p>
              <p className="mt-2 max-w-sm text-xs text-slate-500">
                New video opens a blank project in a new tab. Use Videos,
                Audios, Giffy, Text, Tools, and Files in the editor sidebar to
                build your timeline.
              </p>
              <button
                type="button"
                onClick={onCreateNew}
                className="mt-6 inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100"
              >
                <Clapperboard className="h-4 w-4" />
                Create first video
              </button>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {sorted.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold text-slate-900">
                      {p.name || "Untitled"}
                    </span>
                    <span className="text-xs text-slate-500">
                      {p.clips.length} clip{p.clips.length === 1 ? "" : "s"} ·{" "}
                      {p.textOverlays.length} text · {p.audioTracks.length} audio
                      · {formatDate(p.updatedAt)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenProject(p.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          typeof window !== "undefined" &&
                          window.confirm(
                            `Delete “${p.name || "Untitled"}”? This cannot be undone.`
                          )
                        ) {
                          onDeleteProject(p.id);
                        }
                      }}
                      className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                      aria-label="Delete project"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
