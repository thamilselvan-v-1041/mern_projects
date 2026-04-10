"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Music2, Pause, Play, Search } from "lucide-react";
import type { TimelineAudio } from "@/types/types";

type SampleAudio = {
  id: string;
  label: string;
  author?: string;
  previewUrl: string;
  playbackUrl: string;
  durationSec: number;
};

const RECENTLY_USED_CATEGORY = "Recently used";
const RECENT_AUDIOS_STORAGE_KEY = "video-editor-recent-sample-audios";
const MAX_RECENT_AUDIOS = 40;

/** Progress ring radius in preview SVG (viewBox 0 0 36 36) */
const AUDIO_SAMPLE_RING_RADIUS = 16;

function loadRecentAudiosFromStorage(): SampleAudio[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_AUDIOS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is SampleAudio =>
        x &&
        typeof x === "object" &&
        typeof (x as SampleAudio).playbackUrl === "string" &&
        typeof (x as SampleAudio).label === "string",
    );
  } catch {
    return [];
  }
}

function saveRecentAudiosToStorage(items: SampleAudio[]) {
  try {
    localStorage.setItem(RECENT_AUDIOS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

const SAMPLE_SEGMENTS = [
  "trending",
  "ambient",
  "lofi",
  "electronic",
  "cinematic",
  "nature",
  "birds",
  "animals",
  "kids",
  "family",
  "fun",
  "travel",
  "workout",
  "retro",
  "focus",
];

const RANDOM_AUDIO_MOODS = [
  "calm",
  "energetic",
  "uplifting",
  "dramatic",
  "happy",
  "sad",
  "dark",
  "soft",
  "cinematic",
  "ambient",
];

const RANDOM_AUDIO_THEMES = [
  "travel vlog",
  "nature",
  "city life",
  "technology",
  "business",
  "sports",
  "fitness",
  "kids",
  "family",
  "festival",
  "wedding",
  "gaming",
  "focus work",
  "study",
  "podcast",
  "motivation",
  "meditation",
  "night drive",
  "sunset",
  "documentary",
];

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildRandomAudioCategoryBatch(
  query: string,
  count: number,
  exclude: Set<string>,
): string[] {
  const out: string[] = [];
  const q = query.trim().toLowerCase();
  let safety = 0;
  while (out.length < count && safety < count * 40) {
    safety += 1;
    const candidate = q
      ? `${q} ${pickRandom(RANDOM_AUDIO_MOODS)} ${pickRandom(
          RANDOM_AUDIO_THEMES,
        )}`
      : `${pickRandom(RANDOM_AUDIO_MOODS)} ${pickRandom(RANDOM_AUDIO_THEMES)}`;
    const normalized = candidate.trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized || exclude.has(normalized)) continue;
    exclude.add(normalized);
    out.push(normalized);
  }
  return out;
}

/** Match preset audio segment labels against the search string (and multi-word tokens). */
function segmentMatchesQuery(segmentLower: string, q: string): boolean {
  if (!q) return true;
  if (q.length < 2) {
    return segmentLower.split(/\s+/).some((word) => word.startsWith(q));
  }
  if (segmentLower.includes(q)) return true;
  const words = q.split(/\s+/).filter((w) => w.length >= 2);
  return words.some((w) => segmentLower.includes(w));
}

function rankCategoryAgainstQuery(cat: string, q: string): number {
  const c = cat.toLowerCase();
  if (!q) return 0;
  if (c === q) return 0;
  if (c.startsWith(q)) return 1;
  if (c.includes(q)) return 2;
  const words = q.split(/\s+/).filter((w) => w.length >= 2);
  if (words.some((w) => c.includes(w))) return 3;
  return 4;
}

/**
 * When search is empty: all preset segments + random discovery categories.
 * When search is set: matching preset names first, then the raw query for the API, then generated related queries.
 */
function buildOrderedAudioCategoriesForSearch(queryRaw: string): string[] {
  const baseLower = SAMPLE_SEGMENTS.map((c) => c.trim().toLowerCase());
  const q = queryRaw.trim().toLowerCase();

  if (!q) {
    const seed = new Set(baseLower);
    const randomTail = buildRandomAudioCategoryBatch("", 30, seed);
    return [...baseLower, ...randomTail];
  }

  const relatedStatic = baseLower.filter((s) => segmentMatchesQuery(s, q));
  relatedStatic.sort((a, b) => {
    const d = rankCategoryAgainstQuery(a, q) - rankCategoryAgainstQuery(b, q);
    return d !== 0 ? d : a.localeCompare(b);
  });

  const seed = new Set<string>();
  relatedStatic.forEach((s) => seed.add(s));
  seed.add(q);

  const randomTail = buildRandomAudioCategoryBatch(q, 30, seed);

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const cat of relatedStatic) {
    if (seen.has(cat)) continue;
    seen.add(cat);
    ordered.push(cat);
  }
  if (!seen.has(q)) {
    seen.add(q);
    ordered.push(q);
  }
  for (const t of randomTail) {
    if (seen.has(t)) continue;
    seen.add(t);
    ordered.push(t);
  }
  return ordered;
}

type SampleGroup = {
  loading: boolean;
  error: string | null;
  results: SampleAudio[];
};

function splitSampleLabel(label: string) {
  const [title, author] = label.split(" · ");
  return {
    title: (title || "Audio sample").trim(),
    author: (author || "Unknown author").trim(),
  };
}

/** Prefer API `author` field; else legacy `label` with " · " (track · artist). */
function sampleAudioTitleAuthor(item: SampleAudio): {
  title: string;
  author: string;
} {
  const fromApi = (item.author ?? "").trim();
  if (fromApi) {
    return {
      title: (item.label || "Audio sample").trim(),
      author: fromApi,
    };
  }
  return splitSampleLabel(item.label);
}

function buildThemeThumbnailUrl(category: string, itemId: string): string {
  const tags = category
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ",");
  const lock = encodeURIComponent(itemId.slice(-10));
  return `https://loremflickr.com/160/160/${tags}?lock=${lock}`;
}

