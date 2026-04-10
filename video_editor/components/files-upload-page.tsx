"use client";

import { useEffect, useState } from "react";
import { Clock3, FileAudio, FileVideo, Play, Trash2, X } from "lucide-react";

type RecentFileItem = {
  id: string;
  label: string;
  author: string;
  src: string;
  durationSec: number;
  mediaType?: "video" | "image";
};

type Props = {
  onPickVideo: () => void;
  onPickAudio: () => void;
  recentVideos: RecentFileItem[];
  recentAudios: RecentFileItem[];
  onAddRecentMedia: (item: RecentFileItem) => void;
  onAddRecentAudio: (item: RecentFileItem) => void;
};

export function FilesUploadPage({
  onPickVideo,
  onPickAudio,
  recentVideos,
  recentAudios,
  onAddRecentMedia,
  onAddRecentAudio,
}: Props) {
  const [previewItem, setPreviewItem] = useState<
    (RecentFileItem & { kind: "video" | "audio" }) | null
  >(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [selectedRecentId, setSelectedRecentId] = useState<string | null>(null);

  const recentItemsRaw = [
    ...recentVideos.map((item) => ({ ...item, kind: "video" as const })),
    ...recentAudios.map((item) => ({ ...item, kind: "audio" as const })),
  ].slice(0, 14);
  const recentItems = recentItemsRaw.filter((item) => !deletedIds.has(item.id));
  const recentMediaItems = recentItems.filter((item) => item.kind === "video");
  const recentAudioItems = recentItems.filter((item) => item.kind === "audio");

  const inferAudioFormat = (src: string, label: string) => {
    const value = `${src} ${label}`.toLowerCase();
    if (value.includes(".aac")) return "AAC";
    if (value.includes(".wav")) return "WAV";
    if (value.includes(".mp3")) return "MP3";
    return "";
  };

  useEffect(() => {
    if (!selectedRecentId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const selected = recentItems.find((item) => item.id === selectedRecentId);
      if (!selected) return;
      e.preventDefault();
      const ok = window.confirm(
        `Remove "${selected.label}" from Recently Added?\n\nThis only removes it from the list, not from timeline layers.`
      );
      if (!ok) return;
      setDeletedIds((prev) => new Set(prev).add(selected.id));
      if (previewItem?.id === selected.id) {
        setPreviewItem(null);
      }
      setSelectedRecentId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedRecentId, recentItems, previewItem]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50/80">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-6 py-5">
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-slate-900">Files</h1>
          <p className="mt-1 text-sm text-slate-500">
            Supported types: video (MP4, MOV) and audio (MP3, WAV, AAC).
          </p>
        </div>

        <div className="grid gap-4 pt-1 sm:grid-cols-2">
          <button
            type="button"
            onClick={onPickVideo}
            className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-amber-300 hover:bg-amber-50/50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
              <FileVideo className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-base font-semibold text-slate-900">
              Upload media
            </span>
          </button>

          <button
            type="button"
            onClick={onPickAudio}
            className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <FileAudio className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-base font-semibold text-slate-900">
              Upload audio
            </span>
          </button>
        </div>

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
          {recentItems.length > 0 ? (
            <>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recently Added
              </h2>
            <div className="space-y-3">
              {recentMediaItems.length > 0 ? (
                <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Media
                  </p>
                  <div className="overflow-x-auto">
                    <div className="inline-flex gap-2 pb-1">
                      {recentMediaItems.map((item) => (
                          <div
                            key={`${item.kind}-${item.id}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSelectedRecentId(item.id);
                              onAddRecentMedia(item);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedRecentId(item.id);
                                onAddRecentMedia(item);
                              }
                            }}
                            className={`flex w-[260px] shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left ${
                              selectedRecentId === item.id
                                ? "border-violet-300 bg-violet-50"
                                : "border-slate-200 bg-slate-50"
                            }`}
                            title={item.label}
                          >
                            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md">
                              {item.mediaType === "image" ? (
                                <img
                                  src={item.src}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <video
                                  src={item.src}
                                  className="h-full w-full object-cover"
                                  muted
                                  playsInline
                                  preload="metadata"
                                />
                              )}
                              <span className="absolute inset-0 bg-black/25" />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewItem(item);
                                }}
                                className="absolute right-0.5 top-0.5 inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-black/75 text-white hover:bg-black/90"
                                aria-label={`Preview ${item.label}`}
                                title="Preview"
                              >
                                <Play className="h-2.5 w-2.5 fill-current" aria-hidden />
                              </button>
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-800">
                                {item.label}
                              </p>
                              <p className="truncate text-[10px] text-slate-500">
                                {item.author}
                              </p>
                              <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-500">
                                <Clock3 className="h-3 w-3" aria-hidden />
                                {Math.max(1, Math.round(item.durationSec))}s
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!window.confirm(
                                  `Remove "${item.label}" from Recently Added?\n\nThis only removes it from the list, not from timeline layers.`
                                )) {
                                  return;
                                }
                                setDeletedIds((prev) => new Set(prev).add(item.id));
                                if (previewItem?.id === item.id) {
                                  setPreviewItem(null);
                                }
                                if (selectedRecentId === item.id) {
                                  setSelectedRecentId(null);
                                }
                              }}
                              className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-red-600"
                              aria-label={`Delete ${item.label}`}
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                </section>
              ) : null}

              {recentAudioItems.length > 0 ? (
                <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Audio
                  </p>
                  <div className="overflow-x-auto">
                    <div className="inline-flex gap-2 pb-1">
                      {recentAudioItems.map((item) => (
                          <div
                            key={`${item.kind}-${item.id}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSelectedRecentId(item.id);
                              onAddRecentAudio(item);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedRecentId(item.id);
                                onAddRecentAudio(item);
                              }
                            }}
                            className={`flex w-[260px] shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left ${
                              selectedRecentId === item.id
                                ? "border-violet-300 bg-violet-50"
                                : "border-slate-200 bg-slate-50"
                            }`}
                            title={item.label}
                          >
                            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md">
                              <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                                <FileAudio className="h-4 w-4" aria-hidden />
                              </span>
                              {inferAudioFormat(item.src, item.label) ? (
                                <span className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-[1px] text-center text-[8px] font-semibold tracking-wide text-white">
                                  {inferAudioFormat(item.src, item.label)}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewItem(item);
                                }}
                                className="absolute right-0.5 top-0.5 inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-black/75 text-white hover:bg-black/90"
                                aria-label={`Preview ${item.label}`}
                                title="Preview"
                              >
                                <Play className="h-2.5 w-2.5 fill-current" aria-hidden />
                              </button>
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-800">
                                {item.label}
                              </p>
                              <p className="truncate text-[10px] text-slate-500">
                                {item.author}
                              </p>
                              <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-500">
                                <Clock3 className="h-3 w-3" aria-hidden />
                                {Math.max(1, Math.round(item.durationSec))}s
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!window.confirm(
                                  `Remove "${item.label}" from Recently Added?\n\nThis only removes it from the list, not from timeline layers.`
                                )) {
                                  return;
                                }
                                setDeletedIds((prev) => new Set(prev).add(item.id));
                                if (previewItem?.id === item.id) {
                                  setPreviewItem(null);
                                }
                                if (selectedRecentId === item.id) {
                                  setSelectedRecentId(null);
                                }
                              }}
                              className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-red-600"
                              aria-label={`Delete ${item.label}`}
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
            </>
          ) : null}
        </div>
      </div>
      {previewItem ? (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewItem(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewItem(null)}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            aria-label="Close preview"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="w-full max-w-4xl rounded-xl bg-black/40 p-3 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {previewItem.kind === "video" ? (
              previewItem.mediaType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewItem.src}
                  alt={previewItem.label}
                  className="mx-auto max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
                />
              ) : (
                <video
                  src={previewItem.src}
                  className="mx-auto max-h-[80vh] w-full rounded-lg bg-black object-contain"
                  controls
                  autoPlay
                  playsInline
                />
              )
            ) : (
              <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-lg bg-white/95 p-4 text-slate-800">
                <FileAudio className="h-8 w-8 text-emerald-600" />
                <p className="text-sm font-semibold">{previewItem.label}</p>
                <audio src={previewItem.src} className="w-full" controls autoPlay />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
