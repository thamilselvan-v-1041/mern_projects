"use client";

import { Heading1, Type } from "lucide-react";

type Props = {
  onAddText: () => void;
};

export function TextWorkspacePanel({ onAddText }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50/80 px-2 py-2">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="mb-2 pl-4 pr-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Text styles
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            Click a style to add and edit from properties.
          </p>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onAddText}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-violet-300 hover:shadow"
          >
            <div className="flex items-center gap-2 text-slate-900">
              <Heading1 className="h-4 w-4 text-violet-600" aria-hidden />
              <span className="text-lg font-extrabold leading-tight">Add a heading</span>
            </div>
          </button>

          <button
            type="button"
            onClick={onAddText}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-violet-300 hover:shadow"
          >
            <p className="text-base font-semibold leading-tight text-slate-900">
              Add a subheading
            </p>
          </button>

          <button
            type="button"
            onClick={onAddText}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-violet-300 hover:shadow"
          >
            <p className="text-sm font-medium leading-tight text-slate-800">
              Add a little bit of body text
            </p>
          </button>

          <button
            type="button"
            onClick={onAddText}
            className="w-full rounded-xl border border-slate-200 bg-gradient-to-r from-violet-600 to-fuchsia-600 p-3 text-left shadow-sm transition hover:from-violet-700 hover:to-fuchsia-700"
          >
            <p className="text-lg font-extrabold leading-tight text-white">PROMO TITLE</p>
          </button>
        </div>
      </div>
    </div>
  );
}
