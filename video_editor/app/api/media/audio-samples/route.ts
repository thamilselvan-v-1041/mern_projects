import { NextRequest, NextResponse } from "next/server";

/**
 * Audio sample search proxy (iTunes Search API).
 * Returns preview clips and caps durations to 2 minutes.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "trending";
  const limit = Math.min(
    40,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 24)),
  );

  const url = `https://itunes.apple.com/search?media=music&term=${encodeURIComponent(
    q,
  )}&limit=${limit}`;

  try {
    const res = await fetch(url);
    const data = (await res.json().catch(() => ({}))) as {
      results?: Array<{
        trackId?: number;
        trackName?: string;
        artistName?: string;
        previewUrl?: string;
        artworkUrl100?: string;
        artworkUrl60?: string;
        trackTimeMillis?: number;
      }>;
    };

    if (!res.ok) {
      return NextResponse.json(
        { error: `Audio sample source failed (${res.status})`, results: [] },
        { status: 502 },
      );
    }

    const raw = Array.isArray(data.results) ? data.results : [];
    const results = raw
      .map((item) => {
        if (!item.previewUrl) return null;
        const durationSec = Math.min(
          120,
          Math.max(
            1,
            Number.isFinite(item.trackTimeMillis)
              ? Math.round((item.trackTimeMillis as number) / 1000)
              : 30,
          ),
        );
        const trackName = (item.trackName || "Audio sample").slice(0, 80);
        const artistName = (item.artistName || "").trim().slice(0, 80);
        return {
          id: String(item.trackId ?? `${item.previewUrl}`),
          label: trackName,
          author: artistName,
          previewUrl: item.artworkUrl100 || item.artworkUrl60 || "",
          playbackUrl: item.previewUrl,
          durationSec,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "audio_samples_fetch_failed",
        results: [],
      },
      { status: 500 },
    );
  }
}
