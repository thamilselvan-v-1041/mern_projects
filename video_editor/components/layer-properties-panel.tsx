"use client";

import React from "react";
import type {
  Clip,
  LayerTransitionPreset,
  TextOverlay,
  TimelineAudio,
} from "@/types/types";
import { TextDesignPanel } from "./text-design-panel";

const TRANSITION_OPTIONS: { id: LayerTransitionPreset; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slideLeft", label: "Slide left" },
  { id: "slideRight", label: "Slide right" },
  { id: "slideUp", label: "Slide up" },
  { id: "slideDown", label: "Slide down" },
  { id: "zoomIn", label: "Zoom" },
];

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

  if (selected.kind === "clip" && clip) {
    return (
      <aside className={shell}>
        <header className="border-b border-slate-200 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Video clip
          </p>
          <p className="truncate text-sm font-medium text-slate-900">
            {clip.overlayClip
              ? clip.mediaType === "image"
                ? "Photo layer"
                : "GIF layer"
              : clip.fromAI
                ? "AI video"
                : "Clip"}{" "}
            · preview or timeline
          </p>
        </header>
        <div className={bodyScroll}>
          <section>
            <p className="mb-2 text-xs font-semibold text-slate-700">
              Position &amp; scale
            </p>
            <label className="mb-2 block text-xs text-slate-600">
              X % (center)
              <input
                type="range"
                min={0}
                max={100}
                value={clip.posX ?? 50}
                onChange={(e) =>
                  onUpdateClip(clip.id, { posX: Number(e.target.value) })
                }
                className="mt-1 w-full"
              />
              <span className="tabular-nums text-slate-500">
                {Math.round(clip.posX ?? 50)}
              </span>
            </label>
            <label className="mb-2 block text-xs text-slate-600">
              Y % (center)
              <input
                type="range"
                min={0}
                max={100}
                value={clip.posY ?? 50}
                onChange={(e) =>
                  onUpdateClip(clip.id, { posY: Number(e.target.value) })
                }
                className="mt-1 w-full"
              />
              <span className="tabular-nums text-slate-500">
                {Math.round(clip.posY ?? 50)}
              </span>
            </label>
            <label className="block text-xs text-slate-600">
              Scale
              <input
                type="range"
                min={20}
                max={200}
                value={Math.round((clip.scale ?? 1) * 100)}
                onChange={(e) =>
                  onUpdateClip(clip.id, {
                    scale: Number(e.target.value) / 100,
                  })
                }
                className="mt-1 w-full"
              />
              <span className="tabular-nums text-slate-500">
                {((clip.scale ?? 1) * 100).toFixed(0)}%
              </span>
            </label>
          </section>
          <section>
            <p className="mb-2 text-xs font-semibold text-slate-700">
              Transitions
            </p>
            <label className="mb-2 block text-xs text-slate-600">
              In
              <select
                value={clip.transitionIn ?? "none"}
                onChange={(e) =>
                  onUpdateClip(clip.id, {
                    transitionIn: e.target.value as LayerTransitionPreset,
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                {TRANSITION_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-2 block text-xs text-slate-600">
              Out
              <select
                value={clip.transitionOut ?? "none"}
                onChange={(e) =>
                  onUpdateClip(clip.id, {
                    transitionOut: e.target.value as LayerTransitionPreset,
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                {TRANSITION_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-600">
              Duration (frames each side)
              <input
                type="number"
                min={1}
                max={120}
                value={clip.transitionFrames ?? 15}
                onChange={(e) =>
                  onUpdateClip(clip.id, {
                    transitionFrames: Math.max(
                      1,
                      Math.min(120, Number(e.target.value) || 15)
                    ),
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
          </section>
        </div>
      </aside>
    );
  }

  if (selected.kind === "text" && textOverlay) {
    return (
      <aside className={shell}>
        <TextDesignPanel overlay={textOverlay} onUpdate={onUpdateText} />
        <div className="border-t border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">
            Position &amp; width
          </p>
          <label className="mb-2 block text-xs text-slate-600">
            X %
            <input
              type="range"
              min={0}
              max={100}
              value={textOverlay.posX ?? 50}
              onChange={(e) =>
                onUpdateText(textOverlay.id, {
                  posX: Number(e.target.value),
                })
              }
              className="mt-1 w-full"
            />
            <span className="tabular-nums text-slate-500">
              {Math.round(textOverlay.posX ?? 50)}
            </span>
          </label>
          <label className="mb-2 block text-xs text-slate-600">
            Y %
            <input
              type="range"
              min={0}
              max={100}
              value={textOverlay.posY ?? 50}
              onChange={(e) =>
                onUpdateText(textOverlay.id, {
                  posY: Number(e.target.value),
                })
              }
              className="mt-1 w-full"
            />
            <span className="tabular-nums text-slate-500">
              {Math.round(textOverlay.posY ?? 50)}
            </span>
          </label>
          <label className="block text-xs text-slate-600">
            Width %
            <input
              type="range"
              min={20}
              max={100}
              value={textOverlay.widthPct ?? 92}
              onChange={(e) =>
                onUpdateText(textOverlay.id, {
                  widthPct: Number(e.target.value),
                })
              }
              className="mt-1 w-full"
            />
            <span className="tabular-nums text-slate-500">
              {Math.round(textOverlay.widthPct ?? 92)}
            </span>
          </label>
        </div>
      </aside>
    );
  }

  if (selected.kind === "audio" && audioTrack) {
    return (
      <aside className={shell}>
        <header className="border-b border-slate-200 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Audio
          </p>
          <p className="truncate text-sm font-medium text-slate-900">
            {audioTrack.label || "Track"}
          </p>
        </header>
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
