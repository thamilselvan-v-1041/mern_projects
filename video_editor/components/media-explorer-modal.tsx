"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  Image as ImageIcon,
  Loader2,
  Search,
  Smile,
  X,
} from "lucide-react";

export type MediaExplorerResult = {
  id: string;
  label: string;
  previewUrl: string;
  playbackUrl: string;
  mediaType: "video" | "image";
};

type Tab = "giphy" | "pexels";

type Props = {
  /** `modal` = overlay. `page` = embedded editor view (no backdrop). */
  layout?: "modal" | "page";
  isOpen: boolean;
  onClose?: () => void;
  onBackToPreview?: () => void;
  onPick: (src: string, opts: { label: string; mediaType: "video" | "image" }) => void;
};

export function MediaExplorerModal({
  layout = "modal",
  isOpen,
  onClose,
  onBackToPreview,
  onPick,
}: Props) {
  const [tab, setTab] = useState<Tab>("giphy");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaExplorerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGiphy = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/media/giphy?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Request failed (${res.status})`);
        setResults([]);
        return;
      }
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setError("Network error");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPexels = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: q.trim() || "nature",
      });
      const res = await fetch(`/api/media/pexels?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Request failed (${res.status})`);
        setResults([]);
        return;
      }
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setError("Network error");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (tab === "giphy") void fetchGiphy(query);
    else void fetchPexels(query);
  }, [isOpen, tab]); // eslint-disable-line react-hooks/exhaustive-deps -- load on open / tab switch only

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "giphy") void fetchGiphy(query);
    else void fetchPexels(query);
  };

  if (!isOpen) return null;

  const shellClass =
    layout === "page"
      ? "flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      : "flex max-h-[min(640px,88vh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl";

  const card = (
    <div className={shellClass}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {layout === "page" && onBackToPreview ? (
              <button
                type="button"
                onClick={onBackToPreview}
                className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Preview
              </button>
            ) : null}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">
                GIF &amp; image explorer
              </h2>
              <p className="text-xs text-slate-500">
                Adds a separate layer at the playhead (stacks above base video).
              </p>
            </div>
          </div>
          {layout === "modal" && onClose ? (
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

        <div className="flex border-b border-slate-200 px-2 pt-2">
          <button
            type="button"
            onClick={() => setTab("giphy")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-t-lg px-3 py-2.5 text-sm font-medium ${
              tab === "giphy"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Smile className="h-4 w-4" />
            Giphy
          </button>
          <button
            type="button"
            onClick={() => setTab("pexels")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-t-lg px-3 py-2.5 text-sm font-medium ${
              tab === "pexels"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            Photos
          </button>
        </div>

        <form
          onSubmit={handleSearch}
          className="flex gap-2 border-b border-slate-100 p-3"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === "giphy"
                  ? "Search GIFs (empty = trending)"
                  : "Search photos (e.g. ocean, city)"
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            Search
          </button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {results.map((r) => (
                <button
                  key={`${tab}-${r.id}`}
                  type="button"
                  onClick={() =>
                    onPick(r.playbackUrl, {
                      label: r.label,
                      mediaType: r.mediaType,
                    })
                  }
                  className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-left shadow-sm transition hover:border-violet-400 hover:ring-2 hover:ring-violet-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN thumbnails */}
                  <img
                    src={r.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-2 text-[10px] font-medium leading-tight text-white opacity-0 transition group-hover:opacity-100">
                    {r.label}
                  </span>
                  <span className="absolute right-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    {r.mediaType === "video" ? "GIF" : "IMG"}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!loading && results.length === 0 && !error ? (
            <p className="py-12 text-center text-sm text-slate-500">
              No results. Try another search or check API keys in{" "}
              <code className="rounded bg-slate-100 px-1">.env.local</code>.
            </p>
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-400">
          Giphy and Pexels require API keys on the server. GIFs use MP4 when
          available for smoother playback.
        </div>
      </div>
  );

  if (layout === "page") {
    return (
      <div className="flex h-full min-h-0 w-full justify-center bg-slate-50/80 px-4 py-5">
        {card}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      {card}
    </div>
  );
}
