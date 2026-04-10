"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import type { Clip, TextOverlay } from "@/types/types";
import { DEFAULT_FONT_SIZE_REM } from "./text-animation-presets";

type Sel =
  | { kind: "clip"; id: string }
  | { kind: "text"; id: string }
  | { kind: "audio"; id: string };

type HitEntry =
  | { kind: "clip"; item: Clip; z: number }
  | { kind: "text"; item: TextOverlay; z: number };

type ResizeHandle =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w";

type PreviewResizeState = {
  kind: "clip" | "text";
  id: string;
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
  initialScale: number;
  initialWidthPct: number;
  initialFontSizeRem: number;
};

const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

type Props = {
  wrapRef: React.RefObject<HTMLDivElement | null>;
  currentFrame: number;
  isPlaying?: boolean;
  clips: Clip[];
  textOverlays: TextOverlay[];
  selected: Sel | null;
  onSelect: (s: Sel) => void;
  onPatchClip: (
    id: string,
    patch: Partial<Pick<Clip, "posX" | "posY" | "scale" | "rotationDeg">>
  ) => void;
  onPatchText: (
    id: string,
    patch: Partial<
      Pick<TextOverlay, "posX" | "posY" | "widthPct" | "fontSizeRem" | "rotationDeg">
    >
  ) => void;
};

function clipZ(c: Clip) {
  if (c.fromAI) return 200 + (c.aiStackOrder ?? 0);
  if (c.overlayClip) return 200 + (c.overlayOrder ?? 0);
  return 20;
}

function resizeDeltaForHandle(h: ResizeHandle, dx: number, dy: number) {
  switch (h) {
    case "se":
      return dx + dy;
    case "nw":
      return -dx - dy;
    case "ne":
      return dx - dy;
    case "sw":
      return -dx + dy;
    case "e":
      return dx;
    case "w":
      return -dx;
    case "s":
      return dy;
    case "n":
      return -dy;
    default:
      return 0;
  }
}

