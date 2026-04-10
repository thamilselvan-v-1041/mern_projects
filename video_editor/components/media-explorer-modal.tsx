"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  Image as ImageIcon,
  Loader2,
  Search,
  Smile,
  X,
} from "lucide-react";

export type MediaExplorerResult = {
  id: string;
  label: string;
  author?: string;
  previewUrl: string;
  playbackUrl: string;
  mediaType: "video" | "image";
};

type Tab = "giphy" | "pexels";
const RECENT_MEDIA_STORAGE_KEY = "video-editor-recent-gif-media";
const MAX_RECENT_MEDIA = 24;
type CachedSearchState = {
  results: MediaExplorerResult[];
  page: number;
  hasMore: boolean;
  error: string | null;
};

type Props = {
  /** `modal` = overlay. `page` = embedded editor view (no backdrop). */
  layout?: "modal" | "page";
  isOpen: boolean;
  onClose?: () => void;
  onPick: (
    src: string,
    opts: { label: string; mediaType: "video" | "image"; author?: string },
  ) => void;
};

export function MediaExplorerModal({
  layout = "modal",
  isOpen,
  onClose,
  onPick,
}: Props) {
  const [tab, setTab] = useState<Tab>("giphy");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaExplorerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [recentMedia, setRecentMedia] = useState<MediaExplorerResult[]>([]);
  const [previewItem, setPreviewItem] = useState<MediaExplorerResult | null>(null);
  const [searchCache, setSearchCache] = useState<Record<string, CachedSearchState>>({});

  const cacheKeyFor = useCallback((tabName: Tab, q: string) => {
    const normalized = q.trim().toLowerCase();
    return `${tabName}::${normalized || "__default__"}`;
  }, []);

  const currentCacheKey = useMemo(
    () => cacheKeyFor(tab, query),
    [cacheKeyFor, tab, query]
  );

  const restoreFromCache = useCallback(
    (key: string): boolean => {
      const cached = searchCache[key];
      if (!cached) return false;
      setResults(cached.results);
      setPage(cached.page);
      setHasMore(cached.hasMore);
      setError(cached.error);
      setLoading(false);
      setLoadingMore(false);
      return true;
    },
    [searchCache]
  );

  const getMediaKey = useCallback(
    (item: MediaExplorerResult) => `${item.mediaType}:${item.playbackUrl || item.id}`,
    []
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_MEDIA_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter(
        (x): x is MediaExplorerResult =>
          x &&
          typeof x === "object" &&
          typeof (x as MediaExplorerResult).id === "string" &&
          typeof (x as MediaExplorerResult).previewUrl === "string" &&
          typeof (x as MediaExplorerResult).playbackUrl === "string" &&
          ((x as MediaExplorerResult).mediaType === "video" ||
            (x as MediaExplorerResult).mediaType === "image")
      );
      setRecentMedia(valid.slice(0, MAX_RECENT_MEDIA));
    } catch {
      /* ignore storage parse errors */
    }
  }, []);

  const recordRecentMedia = useCallback((item: MediaExplorerResult) => {
    setRecentMedia((prev) => {
      const key = getMediaKey(item);
      const next = [item, ...prev.filter((v) => getMediaKey(v) !== key)].slice(
        0,
        MAX_RECENT_MEDIA
      );
      try {
        localStorage.setItem(RECENT_MEDIA_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore storage write errors */
      }
      return next;
    });
  }, [getMediaKey]);

  const fetchGiphy = useCallback(async (q: string, targetPage = 1) => {
    const append = targetPage > 1;
    setLoading(targetPage === 1);
    setLoadingMore(append);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("offset", String((targetPage - 1) * 24));
      params.set("limit", "24");
      const res = await fetch(`/api/media/giphy?${params}`);
      const data = (await res.json().catch(() => ({}))) as {
        results?: MediaExplorerResult[];
        hasMore?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(data?.error || `Request failed (${res.status})`);
        if (targetPage === 1) setResults([]);
        setHasMore(false);
        return;
      }
      const incoming = Array.isArray(data.results) ? data.results : [];
      setResults((prev) => {
        if (!append) return incoming;
        const seen = new Set(prev.map((r) => `${r.mediaType}:${r.id}`));
        const merged = [...prev];
        for (const r of incoming) {
          const k = `${r.mediaType}:${r.id}`;
          if (seen.has(k)) continue;
          seen.add(k);
          merged.push(r);
        }
        return merged;
      });
      setPage(targetPage);
      setHasMore(Boolean(data?.hasMore) && incoming.length > 0);
      const nextResults = append
        ? (() => {
            const existing = searchCache[cacheKeyFor("giphy", q)]?.results ?? [];
            const seen = new Set(existing.map((r) => `${r.mediaType}:${r.id}`));
            const merged = [...existing];
            for (const r of incoming) {
              const k = `${r.mediaType}:${r.id}`;
              if (seen.has(k)) continue;
              seen.add(k);
              merged.push(r);
            }
            return merged;
          })()
        : incoming;
      const nextHasMore = Boolean(data?.hasMore) && incoming.length > 0;
      setSearchCache((prev) => ({
        ...prev,
        [cacheKeyFor("giphy", q)]: {
          results: nextResults,
          page: targetPage,
          hasMore: nextHasMore,
          error: null,
        },
      }));
    } catch {
      setError("Network error");
      if (targetPage === 1) setResults([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cacheKeyFor, searchCache]);

  const fetchPexels = useCallback(async (q: string, targetPage = 1) => {
    const append = targetPage > 1;
    setLoading(targetPage === 1);
    setLoadingMore(append);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: q.trim() || "nature",
        per_page: "20",
        page: String(targetPage),
      });
      const res = await fetch(`/api/media/pexels?${params}`);
      const data = (await res.json().catch(() => ({}))) as {
        results?: MediaExplorerResult[];
        hasMore?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(data?.error || `Request failed (${res.status})`);
        if (targetPage === 1) setResults([]);
        setHasMore(false);
        return;
      }
      const incoming = Array.isArray(data.results) ? data.results : [];
      setResults((prev) => {
        if (!append) return incoming;
        const seen = new Set(prev.map((r) => `${r.mediaType}:${r.id}`));
        const merged = [...prev];
        for (const r of incoming) {
          const k = `${r.mediaType}:${r.id}`;
          if (seen.has(k)) continue;
          seen.add(k);
          merged.push(r);
        }
        return merged;
      });
      setPage(targetPage);
      setHasMore(Boolean(data?.hasMore) && incoming.length > 0);
      const nextResults = append
        ? (() => {
            const existing = searchCache[cacheKeyFor("pexels", q)]?.results ?? [];
            const seen = new Set(existing.map((r) => `${r.mediaType}:${r.id}`));
            const merged = [...existing];
            for (const r of incoming) {
              const k = `${r.mediaType}:${r.id}`;
              if (seen.has(k)) continue;
              seen.add(k);
              merged.push(r);
            }
            return merged;
          })()
        : incoming;
      const nextHasMore = Boolean(data?.hasMore) && incoming.length > 0;
      setSearchCache((prev) => ({
        ...prev,
        [cacheKeyFor("pexels", q)]: {
          results: nextResults,
          page: targetPage,
          hasMore: nextHasMore,
          error: null,
        },
      }));
    } catch {
      setError("Network error");
      if (targetPage === 1) setResults([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cacheKeyFor, searchCache]);

  useEffect(() => {
    if (!isOpen) return;
    if (restoreFromCache(currentCacheKey)) return;
    setError(null);
    setPage(1);
    setHasMore(false);
    if (tab === "giphy") void fetchGiphy(query, 1);
    else void fetchPexels(query, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on open / tab switch only
  }, [isOpen, tab, currentCacheKey, restoreFromCache]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const key = cacheKeyFor(tab, query);
    if (restoreFromCache(key)) return;
    setPage(1);
    setHasMore(false);
    if (tab === "giphy") void fetchGiphy(query, 1);
    else void fetchPexels(query, 1);
  };

  const handleLoadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    if (tab === "giphy") void fetchGiphy(query, nextPage);
    else void fetchPexels(query, nextPage);
  }, [fetchGiphy, fetchPexels, hasMore, loading, loadingMore, page, query, tab]);

  const handlePickResult = useCallback(
    (r: MediaExplorerResult) => {
      recordRecentMedia(r);
      onPick(r.playbackUrl, {
        label: r.label,
        mediaType: r.mediaType,
        author: r.author,
      });
    },
    [onPick, recordRecentMedia]
  );

  useEffect(() => {
    if (!previewItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewItem(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewItem]);

  if (!isOpen) return null;

  const shellClass =
    layout === "page"
      ? "flex h-full min-h-0 w-full flex-col overflow-hidden"
      : "flex max-h-[min(640px,88vh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl";

  const card = (
    <div className={shellClass}>
        {layout === "modal" ? (
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
            <div className="min-h-8 flex-1" />
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        ) : null}
        
        <div
          className={`shrink-0 flex justify-center border-b border-slate-200 pt-1 ${
            layout === "page" ? "px-0" : "px-2"
          }`}
        >
          <button
            type="button"
            onClick={() => setTab("giphy")}
            className={`inline-flex min-w-28 items-center justify-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium ${
              tab === "giphy"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Smile className="h-4 w-4" />
            Giphy
          </button>
          <button
            type="button"
            onClick={() => setTab("pexels")}
            className={`inline-flex min-w-28 items-center justify-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium ${
              tab === "pexels"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            Photos
          </button>
        </div>

        <form
          onSubmit={handleSearch}
          className={`shrink-0 flex w-full gap-2 border-b border-slate-100 py-2 ${
            layout === "page" ? "px-2" : "px-2"
          }`}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              if (v.trim() === "") {
                const key = cacheKeyFor(tab, "");
                if (!restoreFromCache(key)) {
                  if (tab === "giphy") void fetchGiphy("");
                  else void fetchPexels("");
                }
              }
            }}
            placeholder={
              tab === "giphy"
                ? "Search Gifs (trending, fun, anime..)"
                : "Search photos (e.g. ocean, city)"
            }
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            aria-label={
              tab === "giphy" ? "Search GIFs" : "Search photos"
            }
          />
          <button
            type="submit"
            aria-label="Search"
            title="Search"
            disabled={loading}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-black bg-black text-white shadow-sm transition hover:bg-slate-900 hover:border-slate-900 focus:outline-none focus:ring-2 focus:ring-black/35 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
          >
            <Search className="h-4 w-4 text-white" aria-hidden />
          </button>
        </form>

        <div
          className={`min-h-0 flex-1 overflow-y-auto ${
            layout === "page" ? "px-2 py-1.5" : "p-1.5"
          }`}
        >
          {error ? (
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {error}
            </div>
          ) : null}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
              {results.map((r) => (
                <div
                  key={`${tab}-${r.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handlePickResult(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handlePickResult(r);
                    }
                  }}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-left shadow-sm transition hover:border-violet-400 hover:shadow-md hover:ring-1 hover:ring-violet-300"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN thumbnails */}
                  <img
                    src={r.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewItem(r);
                    }}
                    className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/45 text-slate-200/90 transition hover:bg-slate-900/60 hover:text-slate-100"
                    aria-label={`Preview ${r.label}`}
                    title="View"
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {!loading && results.length > 0 && hasMore ? (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load more"
                )}
              </button>
            </div>
          ) : null}
          {!loading && results.length === 0 && !error ? (
            <p className="py-12 text-center text-sm text-slate-500">
              No results. Try another search or check API keys in{" "}
              <code className="rounded bg-slate-100 px-1">.env.local</code>.
            </p>
          ) : null}
        </div>

        {recentMedia.length > 0 ? (
          <div className="shrink-0">
            <section
              aria-label="Recently used"
              className="relative bg-slate-950/70 px-3 py-2.5 pb-6 backdrop-blur-md"
            >
              <p className="pointer-events-none absolute bottom-1.5 left-2 z-[1] truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300/95">
                Recently used
              </p>
              <div className="overflow-x-auto px-0.5 py-0.5">
                <div className="inline-flex gap-1.5 pb-0.5">
                  {recentMedia.map((r) => (
                    <div
                      key={`recent-${r.mediaType}-${r.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handlePickResult(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handlePickResult(r);
                        }
                      }}
                      className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-700/85 bg-slate-900/80 text-left shadow-sm transition hover:border-violet-400/70 hover:ring-1 hover:ring-violet-500/25"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN thumbnails */}
                      <img
                        src={r.previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewItem(r);
                        }}
                        className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/45 text-slate-200/90 transition hover:bg-slate-900/60 hover:text-slate-100"
                        aria-label={`Preview ${r.label}`}
                        title="View"
                      >
                        <Eye className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
  );

  const previewOverlay = previewItem ? (
    <div
      className="group/preview fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${previewItem.label}`}
      onClick={() => setPreviewItem(null)}
    >
      <div
        className="pointer-events-auto absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-white/15 bg-white/10 px-4 py-3 text-white shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-[background-color,box-shadow,backdrop-filter] duration-300 ease-out hover:bg-white/15 hover:shadow-[0_12px_48px_rgba(0,0,0,0.55)] group-hover/preview:bg-white/12 group-hover/preview:backdrop-blur-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 truncate text-sm font-semibold drop-shadow-sm">
          {previewItem.label}
        </p>
        <button
          type="button"
          onClick={() => setPreviewItem(null)}
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
        {previewItem.mediaType === "video" ? (
          <video
            key={previewItem.playbackUrl}
            src={previewItem.playbackUrl}
            className="max-h-[min(82vh,calc(100vh-5rem))] w-full rounded-xl object-contain shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-white/15"
            controls
            autoPlay
            loop
            playsInline
          />
        ) : (
          <img
            src={previewItem.playbackUrl}
            alt={previewItem.label}
            className="max-h-[min(82vh,calc(100vh-5rem))] max-w-full rounded-xl object-contain shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-white/15"
          />
        )}
      </div>
    </div>
  ) : null;

  if (layout === "page") {
    return (
      <>
      <div className="flex h-full min-h-0 w-full bg-slate-50/80 px-0 py-1.5">
          {card}
        </div>
        {previewOverlay}
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
        {card}
      </div>
      {previewOverlay}
    </>
  );
}
