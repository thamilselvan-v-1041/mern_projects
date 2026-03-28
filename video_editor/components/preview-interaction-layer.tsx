"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { Clip, TextOverlay } from "@/types/types";
import { DEFAULT_FONT_SIZE_REM } from "./text-animation-presets";

type Sel =
  | { kind: "clip"; id: string }
  | { kind: "text"; id: string }
  | { kind: "audio"; id: string };

type HitEntry =
  | { kind: "clip"; item: Clip; z: number }
  | { kind: "text"; item: TextOverlay; z: number };

type DragState = {
  kind: "clip" | "text";
  id: string;
  startClientX: number;
  startClientY: number;
  initialPosX: number;
  initialPosY: number;
};

type PreviewResizeState = {
  kind: "clip" | "text";
  id: string;
  startClientX: number;
  startClientY: number;
  initialScale: number;
  initialWidthPct: number;
  initialFontSizeRem: number;
};

type Props = {
  wrapRef: React.RefObject<HTMLDivElement | null>;
  currentFrame: number;
  clips: Clip[];
  textOverlays: TextOverlay[];
  selected: Sel | null;
  onSelect: (s: Sel) => void;
  onPatchClip: (
    id: string,
    patch: Partial<Pick<Clip, "posX" | "posY" | "scale">>
  ) => void;
  onPatchText: (
    id: string,
    patch: Partial<
      Pick<TextOverlay, "posX" | "posY" | "widthPct" | "fontSizeRem">
    >
  ) => void;
};

function clipZ(c: Clip) {
  if (c.fromAI) return 200 + (c.aiStackOrder ?? 0);
  if (c.overlayClip) return 200 + (c.overlayOrder ?? 0);
  return 20;
}

export function PreviewInteractionLayer({
  wrapRef,
  currentFrame,
  clips,
  textOverlays,
  selected,
  onSelect,
  onPatchClip,
  onPatchText,
}: Props) {
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<PreviewResizeState | null>(null);

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

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const endResize = useCallback(() => {
    resizeRef.current = null;
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (resizeRef.current) return;
      const d = dragRef.current;
      const el = wrapRef.current;
      if (!d || !el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const dxPct = ((e.clientX - d.startClientX) / rect.width) * 100;
      const dyPct = ((e.clientY - d.startClientY) / rect.height) * 100;
      const posX = Math.max(0, Math.min(100, d.initialPosX + dxPct));
      const posY = Math.max(0, Math.min(100, d.initialPosY + dyPct));
      if (d.kind === "clip") {
        onPatchClip(d.id, { posX, posY });
      } else {
        onPatchText(d.id, { posX, posY });
      }
    };
    const onUp = () => endDrag();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [wrapRef, onPatchClip, onPatchText, endDrag]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const delta =
        (e.clientX - r.startClientX + (e.clientY - r.startClientY)) / 260;
      if (r.kind === "clip") {
        const scale = Math.max(
          0.12,
          Math.min(4.5, r.initialScale * (1 + delta))
        );
        onPatchClip(r.id, { scale });
      } else {
        const f = Math.max(0.4, Math.min(2.2, 1 + delta));
        onPatchText(r.id, {
          widthPct: Math.max(
            18,
            Math.min(100, r.initialWidthPct * f)
          ),
          fontSizeRem: Math.max(
            0.8,
            Math.min(24, r.initialFontSizeRem * f)
          ),
        });
      }
    };
    const onUp = () => endResize();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onPatchClip, onPatchText, endResize]);

  const startDragClip = (e: React.MouseEvent, c: Clip) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect({ kind: "clip", id: c.id });
    dragRef.current = {
      kind: "clip",
      id: c.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialPosX: c.posX ?? 50,
      initialPosY: c.posY ?? 50,
    };
  };

  const startDragText = (e: React.MouseEvent, t: TextOverlay) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect({ kind: "text", id: t.id });
    dragRef.current = {
      kind: "text",
      id: t.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialPosX: t.posX ?? 50,
      initialPosY: t.posY ?? 50,
    };
  };

  const startResizeClip = (e: React.MouseEvent, c: Clip) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = null;
    resizeRef.current = {
      kind: "clip",
      id: c.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialScale: c.scale ?? 1,
      initialWidthPct: 92,
      initialFontSizeRem: DEFAULT_FONT_SIZE_REM,
    };
  };

  const startResizeText = (e: React.MouseEvent, t: TextOverlay) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = null;
    resizeRef.current = {
      kind: "text",
      id: t.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialScale: 1,
      initialWidthPct: t.widthPct ?? 92,
      initialFontSizeRem: t.fontSizeRem ?? DEFAULT_FONT_SIZE_REM,
    };
  };

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 top-0 z-40 bottom-14"
      aria-hidden
    >
      {hitEntries.map((entry) => {
        if (entry.kind === "clip") {
          const c = entry.item;
          const isSel = selected?.kind === "clip" && selected.id === c.id;
          return (
            <div
              key={`hit-clip-${c.id}`}
              className="pointer-events-auto absolute inset-0"
              style={{ zIndex: entry.z }}
            >
              <div
                role="button"
                tabIndex={0}
                className={`absolute inset-0 cursor-grab active:cursor-grabbing ${
                  isSel
                    ? "ring-2 ring-inset ring-violet-500/70"
                    : "hover:ring-1 hover:ring-inset hover:ring-violet-400/40"
                }`}
                onMouseDown={(e) => startDragClip(e, c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect({ kind: "clip", id: c.id });
                  }
                }}
                title="Drag to move; corner handle to scale the frame"
              />
              {isSel ? (
                <button
                  type="button"
                  aria-label="Resize video frame"
                  className="pointer-events-auto absolute bottom-4 right-4 z-[60] h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-white bg-violet-600 shadow-md hover:bg-violet-500"
                  onMouseDown={(e) => startResizeClip(e, c)}
                />
              ) : null}
            </div>
          );
        }
        const t = entry.item;
        const isSel = selected?.kind === "text" && selected.id === t.id;
        const px = t.posX ?? 50;
        const py = t.posY ?? 50;
        const w = t.widthPct ?? 92;
        return (
          <div
            key={`hit-text-${t.id}`}
            className="pointer-events-auto absolute"
            style={{
              left: `${px}%`,
              top: `${py}%`,
              width: `${w}%`,
              height: "26%",
              transform: "translate(-50%, -50%)",
              zIndex: entry.z,
            }}
          >
            <div
              role="button"
              tabIndex={0}
              className={`absolute inset-0 cursor-grab rounded-lg active:cursor-grabbing ${
                isSel
                  ? "ring-2 ring-violet-500"
                  : "ring-1 ring-white/40 hover:ring-violet-300"
              }`}
              onMouseDown={(e) => startDragText(e, t)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect({ kind: "text", id: t.id });
                }
              }}
              title="Drag to move; corner to resize text box"
            />
            {isSel ? (
              <button
                type="button"
                aria-label="Resize text"
                className="pointer-events-auto absolute bottom-0.5 right-0.5 z-[60] h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-2 border-white bg-pink-600 shadow-md hover:bg-pink-500"
                onMouseDown={(e) => startResizeText(e, t)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
