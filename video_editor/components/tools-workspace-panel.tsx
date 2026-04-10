"use client";

import { useState } from "react";
import type { TextAnimationPreset } from "@/types/types";

const ANIM_OPTIONS: { id: TextAnimationPreset; label: string }[] = [
  { id: "fade", label: "Fade" },
  { id: "rise", label: "Rise" },
  { id: "pop", label: "Pop" },
  { id: "bounce", label: "Bounce" },
  { id: "wipe", label: "Wipe" },
  { id: "blur", label: "Blur in" },
];

type ShapeKind = "rect" | "circle" | "pill";

type Props = {
  onAddToTimeline: (opts: {
    shape: ShapeKind;
    fill: string;
    stroke: string;
    animation: TextAnimationPreset;
    label: string;
  }) => void;
};

export function ToolsWorkspacePanel({ onAddToTimeline }: Props) {
  const [shape, setShape] = useState<ShapeKind>("rect");
  const [fill, setFill] = useState("#8f1e5e");
  const [stroke, setStroke] = useState("#8f1e5e");
  const [animation, setAnimation] = useState<TextAnimationPreset>("rise");
  const [label, setLabel] = useState("Label");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-slate-50/80 p-4">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Whiteboard tools</h2>
        <p className="mt-1 text-xs text-slate-600">
          Add a text card with a colored shape behind it. Edit text and motion
          on the timeline after placing.
        </p>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Shape
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["rect", "Rectangle"],
              ["circle", "Circle"],
              ["pill", "Pill"],
            ] as const
          ).map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => setShape(id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                shape === id
                  ? "border-violet-400 bg-violet-50 text-violet-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <label className="block text-xs font-medium text-slate-700">
        Text
        <textarea
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          rows={4}
          className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      <div>
        <p className="mb-1 text-xs font-medium text-slate-700">Intro animation</p>
        <select
          value={animation}
          onChange={(e) =>
            setAnimation(e.target.value as TextAnimationPreset)
          }
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {ANIM_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
          <span>Fill</span>
          <span className="relative inline-block h-5 w-5">
            <input
              type="color"
              value={fill}
              onChange={(e) => setFill(e.target.value)}
              className="absolute inset-0 h-5 w-5 cursor-pointer opacity-0"
              aria-label="Fill color"
            />
            <span
              className="pointer-events-none absolute inset-0 rounded-sm border border-slate-300"
              style={{ backgroundColor: fill }}
              aria-hidden
            />
          </span>
        </label>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
          <span>Stroke</span>
          <span className="relative inline-block h-5 w-5">
            <input
              type="color"
              value={stroke}
              onChange={(e) => setStroke(e.target.value)}
              className="absolute inset-0 h-5 w-5 cursor-pointer opacity-0"
              aria-label="Stroke color"
            />
            <span
              className="pointer-events-none absolute inset-0 rounded-sm border border-slate-300"
              style={{ backgroundColor: stroke }}
              aria-hidden
            />
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={() =>
          onAddToTimeline({
            shape,
            fill,
            stroke,
            animation,
            label: label.trim() || "Label",
          })
        }
        className="mt-2 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Add to timeline
      </button>
    </div>
  );
}