function ResizeChromeHandle({
  handle,
  clipLike,
  onPointerDown,
}: {
  handle: ResizeHandle;
  clipLike: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const base =
    "pointer-events-auto absolute z-[65] h-2.5 w-2.5 rounded-sm border-2 border-white shadow-md touch-none";
  const color = clipLike
    ? "bg-violet-600 hover:bg-violet-500"
    : "bg-pink-600 hover:bg-pink-500";
  const pos: Record<ResizeHandle, React.CSSProperties> = {
    nw: { left: -5, top: -5 },
    n: { left: "50%", top: -5, transform: "translateX(-50%)" },
    ne: { right: -5, top: -5 },
    e: { right: -5, top: "50%", transform: "translateY(-50%)" },
    se: { right: -5, bottom: -5 },
    s: { left: "50%", bottom: -5, transform: "translateX(-50%)" },
    sw: { left: -5, bottom: -5 },
    w: { left: -5, top: "50%", transform: "translateY(-50%)" },
  };
  return (
    <button
      type="button"
      aria-label={`Resize ${handle}`}
      className={`${base} ${color}`}
      style={{ ...pos[handle], cursor: HANDLE_CURSOR[handle] }}
      onPointerDown={onPointerDown}
    />
  );
}

export function PreviewInteractionLayer({
  wrapRef,
  currentFrame,
  isPlaying = false,
  clips,
  textOverlays,
  selected,
  onSelect,
  onPatchClip,
  onPatchText,
}: Props) {
  const resizeRef = useRef<PreviewResizeState | null>(null);
  const [hud, setHud] = useState<{
    x: number;
    y: number;
    lines: string[];
  } | null>(null);

  const hitEntries = useMemo(() => {
    const f = Math.floor(currentFrame);
    const list: HitEntry[] = [];
    for (const c of clips) {
      if (f >= c.start && f < c.start + c.duration) {
        list.push({ kind: "clip", item: c, z: clipZ(c) });
      }
    }
    for (const t of textOverlays) {
      if (f >= t.start && f < t.start + t.duration) {
        list.push({ kind: "text", item: t, z: 5000 });
      }
    }
    list.sort((a, b) => a.z - b.z);
    return list;
  }, [clips, textOverlays, currentFrame]);

  const endResize = useCallback(() => {
    resizeRef.current = null;
    setHud(null);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const dx = e.clientX - r.startClientX;
      const dy = e.clientY - r.startClientY;

      if (r.kind === "clip") {
        const d = resizeDeltaForHandle(r.handle, dx, dy);
        const scale = Math.max(
          0.12,
          Math.min(4.5, r.initialScale * (1 + d / 280)),
        );
        onPatchClip(r.id, { scale });
        setHud({
          x: e.clientX,
          y: e.clientY,
          lines: [`Scale · ${(scale * 100).toFixed(0)}%`],
        });
        return;
      }

      const h = r.handle;
      if (h === "e" || h === "w") {
        const deltaPct = ((h === "e" ? dx : -dx) / rect.width) * 100;
        const widthPct = Math.max(
          18,
          Math.min(100, r.initialWidthPct + deltaPct),
        );
        onPatchText(r.id, { widthPct });
        setHud({
          x: e.clientX,
          y: e.clientY,
          lines: [`Width · ${Math.round(widthPct)}%`],
        });
        return;
      }
      if (h === "n" || h === "s") {
        const deltaRem = ((h === "s" ? dy : -dy) / rect.height) * 10;
        const fontSizeRem = Math.max(
          0.8,
          Math.min(24, r.initialFontSizeRem + deltaRem),
        );
        onPatchText(r.id, { fontSizeRem });
        setHud({
          x: e.clientX,
          y: e.clientY,
          lines: [`Type size · ${fontSizeRem.toFixed(2)} rem`],
        });
        return;
      }

      const d = resizeDeltaForHandle(h, dx, dy);
      const f = Math.max(0.35, Math.min(2.4, 1 + d / 260));
      const widthPct = Math.max(18, Math.min(100, r.initialWidthPct * f));
      const fontSizeRem = Math.max(
        0.8,
        Math.min(24, r.initialFontSizeRem * f),
      );
      onPatchText(r.id, { widthPct, fontSizeRem });
      setHud({
        x: e.clientX,
        y: e.clientY,
        lines: [
          `Width · ${Math.round(widthPct)}%`,
          `Type size · ${fontSizeRem.toFixed(2)} rem`,
        ],
      });
    };
    const onUp = () => endResize();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onPatchClip, onPatchText, endResize, wrapRef]);

  const selectClip = (c: Clip) => {
    onSelect({ kind: "clip", id: c.id });
  };

  const selectText = (t: TextOverlay) => {
    onSelect({ kind: "text", id: t.id });
  };

  const startResizeClip = (
    e: React.PointerEvent,
    c: Clip,
    handle: ResizeHandle,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    resizeRef.current = {
      kind: "clip",
      id: c.id,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialScale: c.scale ?? 1,
      initialWidthPct: 92,
      initialFontSizeRem: DEFAULT_FONT_SIZE_REM,
    };
    setHud({
      x: e.clientX,
      y: e.clientY,
      lines: [`Scale · ${(((c.scale ?? 1) * 100).toFixed(0))}%`],
    });
  };

  const rotateClip = (e: React.MouseEvent, c: Clip, step: number) => {
    e.stopPropagation();
    e.preventDefault();
    const next = (c.rotationDeg ?? 0) + step;
    onPatchClip(c.id, { rotationDeg: next });
    setHud({
      x: e.clientX,
      y: e.clientY,
      lines: [`Rotation · ${Math.round(next)}deg`],
    });
  };

  const startResizeText = (
    e: React.PointerEvent,
    t: TextOverlay,
    handle: ResizeHandle,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    resizeRef.current = {
      kind: "text",
      id: t.id,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialScale: 1,
      initialWidthPct: t.widthPct ?? 92,
      initialFontSizeRem: t.fontSizeRem ?? DEFAULT_FONT_SIZE_REM,
    };
    setHud({
      x: e.clientX,
      y: e.clientY,
      lines: [
        `Width · ${Math.round(t.widthPct ?? 92)}%`,
        `Type size · ${(t.fontSizeRem ?? DEFAULT_FONT_SIZE_REM).toFixed(2)} rem`,
      ],
    });
  };

  const rotateText = (e: React.MouseEvent, t: TextOverlay, step: number) => {
    e.stopPropagation();
    e.preventDefault();
    const next = (t.rotationDeg ?? 0) + step;
    onPatchText(t.id, { rotationDeg: next });
    setHud({
      x: e.clientX,
      y: e.clientY,
      lines: [`Rotation · ${Math.round(next)}deg`],
    });
  };

  const handles: ResizeHandle[] = [
    "nw",
    "n",
    "ne",
    "e",
    "se",
    "s",
    "sw",
    "w",
  ];

  return (
    <>
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-40 bottom-14"
        aria-hidden
      >
        {hitEntries.map((entry) => {
          if (entry.kind === "clip") {
            const c = entry.item;
            const isSel = selected?.kind === "clip" && selected.id === c.id;
            // Resize markers are reserved for text/tools overlays only.
            const canResize = false;
            const posX = c.posX ?? 50;
            const posY = c.posY ?? 50;
            const scale = c.scale ?? 1;
            const rotationDeg = c.rotationDeg ?? 0;
            return (
              <div
                key={`hit-clip-${c.id}`}
                className="pointer-events-auto absolute inset-0"
                style={{ zIndex: entry.z }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  className={`absolute inset-0 cursor-pointer ${
                    isSel
                      ? "ring-0"
                      : "hover:ring-1 hover:ring-inset hover:ring-violet-400/40"
                  }`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    selectClip(c);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectClip(c);
                    }
                  }}
                  title={
                    canResize
                      ? "Click to select. Use handles to resize."
                      : "Click to select."
                  }
                />
                {isSel && canResize ? (
                  <div
                    className="pointer-events-none absolute border-2 border-violet-500 shadow-[0_0_0_1px_rgba(255,255,255,0.5)]"
                    style={{
                      left: `${posX}%`,
                      top: `${posY}%`,
                      width: `${scale * 100}%`,
                      height: `${scale * 100}%`,
                      transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
                      boxSizing: "border-box",
                    }}
                  >
                    <div className="pointer-events-auto absolute -top-8 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-violet-200 bg-white/95 px-1 py-1 shadow-sm">
                      <button
                        type="button"
                        aria-label="Rotate image left"
                        className="rounded-full p-1 text-violet-700 hover:bg-violet-50"
                        onMouseDown={(e) => rotateClip(e, c, -5)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Rotate image right"
                        className="rounded-full p-1 text-violet-700 hover:bg-violet-50"
                        onMouseDown={(e) => rotateClip(e, c, 5)}
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {handles.map((h) => (
                      <ResizeChromeHandle
                        key={h}
                        handle={h}
                        clipLike
                        onPointerDown={(e) => startResizeClip(e, c, h)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }
          const t = entry.item;
          const isSel = selected?.kind === "text" && selected.id === t.id;
          const hasShape = (t.shapeBackground ?? "none") !== "none";
          const shapeStrokeColor = hasShape
            ? t.shapeStroke || t.shapeFill || "#ec4899"
            : "#ec4899";
          const shapeFillColor = hasShape ? t.shapeFill || "rgba(244,114,182,0.18)" : "transparent";
          const px = t.posX ?? 50;
          const py = t.posY ?? 50;
          const w = t.widthPct ?? 92;
          const rotationDeg = t.rotationDeg ?? 0;
          return (
            <div
              key={`hit-text-${t.id}`}
              className="pointer-events-auto absolute"
              style={{
                left: `${px}%`,
                top: `${py}%`,
                width: `${w}%`,
                height: "26%",
                transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
                zIndex: entry.z,
              }}
            >
              <div
                role="button"
                tabIndex={0}
                className="absolute inset-0 cursor-pointer rounded-lg border-2"
                style={{
                  borderColor: isPlaying
                    ? "transparent"
                    : isSel
                      ? shapeStrokeColor
                      : "rgba(255,255,255,0.55)",
                  backgroundColor:
                    isSel && hasShape && !isPlaying ? shapeFillColor : "transparent",
                  opacity: isSel && hasShape && !isPlaying ? 0.22 : 1,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  selectText(t);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectText(t);
                  }
                }}
                title="Click to select. Handles resize width or type size."
              />
              {isSel ? (
                <div
                  className="pointer-events-none absolute inset-0 rounded-lg border-2 shadow-[0_0_0_1px_rgba(255,255,255,0.45)]"
                  style={{
                    borderColor: isPlaying ? "transparent" : shapeStrokeColor,
                    boxShadow: isPlaying ? "none" : "0 0 0 1px rgba(255,255,255,0.45)",
                  }}
                >
                  {!isPlaying ? (
                    <>
                      <div className="pointer-events-auto absolute -top-8 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-pink-200 bg-white/95 px-1 py-1 shadow-sm">
                        <button
                          type="button"
                          aria-label="Rotate text left"
                          className="rounded-full p-1 text-pink-700 hover:bg-pink-50"
                          onMouseDown={(e) => rotateText(e, t, -5)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Rotate text right"
                          className="rounded-full p-1 text-pink-700 hover:bg-pink-50"
                          onMouseDown={(e) => rotateText(e, t, 5)}
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {handles.map((h) => (
                        <ResizeChromeHandle
                          key={h}
                          handle={h}
                          clipLike={false}
                          onPointerDown={(e) => startResizeText(e, t, h)}
                        />
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {hud ? (
        <div
          className="pointer-events-none fixed z-[100] max-w-[14rem] rounded-lg border border-slate-200 bg-slate-900/95 px-2.5 py-2 text-[11px] font-medium leading-snug text-white shadow-lg"
          style={{
            left: Math.min(
              hud.x + 14,
              typeof window !== "undefined" ? window.innerWidth - 200 : hud.x + 14,
            ),
            top: Math.min(
              hud.y + 14,
              typeof window !== "undefined" ? window.innerHeight - 120 : hud.y + 14,
            ),
          }}
        >
          {hud.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      ) : null}
    </>
  );
}
