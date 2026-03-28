"use client";

import React from "react";
import type { TextOverlay, TextAnimationPreset } from "@/types/types";
import {
  TEXT_ANIMATION_OPTIONS,
  DEFAULT_ANIM_IN_FRAMES,
  DEFAULT_FONT_SIZE_REM,
} from "./text-animation-presets";

type Props = {
  overlay: TextOverlay;
  onUpdate: (id: string, patch: Partial<TextOverlay>) => void;
};

const FPS = 30;

export function TextDesignPanel({ overlay, onUpdate }: Props) {
  const animIn = overlay.animInFrames ?? DEFAULT_ANIM_IN_FRAMES;
  const sec = animIn / FPS;
  const preset =
    TEXT_ANIMATION_OPTIONS.find((o) => o.id === overlay.animation) ??
    TEXT_ANIMATION_OPTIONS[1];
  const showDirection = preset.supportsDirection;

  const set = (patch: Partial<TextOverlay>) => onUpdate(overlay.id, patch);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-white">
      <div className="border-b border-slate-200 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Text
        </p>
        <p className="truncate text-sm font-medium text-slate-900">
          {overlay.text || "Empty layer"}
        </p>
      </div>

      <div className="flex max-h-[min(70vh,560px)] flex-col gap-4 overflow-y-auto p-3">
        <label className="block text-xs font-medium text-slate-600">
          Content
          <textarea
            value={overlay.text}
            onChange={(e) => set({ text: e.target.value })}
            rows={3}
            className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none ring-slate-300 focus:ring-2"
          />
        </label>

        <div>
          <p className="mb-2 text-xs font-semibold text-slate-700">
            Animation
          </p>
          <div className="grid max-h-[220px] grid-cols-2 gap-1.5 overflow-y-auto pr-0.5">
            {TEXT_ANIMATION_OPTIONS.map((opt) => {
              const active = (overlay.animation ?? "fade") === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    set({ animation: opt.id as TextAnimationPreset })
                  }
                  title={opt.description}
                  className={`rounded-lg border px-2 py-2 text-left text-xs transition ${
                    active
                      ? "border-slate-800 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="block font-semibold leading-tight">
                    {opt.label}
                  </span>
                  <span
                    className={`mt-0.5 block text-[10px] leading-snug ${
                      active ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {showDirection ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-700">
              Direction
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ["left", "Left"],
                  ["right", "Right"],
                  ["up", "Up"],
                  ["down", "Down"],
                ] as const
              ).map(([val, label]) => {
                const d = overlay.animDirection ?? "left";
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => set({ animDirection: val })}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
                      d === val
                        ? "border-slate-800 bg-slate-100"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <label className="block text-xs font-medium text-slate-600">
          Intro duration ({sec.toFixed(2)}s)
          <input
            type="range"
            min={6}
            max={120}
            value={animIn}
            onChange={(e) =>
              set({ animInFrames: Number.parseInt(e.target.value, 10) })
            }
            className="mt-1 w-full accent-slate-800"
          />
          <div className="mt-0.5 flex justify-between text-[10px] text-slate-400">
            <span>Snappy</span>
            <span>Slow</span>
          </div>
        </label>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-700">
            Typography
          </p>
          <label className="mb-2 block text-xs text-slate-600">
            Color
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={
                  /^#[0-9A-Fa-f]{6}$/.test(overlay.color ?? "#ffffff")
                    ? (overlay.color ?? "#ffffff")
                    : "#ffffff"
                }
                onChange={(e) => set({ color: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
              />
              <input
                type="text"
                value={overlay.color ?? "#ffffff"}
                onChange={(e) => set({ color: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs text-slate-800"
              />
            </div>
          </label>

          <label className="mb-2 block text-xs font-medium text-slate-600">
            Size ({overlay.fontSizeRem ?? DEFAULT_FONT_SIZE_REM}rem)
            <input
              type="range"
              min={2}
              max={10}
              step={0.25}
              value={overlay.fontSizeRem ?? DEFAULT_FONT_SIZE_REM}
              onChange={(e) =>
                set({ fontSizeRem: Number.parseFloat(e.target.value) })
              }
              className="mt-1 w-full accent-slate-800"
            />
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Weight
            <select
              value={overlay.fontWeight ?? "bold"}
              onChange={(e) =>
                set({
                  fontWeight: e.target.value as TextOverlay["fontWeight"],
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800"
            >
              <option value="light">Light</option>
              <option value="normal">Regular</option>
              <option value="bold">Bold</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