/** iTunes artwork is stored in `previewUrl` (see `/api/media/audio-samples`). */
function sampleAudioArtworkUrl(item: SampleAudio): string | null {
  const u = item.previewUrl?.trim() ?? "";
  if (!u.startsWith("http://") && !u.startsWith("https://")) return null;
  return u
    .replace(/100x100bb/gi, "300x300bb")
    .replace(/60x60bb/gi, "300x300bb");
}

function sampleAudioThumbnailSrc(item: SampleAudio, category: string): string {
  return sampleAudioArtworkUrl(item) ?? buildThemeThumbnailUrl(category, item.id);
}

function audioDisplayName(track: TimelineAudio): string {
  const u = track.src;
  if (u.startsWith("blob:")) return track.label || "Uploaded audio";
  if (u.includes("audio-ssl.itunes.apple.com")) {
    return track.label || "Sample audio";
  }
  return track.label?.trim() || `Audio ${track.id.slice(-8)}`;
}

function AudioMetaLine({ track, fps }: { track: TimelineAudio; fps: number }) {
  const sec = track.duration / fps;
  const dur = `${sec < 10 ? sec.toFixed(2) : sec.toFixed(1)}s`;
  const source = track.src.startsWith("blob:")
    ? "Upload"
    : track.src.includes("audio-ssl.itunes.apple.com")
      ? "Sample"
      : "Remote";
  return (
    <p className="text-[11px] leading-snug text-slate-500">
      {dur} · {track.duration} fr · {source}
    </p>
  );
}

type Props = {
  audioTracks: TimelineAudio[];
  selectedAudioId: string | null;
  fps: number;
  onSelectAudio: (id: string) => void;
  onSeekToFrame: (frame: number) => void;
  onAddSampleAudio: (
    src: string,
    label: string,
    fallbackDurationSec: number,
    sourceAuthor?: string,
  ) => void;
  /** When main editor preview is playing, stop library HTML preview (same URL would double). */
  mainPreviewIsPlaying?: boolean;
  /** Pause timeline/canvas preview before starting a library preview (avoids two outputs). */
  onPauseMainPlayback?: () => void;
};

