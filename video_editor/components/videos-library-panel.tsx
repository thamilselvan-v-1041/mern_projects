"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pause, Play, Search, X } from "lucide-react";

type Props = {
  onAddSampleVideo: (
    src: string,
    durationSec: number,
    meta?: { sourceName?: string; sourceAuthor?: string },
  ) => void;
};

type SampleVideo = {
  id: string;
  label: string;
  author?: string;
  previewUrl: string;
  playbackUrl: string;
  durationSec: number;
  aspectW?: number;
  aspectH?: number;
  /** Sample row / Pexels query this pick came from (for Recently used search). */
  sampleCategory?: string;
};

type SampleGroup = {
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  results: SampleVideo[];
  page: number;
  hasMore: boolean;
};

const RECENTLY_USED_CATEGORY = "Recently used";
const RECENT_VIDEOS_STORAGE_KEY = "video-editor-recent-sample-videos";
const MAX_RECENT_VIDEOS = 40;

function loadRecentVideosFromStorage(): SampleVideo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_VIDEOS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is SampleVideo =>
        x &&
        typeof x === "object" &&
        typeof (x as SampleVideo).playbackUrl === "string" &&
        typeof (x as SampleVideo).previewUrl === "string",
    );
  } catch {
    return [];
  }
}

function saveRecentVideosToStorage(items: SampleVideo[]) {
  try {
    localStorage.setItem(RECENT_VIDEOS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

const SAMPLE_SEGMENTS = [
  "trending",
  "tech",
  "people",
  "nature background",
  "transition effects",
  "birds",
  "animals",
  "fun",
  "children at park",
  "father with kids",
  "mother with kids",
  "city life",
  "travel",
  "fitness",
  "food",
  "sports",
  "music",
  "dance",
  "sunset",
  "ocean",
  "winter",
  "slow motion",
  "timelapse",
  "abstract",
  "workspace",
];

const RANDOM_VIDEO_ADJECTIVES = [
  "cinematic",
  "dramatic",
  "minimal",
  "vibrant",
  "moody",
  "colorful",
  "aerial",
  "slow motion",
  "dynamic",
  "retro",
];

const RANDOM_VIDEO_TOPICS = [
  "street",
  "mountains",
  "waterfall",
  "forest",
  "night city",
  "office",
  "startup",
  "coding",
  "coffee",
  "festival",
  "wedding",
  "family time",
  "business meeting",
  "yoga",
  "running",
  "soccer",
  "beach",
  "sunrise",
  "sunset",
  "clouds",
  "cars",
  "architecture",
  "education",
  "classroom",
  "pets",
  "wildlife",
  "food prep",
  "kitchen",
  "technology",
  "robotics",
];

const QUERY_MODIFIERS = [
  "trending",
  "b-roll",
  "cinematic",
  "aesthetic",
  "slow motion",
  "background",
  "scene",
  "moments",
];

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildRandomCategoryBatch(
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
      ? `${q} ${pickRandom(QUERY_MODIFIERS)} ${pickRandom(RANDOM_VIDEO_TOPICS)}`
      : `${pickRandom(RANDOM_VIDEO_ADJECTIVES)} ${pickRandom(
          RANDOM_VIDEO_TOPICS,
        )}`;
    const normalized = candidate.trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized || exclude.has(normalized)) continue;
    exclude.add(normalized);
    out.push(normalized);
  }
  return out;
}

/** Match preset segment labels against the search string (and multi-word tokens). */
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
 * When search is set: matching preset names first, then the raw query for Pexels, then generated related queries.
 */
function buildOrderedCategoriesForSearch(queryRaw: string): string[] {
  const baseLower = SAMPLE_SEGMENTS.map((c) => c.trim().toLowerCase());
  const q = queryRaw.trim().toLowerCase();

  if (!q) {
    const seed = new Set(baseLower);
    const randomTail = buildRandomCategoryBatch("", 40, seed);
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

  const randomTail = buildRandomCategoryBatch(q, 40, seed);

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

export function VideosLibraryPanel({
  onAddSampleVideo,
}: Props) {
  const [queryInput, setQueryInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [visibleCategoryCount, setVisibleCategoryCount] = useState(10);
  const [groups, setGroups] = useState<Record<string, SampleGroup>>({});
  const [recentVideos, setRecentVideos] = useState<SampleVideo[]>([]);
  const [dynamicCategories, setDynamicCategories] = useState<string[]>([]);
  const [loadingCategoryBatch, setLoadingCategoryBatch] = useState(false);
  const [activeVideoKey, setActiveVideoKey] = useState<string | null>(null);
  const [activeVideoItem, setActiveVideoItem] = useState<SampleVideo | null>(null);
  const activeSampleCategoryRef = useRef<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<SampleVideo | null>(null);
  const [previewVideoPlaying, setPreviewVideoPlaying] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setRecentVideos(loadRecentVideosFromStorage());
  }, []);

  const recordRecentSample = useCallback(
    (video: SampleVideo, sourceCategory?: string | null) => {
      setRecentVideos((prev) => {
        const key = video.playbackUrl || video.id;
        const row =
          sourceCategory &&
          sourceCategory !== RECENTLY_USED_CATEGORY &&
          !video.sampleCategory
            ? { ...video, sampleCategory: sourceCategory }
            : video;
        const next = [
          row,
          ...prev.filter((v) => (v.playbackUrl || v.id) !== key),
        ].slice(0, MAX_RECENT_VIDEOS);
        saveRecentVideosToStorage(next);
        return next;
      });
    },
    [],
  );

  const markSelectionForRecent = useCallback(
    (video: SampleVideo, sourceCategory: string) => {
      if (sourceCategory === RECENTLY_USED_CATEGORY) return;
      const key = video.playbackUrl || video.id;
      if (activeVideoKey && activeVideoItem && activeVideoKey !== key) {
        recordRecentSample(
          activeVideoItem,
          activeSampleCategoryRef.current,
        );
      }
      activeSampleCategoryRef.current = sourceCategory;
      setActiveVideoKey(key);
      setActiveVideoItem(video);
    },
    [activeVideoItem, activeVideoKey, recordRecentSample],
  );

  const runVideoSampleSearch = useCallback(() => {
    setAppliedQuery(queryInput.trim());
  }, [queryInput]);

  useEffect(() => {
    setDynamicCategories(buildOrderedCategoriesForSearch(appliedQuery));
    setLoadingCategoryBatch(false);
    setVisibleCategoryCount(10);
  }, [appliedQuery]);

  const categories = dynamicCategories;

  const visibleCategories = useMemo(
    () => categories.slice(0, visibleCategoryCount),
    [categories, visibleCategoryCount],
  );

  const fetchCategory = useCallback(async (category: string, page = 1) => {
    setGroups((prev) => ({
      ...prev,
      [category]: {
        loading: page === 1,
        loadingMore: page > 1,
        error: null,
        results: page === 1 ? [] : prev[category]?.results || [],
        page: prev[category]?.page || 0,
        hasMore: prev[category]?.hasMore ?? true,
      },
    }));
    try {
      const params = new URLSearchParams({
        q: category,
        per_page: "30",
        page: String(page),
      });
      const res = await fetch(`/api/media/pexels-videos?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGroups((prev) => ({
          ...prev,
          [category]: {
            loading: false,
            loadingMore: false,
            error: data?.error || `Request failed (${res.status})`,
            results: prev[category]?.results || [],
            page: prev[category]?.page || 0,
            hasMore: false,
          },
        }));
        return;
      }
      const incoming = Array.isArray(data.results) ? data.results : [];
      setGroups((prev) => {
        const current = page === 1 ? [] : prev[category]?.results || [];
        const usedElsewhere = new Set<string>();
        recentVideos.forEach((r) => {
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
        const merged = [...current, ...incoming].filter((r: SampleVideo) => {
          const key = r.playbackUrl || r.id;
          if (!key || seen.has(key)) return false;
          if (!current.some((c) => (c.playbackUrl || c.id) === key) && usedElsewhere.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
        return {
          ...prev,
          [category]: {
            loading: false,
            loadingMore: false,
            error: merged.length < 2 ? "Need at least 2 clips" : null,
            results: merged,
            page,
            hasMore: Boolean(data?.hasMore),
          },
        };
      });
    } catch {
      setGroups((prev) => ({
        ...prev,
        [category]: {
          loading: false,
          loadingMore: false,
          error: "Network error",
          results: prev[category]?.results || [],
          page: prev[category]?.page || 0,
          hasMore: prev[category]?.hasMore ?? false,
        },
      }));
    }
  }, [recentVideos]);

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
    const batch = buildRandomCategoryBatch(q, 10, used);
    if (batch.length === 0) {
      setLoadingCategoryBatch(false);
      return;
    }
    try {
      await Promise.all(batch.map((category) => fetchCategory(category, 1)));
      setDynamicCategories((prev) => [...prev, ...batch]);
      setVisibleCategoryCount((n) => n + batch.length);
    } finally {
      setLoadingCategoryBatch(false);
    }
  }, [appliedQuery, dynamicCategories, fetchCategory, loadingCategoryBatch]);

  const handleAddSample = useCallback(
    (r: SampleVideo, sourceCategory: string) => {
      markSelectionForRecent(r, sourceCategory);
      if (sourceCategory !== RECENTLY_USED_CATEGORY) {
        recordRecentSample(r, sourceCategory);
      }
      onAddSampleVideo(r.playbackUrl, r.durationSec, {
        sourceName: r.label,
        sourceAuthor: r.author,
      });
    },
    [markSelectionForRecent, onAddSampleVideo, recordRecentSample],
  );

  const handleLoadMoreCategories = useCallback(() => {
    if (loadingCategoryBatch) return;
    void loadNextCategoryBatch();
  }, [loadNextCategoryBatch, loadingCategoryBatch]);

  useEffect(() => {
    if (!previewVideo) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewVideo(null);
        setPreviewVideoPlaying(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewVideo]);

  useEffect(() => {
    if (!previewVideo) setPreviewVideoPlaying(false);
  }, [previewVideo]);

  const handlePreviewIconClick = useCallback(
    (e: React.MouseEvent, r: SampleVideo) => {
      e.stopPropagation();
      const key = r.playbackUrl || r.id;
      const cur = previewVideo;
      const curKey = cur ? cur.playbackUrl || cur.id : null;
      if (curKey === key && previewVideoRef.current) {
        const v = previewVideoRef.current;
        if (v.paused) void v.play();
        else v.pause();
        return;
      }
      setPreviewVideo(r);
    },
    [previewVideo],
  );

  const renderVideoSampleCard = useCallback(
    (
      r: SampleVideo,
      sourceCategory: string,
      key: string,
      style: "default" | "recent" = "default",
    ) => {
      const rowKey = r.playbackUrl || r.id;
      const pvKey = previewVideo
        ? previewVideo.playbackUrl || previewVideo.id
        : null;
      const isPreviewTarget = pvKey === rowKey;
      const showPauseOnChip =
        isPreviewTarget && previewVideoPlaying;

      return (
      <div
        key={key}
        role="button"
        tabIndex={0}
        onClick={() => handleAddSample(r, sourceCategory)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleAddSample(r, sourceCategory);
          }
        }}
        className={
          style === "recent"
            ? "group w-44 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-slate-700/85 bg-slate-900/80 text-left shadow-sm transition hover:border-violet-400/70 hover:ring-2 hover:ring-violet-500/25"
            : "group w-44 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-left shadow-sm transition hover:border-violet-400 hover:ring-2 hover:ring-violet-200"
        }
      >
        <div className="relative aspect-video w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={r.previewUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <button
            type="button"
            aria-label={
              showPauseOnChip
                ? `Pause preview of ${r.label}`
                : `Preview ${r.label}`
            }
            title={showPauseOnChip ? "Pause preview" : "Preview video"}
            onClick={(e) => handlePreviewIconClick(e, r)}
            className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-black/70 text-white shadow transition hover:border-white/40 hover:bg-black/85"
          >
            {showPauseOnChip ? (
              <Pause className="h-3.5 w-3.5 fill-current" aria-hidden />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
            )}
          </button>
                              <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                {Math.max(1, Math.round(r.durationSec))}s
                              </span>
        </div>
      </div>
      );
    },
    [
      handleAddSample,
      handlePreviewIconClick,
      previewVideo,
      previewVideoPlaying,
    ],
  );

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/80">
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden px-2 py-4">
        <section className="shrink-0 pb-1 pl-0" aria-label="Search video samples">
          <form
            className="flex w-full gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              runVideoSampleSearch();
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
              placeholder="Search videos (tech, family, nature...)"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              aria-label="Search video samples"
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

        <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pb-1">
          <div className="space-y-2.5">
            {visibleCategories
              .filter((category) => {
                const g = groups[category];
                return g != null && g.results.length >= 2;
              })
              .map((category) => {
                const group = groups[category]!;
                const results = group.results;

                return (
                  <section key={category} className="space-y-1">
                    <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {category}
                    </p>
                    <div
                      className="overflow-x-auto"
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        if (
                          el.scrollLeft + el.clientWidth >= el.scrollWidth - 120 &&
                          group.hasMore &&
                          !group.loadingMore
                        ) {
                          void fetchCategory(category, (group.page || 1) + 1);
                        }
                      }}
                    >
                      <div className="inline-flex gap-1.5 pb-1">
                        {results.map((r) =>
                          renderVideoSampleCard(
                            r,
                            category,
                            `${category}-${r.id}`,
                          ),
                        )}
                        {group.loadingMore ? (
                          <div className="flex h-[calc(90px)] w-[calc(140px)] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100/60">
                            <Loader2
                              className="h-4 w-4 animate-spin text-slate-500"
                              aria-hidden
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>
                );
              })}
            {loadingCategoryBatch ? (
              <section className="space-y-1">
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Loading category
                </p>
                <div className="flex h-[calc(86px)] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50">
                  <Loader2
                    className="h-4 w-4 animate-spin text-slate-500"
                    aria-hidden
                  />
                </div>
              </section>
            ) : null}
          </div>

          <div className="pt-1 pb-0.5 text-center">
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

        {recentVideos.length > 0 ? (
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
                  {recentVideos.map((r) =>
                    renderVideoSampleCard(
                      r,
                      RECENTLY_USED_CATEGORY,
                      `recent-bottom-${r.id}`,
                      "recent",
                    ),
                  )}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
      {previewVideo ? (
        <div
          className="group/preview fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewVideo.label}`}
          onClick={() => {
            setPreviewVideo(null);
            setPreviewVideoPlaying(false);
          }}
        >
          <div
            className="pointer-events-auto absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-white/15 bg-white/10 px-4 py-3 text-white shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-[background-color,box-shadow,backdrop-filter] duration-300 ease-out hover:bg-white/15 hover:shadow-[0_12px_48px_rgba(0,0,0,0.55)] group-hover/preview:bg-white/12 group-hover/preview:backdrop-blur-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="min-w-0 truncate text-sm font-semibold drop-shadow-sm">
              {previewVideo.label}
            </p>
            <button
              type="button"
              onClick={() => {
                setPreviewVideo(null);
                setPreviewVideoPlaying(false);
              }}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/30 bg-white/15 text-white shadow-inner backdrop-blur-sm transition hover:border-white/45 hover:bg-white/25"
              aria-label="Close preview"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div
            className="relative z-10 flex w-full max-w-5xl items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              ref={previewVideoRef}
              key={previewVideo.playbackUrl}
              src={previewVideo.playbackUrl}
              className="max-h-[min(82vh,calc(100vh-5rem))] w-full rounded-xl object-contain shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-white/15"
              controls
              autoPlay
              playsInline
              onPlay={() => setPreviewVideoPlaying(true)}
              onPause={() => setPreviewVideoPlaying(false)}
              onEnded={() => setPreviewVideoPlaying(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
