"use client";

import React from "react";
import type {
  Clip,
  TextOverlay,
  TimelineAudio,
} from "@/types/types";
import { TextDesignPanel } from "./text-design-panel";

function PercentSliderRow({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  suffix = "%",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <label className="mb-2 block text-xs text-slate-600">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-violet-600"
      />
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={Math.round(value)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) {
              onChange(Math.max(min, Math.min(max, n)));
            }
          }}
          className="w-16 rounded border border-slate-200 px-1.5 py-1 text-xs tabular-nums text-slate-800"
        />
        <span className="text-[10px] font-medium tabular-nums text-slate-500">
          {suffix}
        </span>
      </div>
    </label>
  );
}

type Sel =
  | { kind: "clip"; id: string }
  | { kind: "text"; id: string }
  | { kind: "audio"; id: string };

type Props = {
  selected: Sel | null;
  clip: Clip | null;
  textOverlay: TextOverlay | null;
  audioTrack: TimelineAudio | null;
  onUpdateClip: (id: string, patch: Partial<Clip>) => void;
  onUpdateText: (id: string, patch: Partial<TextOverlay>) => void;
  onUpdateAudio: (id: string, patch: Partial<TimelineAudio>) => void;
  /** `rail` = narrow right strip (legacy). `embedded` = middle inspector column. */
  variant?: "rail" | "embedded";
  /** Appended to embedded shell (e.g. `border-t-0` when panel sits flush under a header). */
  shellClassName?: string;
};

export function LayerPropertiesPanel({
  selected,
  clip,
  textOverlay,
  audioTrack,
  onUpdateClip,
  onUpdateText,
  onUpdateAudio,
  variant = "rail",
  shellClassName = "",
}: Props) {
  if (!selected) return null;

  const shell =
    variant === "embedded"
      ? `flex w-full min-h-0 flex-col border-t border-slate-200 bg-white${shellClassName ? ` ${shellClassName}` : ""}`
      : "flex w-[280px] shrink-0 flex-col border-l border-slate-200 bg-white";

  const bodyScroll =
    variant === "embedded"
      ? "min-h-0 flex-1 space-y-4 overflow-y-auto p-3"
      : "max-h-[min(72vh,620px)] space-y-4 overflow-y-auto p-3";

  if (selected.kind === "clip") return null;

  if (selected.kind === "text" && textOverlay) {
    return (
      <aside className={`${shell} flex min-h-0 flex-col`}>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <TextDesignPanel overlay={textOverlay} onUpdate={onUpdateText} />
        </div>
        <div className="shrink-0 space-y-3 border-t border-slate-200 bg-white p-3">
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-700">
              Size
            </p>
            <p className="mb-2 text-[10px] leading-snug text-slate-500">
              Box width on the canvas; type size is under Typography. Preview
              handles resize width (sides) and type size (top/bottom).
            </p>
            <PercentSliderRow
              label="Box width"
              value={textOverlay.widthPct ?? 92}
              onChange={(n) =>
                onUpdateText(textOverlay.id, {
                  widthPct: Math.max(18, Math.min(100, n)),
                })
              }
              min={18}
              max={100}
            />
          </div>
        </div>
      </aside>
    );
  }

  if (selected.kind === "audio" && audioTrack) {
    return (
      <aside className={shell}>
        <div className="space-y-4 p-3">
          <p className="text-xs text-slate-500">
            Audio is heard in preview; there is no video box. Adjust levels and
            fades here.
          </p>
          <label className="block text-xs text-slate-600">
            Volume %
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((audioTrack.volume ?? 1) * 100)}
              onChange={(e) =>
                onUpdateAudio(audioTrack.id, {
                  volume: Number(e.target.value) / 100,
                })
              }
              className="mt-1 w-full"
            />
            <span className="tabular-nums text-slate-500">
              {Math.round((audioTrack.volume ?? 1) * 100)}%
            </span>
          </label>
          <label className="block text-xs text-slate-600">
            Fade in (frames)
            <input
              type="number"
              min={0}
              max={300}
              value={audioTrack.fadeInFrames ?? 0}
              onChange={(e) =>
                onUpdateAudio(audioTrack.id, {
                  fadeInFrames: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs text-slate-600">
            Fade out (frames)
            <input
              type="number"
              min={0}
              max={300}
              value={audioTrack.fadeOutFrames ?? 0}
              onChange={(e) =>
                onUpdateAudio(audioTrack.id, {
                  fadeOutFrames: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </aside>
    );
  }

  return null;
}