export function AudiosLibraryPanel({
  audioTracks,
  selectedAudioId,
  fps,
  onSelectAudio,
  onSeekToFrame,
  onAddSampleAudio,
  mainPreviewIsPlaying = false,
  onPauseMainPlayback,
}: Props) {
  const [queryInput, setQueryInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [visibleCategoryCount, setVisibleCategoryCount] = useState(10);
  const [groups, setGroups] = useState<Record<string, SampleGroup>>({});
  const [recentAudios, setRecentAudios] = useState<SampleAudio[]>([]);
  const [dynamicCategories, setDynamicCategories] = useState<string[]>([]);
  const [loadingCategoryBatch, setLoadingCategoryBatch] = useState(false);
  const [activeAudioKey, setActiveAudioKey] = useState<string | null>(null);
  const [activeAudioItem, setActiveAudioItem] = useState<SampleAudio | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewState, setPreviewState] = useState<{
    itemId: string | null;
    isLoading: boolean;
    isPlaying: boolean;
    downloadPct: number;
    playPct: number;
  }>({
    itemId: null,
    isLoading: false,
    isPlaying: false,
    downloadPct: 0,
    playPct: 0,
  });

  useEffect(() => {
    setRecentAudios(loadRecentAudiosFromStorage());
  }, []);

  const recordRecentSample = useCallback((item: SampleAudio) => {
    setRecentAudios((prev) => {
      const key = item.playbackUrl || item.id;
      const next = [
        item,
        ...prev.filter((v) => (v.playbackUrl || v.id) !== key),
      ].slice(0, MAX_RECENT_AUDIOS);
      saveRecentAudiosToStorage(next);
      return next;
    });
  }, []);

  const markSelectionForRecent = useCallback(
    (item: SampleAudio, sourceCategory: string) => {
      if (sourceCategory === RECENTLY_USED_CATEGORY) return;
      const key = item.playbackUrl || item.id;
      if (activeAudioKey && activeAudioItem && activeAudioKey !== key) {
        recordRecentSample(activeAudioItem);
      }
      setActiveAudioKey(key);
      setActiveAudioItem(item);
    },
    [activeAudioItem, activeAudioKey, recordRecentSample],
  );

  const runAudioSampleSearch = useCallback(() => {
    setAppliedQuery(queryInput.trim());
  }, [queryInput]);

  useEffect(() => {
    setDynamicCategories(buildOrderedAudioCategoriesForSearch(appliedQuery));
    setLoadingCategoryBatch(false);
    setVisibleCategoryCount(10);
  }, [appliedQuery]);

  const categories = dynamicCategories;

  const visibleCategories = useMemo(
    () => categories.slice(0, visibleCategoryCount),
    [categories, visibleCategoryCount],
  );

  const fetchCategory = useCallback(async (category: string) => {
    setGroups((prev) => ({
      ...prev,
      [category]: { loading: true, error: null, results: prev[category]?.results || [] },
    }));
    try {
      const params = new URLSearchParams({
        q: category,
        limit: "24",
      });
      const res = await fetch(`/api/media/audio-samples?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGroups((prev) => ({
          ...prev,
          [category]: {
            loading: false,
            error: data?.error || `Request failed (${res.status})`,
            results: [],
          },
        }));
        return;
      }
      const incoming = Array.isArray(data.results) ? data.results : [];
      setGroups((prev) => {
        const usedElsewhere = new Set<string>();
        recentAudios.forEach((r) => {
          const key = r.playbackUrl || r.id;
          if (key) usedElsewhere.add(key);
        });
        Object.entries(prev).forEach(([k, g]) => {
          if (k === category) return;
          (g?.results || []).forEach((r) => {
            const key = r.playbackUrl || r.id;
            if (key) usedElsewhere.add(key);
          });
        });
        const seen = new Set<string>();
        const unique = incoming.filter((r: SampleAudio) => {
          const key = r.playbackUrl || r.id;
          if (!key || seen.has(key) || usedElsewhere.has(key)) return false;
          seen.add(key);
          return true;
        });
        return {
          ...prev,
          [category]: {
            loading: false,
            error: unique.length < 2 ? "Need at least 2 clips" : null,
            results: unique.slice(0, 24),
          },
        };
      });
    } catch {
      setGroups((prev) => ({
        ...prev,
        [category]: { loading: false, error: "Network error", results: [] },
      }));
    }
  }, [recentAudios]);

  useEffect(() => {
    visibleCategories.forEach((category) => {
      if (groups[category]) return;
      void fetchCategory(category);
    });
  }, [visibleCategories, groups, fetchCategory]);

  const loadNextCategoryBatch = useCallback(async () => {
    if (loadingCategoryBatch) return;
    setLoadingCategoryBatch(true);
    const q = appliedQuery.trim().toLowerCase();
    const used = new Set<string>(dynamicCategories.map((c) => c.toLowerCase()));
    const batch = buildRandomAudioCategoryBatch(q, 10, used);
    if (batch.length === 0) {
      setLoadingCategoryBatch(false);
      return;
    }
    try {
      await Promise.all(batch.map((category) => fetchCategory(category)));
      setDynamicCategories((prev) => [...prev, ...batch]);
      setVisibleCategoryCount((n) => n + batch.length);
    } finally {
      setLoadingCategoryBatch(false);
    }
  }, [appliedQuery, dynamicCategories, fetchCategory, loadingCategoryBatch]);

  /** Stops library preview so timeline / Remotion is never doubled with this player. */
  const stopPreviewAudio = useCallback(() => {
    const current = previewAudioRef.current;
    if (!current) {
      setPreviewState({
        itemId: null,
        isLoading: false,
        isPlaying: false,
        downloadPct: 0,
        playPct: 0,
      });
      return;
    }
    current.pause();
    current.currentTime = 0;
    current.src = "";
    previewAudioRef.current = null;
    setPreviewState({
      itemId: null,
      isLoading: false,
      isPlaying: false,
      downloadPct: 0,
      playPct: 0,
    });
  }, []);

  const handleAddSample = useCallback(
    (item: SampleAudio, sourceCategory: string) => {
      // Critical: preview uses a separate HTMLAudioElement; without this, the same
      // sample can play twice (library preview + timeline Remotion Audio).
      stopPreviewAudio();
      markSelectionForRecent(item, sourceCategory);
      if (sourceCategory !== RECENTLY_USED_CATEGORY) {
        recordRecentSample(item);
      }
      const totalSec = Math.min(
        120,
        Math.max(1, Math.round(item.durationSec)),
      );
      onAddSampleAudio(
        item.playbackUrl,
        item.label,
        totalSec,
        item.author,
      );
    },
    [
      markSelectionForRecent,
      recordRecentSample,
      onAddSampleAudio,
      stopPreviewAudio,
    ],
  );

  const handleTogglePreviewAudio = useCallback(
    (item: SampleAudio, sourceCategory: string) => {
      const existing = previewAudioRef.current;
      if (existing && previewState.itemId === item.id) {
        if (existing.paused) {
          onPauseMainPlayback?.();
          setPreviewState((prev) => ({ ...prev, isLoading: true }));
          void existing.play().catch(() => {
            setPreviewState((prev) => ({ ...prev, isLoading: false }));
          });
        } else {
          existing.pause();
        }
        return;
      }

      onPauseMainPlayback?.();
      stopPreviewAudio();

      const audio = new Audio(item.playbackUrl);
      audio.preload = "auto";
      previewAudioRef.current = audio;
      markSelectionForRecent(item, sourceCategory);

      const syncProgress = () => {
        const duration =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : Math.max(1, item.durationSec);
        const bufferedEnd =
          audio.buffered.length > 0
            ? audio.buffered.end(audio.buffered.length - 1)
            : 0;
        setPreviewState((prev) => ({
          ...prev,
          itemId: item.id,
          downloadPct: Math.max(
            0,
            Math.min(100, Math.round((bufferedEnd / duration) * 100)),
          ),
          playPct: Math.max(
            0,
            Math.min(100, Math.round((audio.currentTime / duration) * 100)),
          ),
        }));
      };

      audio.addEventListener("loadedmetadata", syncProgress);
      audio.addEventListener("progress", syncProgress);
      audio.addEventListener("timeupdate", syncProgress);
      audio.addEventListener("canplay", () => {
        setPreviewState((prev) => ({ ...prev, isLoading: false }));
      });
      audio.addEventListener("waiting", () => {
        setPreviewState((prev) => ({ ...prev, isLoading: true }));
      });
      audio.addEventListener("playing", () => {
        setPreviewState((prev) => ({ ...prev, isPlaying: true, isLoading: false }));
      });
      audio.addEventListener("pause", () => {
        setPreviewState((prev) => ({ ...prev, isPlaying: false, isLoading: false }));
      });
      audio.addEventListener("ended", () => {
        setPreviewState((prev) => ({ ...prev, isPlaying: false, playPct: 0 }));
      });

      setPreviewState({
        itemId: item.id,
        isLoading: true,
        isPlaying: false,
        downloadPct: 0,
        playPct: 0,
      });

      void audio.play().catch(() => {
        setPreviewState((prev) => ({ ...prev, isLoading: false, isPlaying: false }));
      });
    },
    [
      markSelectionForRecent,
      onPauseMainPlayback,
      previewState.itemId,
      stopPreviewAudio,
    ],
  );

  useEffect(() => {
    return () => {
      if (!previewAudioRef.current) return;
      previewAudioRef.current.pause();
      previewAudioRef.current.src = "";
      previewAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mainPreviewIsPlaying) return;
    stopPreviewAudio();
  }, [mainPreviewIsPlaying, stopPreviewAudio]);

  const handleLoadMoreCategories = useCallback(() => {
    if (loadingCategoryBatch) return;
    void loadNextCategoryBatch();
  }, [loadNextCategoryBatch, loadingCategoryBatch]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/80">
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden px-2 py-4">
        <section className="shrink-0 pb-0.5 pl-0" aria-label="Search audio samples">
          <form
            className="flex w-full gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              runAudioSampleSearch();
            }}
          >
            <input
              type="search"
              value={queryInput}
              onChange={(e) => {
                const v = e.target.value;
                setQueryInput(v);
                if (v.trim() === "") {
                  setAppliedQuery("");
                }
              }}
              placeholder="Search audio (ambient, kids, fun...)"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              aria-label="Search audio samples"
            />
            <button
              type="submit"
              aria-label="Search"
              title="Search"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-black bg-black text-white shadow-sm transition hover:bg-slate-900 hover:border-slate-900 focus:outline-none focus:ring-2 focus:ring-black/35 focus:ring-offset-2"
            >
              <Search className="h-4 w-4 text-white" aria-hidden />
            </button>
          </form>
        </section>

        <div className="mt-1 min-h-0 flex-1 space-y-3 overflow-y-auto pb-0.5">
          <div className="space-y-2.5">
            {visibleCategories.map((category) => {
              const group = groups[category];
              const results = group?.results ?? [];
              const showRow = Boolean(group && group.results.length >= 2);

              if (group && !group.loading && !showRow) {
                return null;
              }

              return (
                <section key={category} className="space-y-1">
                  <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {category}
                  </p>
                  {group?.error ? (
                    <p className="text-xs text-amber-700">{group.error}</p>
                  ) : null}
                  {!group || group.loading ? (
                    <p className="text-xs text-slate-500">Loading...</p>
                  ) : null}
                  {showRow ? (
                    <div className="overflow-x-auto">
                      <div className="inline-flex gap-1.5 pb-1">
                        {results.map((item) => {
                          const meta = sampleAudioTitleAuthor(item);
                          const isPreviewItem = previewState.itemId === item.id;
                          const totalSec = Math.min(
                            120,
                            Math.max(1, Math.round(item.durationSec)),
                          );
                          const totalTime =
                            totalSec >= 60
                              ? `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`
                              : `${totalSec}s`;
                          const ringRadius = AUDIO_SAMPLE_RING_RADIUS;
                          const ringCircumference = 2 * Math.PI * ringRadius;
                          const downloadPct = isPreviewItem
                            ? previewState.downloadPct
                            : 0;
                          const playPct = isPreviewItem ? previewState.playPct : 0;
                          return (
                            <div
                              key={`${category}-${item.id}`}
                              role="button"
                              tabIndex={0}
                              aria-label={`Add ${meta.title} to timeline`}
                              onPointerUp={(e) => {
                                if (e.button !== 0) return;
                                if ((e.target as HTMLElement).closest("button")) return;
                                handleAddSample(item, category);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleAddSample(item, category);
                                }
                              }}
                              className="w-56 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white px-2 py-1"
                            >
                              <div className="flex items-center gap-2">
                                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-emerald-100">
                                  {/* Theme-based thumbnail per audio category item. */}
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={sampleAudioThumbnailSrc(item, category)}
                                    alt=""
                                    className="absolute inset-0 h-full w-full rounded-lg object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none";
                                    }}
                                  />
                                  <Music2
                                    className="relative z-[1] h-8 w-8 text-emerald-700 drop-shadow-sm"
                                    aria-hidden
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTogglePreviewAudio(item, category);
                                    }}
                                    className="absolute left-1/2 top-1/2 z-[2] inline-flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/70 text-white shadow transition hover:border-white/40 hover:bg-black/85"
                                    aria-label="Preview audio"
                                  >
                                    {isPreviewItem && previewState.isLoading ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : isPreviewItem && previewState.isPlaying ? (
                                      <Pause className="h-4 w-4" />
                                    ) : (
                                      <Play className="h-4 w-4 drop-shadow-md" />
                                    )}
                                  </button>
                                  {isPreviewItem ? (
                                    <svg
                                      className="pointer-events-none absolute left-1/2 top-1/2 z-[1] h-8 w-8 -translate-x-1/2 -translate-y-1/2"
                                      viewBox="0 0 36 36"
                                      aria-hidden
                                    >
                                      <circle
                                        cx="18"
                                        cy="18"
                                        r={ringRadius}
                                        fill="none"
                                        stroke="rgba(255,255,255,0.28)"
                                        strokeWidth="2"
                                      />
                                      <circle
                                        cx="18"
                                        cy="18"
                                        r={ringRadius}
                                        fill="none"
                                        stroke="rgba(16,185,129,0.6)"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        transform="rotate(-90 18 18)"
                                        strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                                        style={{
                                          strokeDashoffset:
                                            ringCircumference *
                                            (1 - downloadPct / 100),
                                        }}
                                      />
                                      <circle
                                        cx="18"
                                        cy="18"
                                        r={ringRadius - 3}
                                        fill="none"
                                        stroke="rgba(5,150,105,0.92)"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        transform="rotate(-90 18 18)"
                                        strokeDasharray={`${2 * Math.PI * (ringRadius - 3)} ${2 * Math.PI * (ringRadius - 3)}`}
                                        style={{
                                          strokeDashoffset:
                                            (2 * Math.PI * (ringRadius - 3)) *
                                            (1 - playPct / 100),
                                        }}
                                      />
                                    </svg>
                                  ) : null}
                                </div>
                                <div className="min-w-0 flex-1 leading-tight">
                                  <p className="truncate text-sm font-semibold leading-tight text-slate-900">
                                    {meta.title}
                                  </p>
                                  <p className="truncate text-[11px] leading-tight text-slate-500">
                                    Author: {meta.author}
                                  </p>
                                  <p className="text-[11px] leading-tight text-slate-500">
                                    Total: {totalTime}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>

          <div className="pt-0.5 pb-0 text-center">
            <button
              type="button"
              onClick={handleLoadMoreCategories}
              disabled={loadingCategoryBatch}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingCategoryBatch ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load more"
              )}
            </button>
          </div>
        </div>

        {recentAudios.length > 0 ? (
          <div className="-mx-2 -mb-4 mt-3 shrink-0">
            <section
              aria-label={RECENTLY_USED_CATEGORY}
              className="relative bg-slate-950/70 p-2.5 pb-6 backdrop-blur-md"
            >
              <p className="pointer-events-none absolute bottom-1.5 left-2.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300/95">
                {RECENTLY_USED_CATEGORY}
              </p>
              <div className="overflow-x-auto overflow-y-visible pb-0.5">
                <div className="inline-flex gap-1.5 pb-1">
                  {recentAudios.map((item) => {
                    const isPreviewItem = previewState.itemId === item.id;
                    const meta = sampleAudioTitleAuthor(item);
                    const totalSec = Math.min(
                      120,
                      Math.max(1, Math.round(item.durationSec)),
                    );
                    const totalTime =
                      totalSec >= 60
                        ? `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`
                        : `${totalSec}s`;
                    const ringRadius = AUDIO_SAMPLE_RING_RADIUS;
                    const ringCircumference = 2 * Math.PI * ringRadius;
                    const downloadPct = isPreviewItem ? previewState.downloadPct : 0;
                    const playPct = isPreviewItem ? previewState.playPct : 0;
                    return (
                      <div
                        key={`recent-bottom-${item.id}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Add ${meta.title} to timeline`}
                        onPointerUp={(e) => {
                          if (e.button !== 0) return;
                          if ((e.target as HTMLElement).closest("button")) return;
                          handleAddSample(item, RECENTLY_USED_CATEGORY);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleAddSample(item, RECENTLY_USED_CATEGORY);
                          }
                        }}
                        className="w-56 shrink-0 cursor-pointer rounded-xl border border-slate-700/85 bg-slate-900/80 px-2 py-1"
                      >
                        <div className="flex items-center gap-2">
                          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-emerald-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={sampleAudioThumbnailSrc(
                                item,
                                RECENTLY_USED_CATEGORY,
                              )}
                              alt=""
                              className="absolute inset-0 h-full w-full rounded-lg object-cover"
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                            <Music2
                              className="relative z-[1] h-8 w-8 text-emerald-700 drop-shadow-sm"
                              aria-hidden
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePreviewAudio(item, RECENTLY_USED_CATEGORY);
                              }}
                              className="absolute left-1/2 top-1/2 z-[2] inline-flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/70 text-white shadow transition hover:border-white/40 hover:bg-black/85"
                              aria-label="Preview recent audio item"
                            >
                              {isPreviewItem && previewState.isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : isPreviewItem && previewState.isPlaying ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4 drop-shadow-md" />
                              )}
                            </button>
                            {isPreviewItem ? (
                              <svg
                                className="pointer-events-none absolute left-1/2 top-1/2 z-[1] h-8 w-8 -translate-x-1/2 -translate-y-1/2"
                                viewBox="0 0 36 36"
                                aria-hidden
                              >
                                <circle
                                  cx="18"
                                  cy="18"
                                  r={ringRadius}
                                  fill="none"
                                  stroke="rgba(255,255,255,0.28)"
                                  strokeWidth="2"
                                />
                                <circle
                                  cx="18"
                                  cy="18"
                                  r={ringRadius}
                                  fill="none"
                                  stroke="rgba(16,185,129,0.6)"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  transform="rotate(-90 18 18)"
                                  strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                                  style={{
                                    strokeDashoffset:
                                      ringCircumference * (1 - downloadPct / 100),
                                  }}
                                />
                                <circle
                                  cx="18"
                                  cy="18"
                                  r={ringRadius - 3}
                                  fill="none"
                                  stroke="rgba(5,150,105,0.92)"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  transform="rotate(-90 18 18)"
                                  strokeDasharray={`${2 * Math.PI * (ringRadius - 3)} ${2 * Math.PI * (ringRadius - 3)}`}
                                  style={{
                                    strokeDashoffset:
                                      (2 * Math.PI * (ringRadius - 3)) *
                                      (1 - playPct / 100),
                                  }}
                                />
                              </svg>
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1 leading-tight">
                            <p className="truncate text-sm font-semibold leading-tight text-slate-100">
                              {meta.title}
                            </p>
                            <p className="truncate text-[11px] leading-tight text-slate-300">
                              Author: {meta.author}
                            </p>
                            <p className="text-[11px] leading-tight text-slate-400">
                              Total: {totalTime}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
