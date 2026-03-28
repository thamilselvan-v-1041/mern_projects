"use client";

import { Type } from "lucide-react";

type Props = {
  onAddText: () => void;
};

export function TextWorkspacePanel({ onAddText }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-slate-50/80 p-4">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Text</h2>
        <p className="mt-1 text-xs text-slate-600">
          Add a text layer at the end of the timeline. Select it to edit copy,
          font size, color, and animation in the properties panel.
        </p>
      </div>
      <button
        type="button"
        onClick={onAddText}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-pink-700"
      >
        <Type className="h-4 w-4" aria-hidden />
        Add text layer
      </button>
    </div>
  );
}
