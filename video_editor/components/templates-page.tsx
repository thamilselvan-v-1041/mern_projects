"use client";

import { ChevronLeft, LayoutTemplate } from "lucide-react";

type Props = {
  onBackToPreview: () => void;
};

export function TemplatesPage({ onBackToPreview }: Props) {
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
              Templates
            </p>
            <h1 className="text-lg font-semibold text-slate-900">
              Video templates
            </h1>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-8 py-16 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <LayoutTemplate className="h-8 w-8" aria-hidden />
          </span>
          <p className="text-base font-semibold text-slate-800">Coming soon</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
            Starter layouts, intros, and branded packs will appear here. Use
            Preview to edit the timeline, or AI studio to generate media.
          </p>
        </div>
      </div>
    </div>
  );
}
