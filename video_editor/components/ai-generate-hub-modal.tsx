"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Loader2,
  MessageSquare,
  Mic2,
  Send,
  Sparkles,
  Type,
  Wand2,
  X,
} from "lucide-react";

export type AiHubTab = "audio" | "video" | "text";

type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type Props = {
  /** `modal` = centered overlay (legacy). `inline` = embedded editor page (no backdrop). */
  layout?: "modal" | "inline";
  isOpen: boolean;
  onClose?: () => void;
  initialTab: AiHubTab;
  onVideoGenerated: (videoUrl: string) => void;
  onAudioGenerated: (audioUrl: string, label: string, durationSec?: number) => void;
  /** Applies generated copy to the selected text layer or adds a new one */
  onTextApply: (text: string) => void;
};

type VideoProvider = "replicate" | "veo";

const VOCAL_OPTIONS = [
  {
    id: "instrumental",
    label: "Instrumental",
    sub: "Music only",
    instrumental: true as const,
    gender: undefined as "m" | "f" | undefined,
  },
  {
    id: "male",
    label: "Male vocal",
    sub: "Sung / rap",
    instrumental: false as const,
    gender: "m" as const,
  },
  {
    id: "female",
    label: "Female vocal",
    sub: "Sung / rap",
    instrumental: false as const,
    gender: "f" as const,
  },
  {
    id: "any",
    label: "Vocals (auto)",
    sub: "Let Suno choose",
    instrumental: false as const,
    gender: undefined,
  },
];

const MUSIC_GENRES = [
  "Pop",
  "Rock",
  "Electronic",
  "Hip-hop",
  "R&B / Soul",
  "Jazz",
  "Classical",
  "Ambient",
  "Cinematic",
  "Indie",
  "Latin",
  "K-pop",
  "Metal",
  "Funk",
  "Country",
];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function AiGenerateHubModal({
  layout = "modal",
  isOpen,
  onClose,
  initialTab,
  onVideoGenerated,
  onAudioGenerated,
  onTextApply,
}: Props) {
  const [tab, setTab] = useState<AiHubTab>(initialTab);
  const [videoProvider, setVideoProvider] = useState<VideoProvider>("replicate");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<null | "expand" | "generate">(null);
  const [error, setError] = useState<string | null>(null);

  const [audioMessages, setAudioMessages] = useState<ChatMsg[]>([]);
  const [videoMessages, setVideoMessages] = useState<ChatMsg[]>([]);
  const [textMessages, setTextMessages] = useState<ChatMsg[]>([]);

  const [vocalId, setVocalId] = useState<string>("instrumental");
  const [musicGenre, setMusicGenre] = useState(MUSIC_GENRES[0]);
  const [styleExtra, setStyleExtra] = useState("");
  const [songTitle, setSongTitle] = useState("My track");
  const [songMode, setSongMode] = useState<"simple" | "custom">("custom");

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setError(null);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [audioMessages, videoMessages, textMessages, tab, isOpen]);

  const seededRef = useRef({ audio: false, video: false, text: false });

  useEffect(() => {
    if (!isOpen && layout === "modal") {
      seededRef.current = { audio: false, video: false, text: false };
      setAudioMessages([]);
      setVideoMessages([]);
      setTextMessages([]);
      return;
    }
    if (!isOpen) {
      return;
    }
    if (tab === "audio" && !seededRef.current.audio) {
      seededRef.current.audio = true;
      setAudioMessages([]);
    }
    if (tab === "video" && !seededRef.current.video) {
      seededRef.current.video = true;
      setVideoMessages([]);
    }
    if (tab === "text" && !seededRef.current.text) {
      seededRef.current.text = true;
      setTextMessages([]);
    }
  }, [isOpen, tab, layout]);

  const append = (
    setter: React.Dispatch<React.SetStateAction<ChatMsg[]>>,
    msg: ChatMsg
  ) => setter((prev) => [...prev, msg]);

  const intentForTab = (): "lyrics" | "video_scene" | "text_overlay" => {
    if (tab === "video") return "video_scene";
    if (tab === "text") return "text_overlay";
    return "lyrics";
  };

  const handleExpandPrompt = async () => {
    const trimmed = input.trim();
    if (!trimmed || busy) return;

    setBusy("expand");
    setError(null);
    append(
      tab === "audio"
        ? setAudioMessages
        : tab === "video"
          ? setVideoMessages
          : setTextMessages,
      {
        id: uid(),
        role: "user",
        content:
          trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed,
      }
    );

    try {
      const res = await fetch("/api/ai/prompt-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, intent: intentForTab() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
      if (!data.text) throw new Error("No expanded text");
      setInput(data.text as string);
      append(
        tab === "audio"
          ? setAudioMessages
          : tab === "video"
            ? setVideoMessages
            : setTextMessages,
        {
          id: uid(),
          role: "assistant",
          content:
            (data.text as string).length > 1200
              ? `${(data.text as string).slice(0, 1200)}…\n\n(Full prompt is in the text box — scroll or edit there.)`
              : (data.text as string),
        }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Expand failed";
      setError(msg);
      append(
        tab === "audio"
          ? setAudioMessages
          : tab === "video"
            ? setVideoMessages
            : setTextMessages,
        { id: uid(), role: "assistant", content: `Error: ${msg}` }
      );
    } finally {
      setBusy(null);
    }
  };

  const handleAudioSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    const vocal = VOCAL_OPTIONS.find((v) => v.id === vocalId) ?? VOCAL_OPTIONS[0];

    setBusy("generate");
    setError(null);

    try {
      if (songMode === "simple") {
        const res = await fetch("/api/ai/suno", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customMode: false,
            instrumental: vocal.instrumental,
            prompt: trimmed.slice(0, 500),
            ...(vocal.gender ? { vocalGender: vocal.gender } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
        if (!data.audioUrl) throw new Error("No audio URL");
        onAudioGenerated(
          data.audioUrl,
          trimmed.slice(0, 40) + (trimmed.length > 40 ? "…" : ""),
          data.durationSec
        );
        append(setAudioMessages, {
          id: uid(),
          role: "assistant",
          content: `Audio ready (simple mode, first 500 chars). On timeline.`,
        });
      } else {
        const styleBase = musicGenre + (styleExtra.trim() ? `. ${styleExtra.trim()}` : "");
        const style = styleBase.slice(0, 1000);
        const title = songTitle.trim().slice(0, 100) || "Untitled";
        const lyrics = vocal.instrumental ? "" : trimmed;

        if (!vocal.instrumental && !lyrics) {
          throw new Error("With vocals on, add lyrics in the box (expand or paste).");
        }

        const body: Record<string, unknown> = {
          customMode: true,
          instrumental: vocal.instrumental,
          style,
          title,
          model: "V4_5ALL",
        };
        if (!vocal.instrumental) body.prompt = lyrics.slice(0, 5000);
        if (vocal.gender) body.vocalGender = vocal.gender;

        const res = await fetch("/api/ai/suno", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
        if (!data.audioUrl) throw new Error("No audio URL");
        onAudioGenerated(data.audioUrl, title, data.durationSec);
        append(setAudioMessages, {
          id: uid(),
          role: "assistant",
          content: `“${title}” on timeline — ${musicGenre}${vocal.instrumental ? ", instrumental" : ", vocals"}.`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      setError(msg);
      append(setAudioMessages, {
        id: uid(),
        role: "assistant",
        content: `Error: ${msg}`,
      });
    } finally {
      setBusy(null);
    }
  };

  const handleVideoSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || busy) return;

    setBusy("generate");
    setError(null);

    try {
      if (videoProvider === "replicate") {
        const res = await fetch("/api/generate-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmed.slice(0, 4000) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
        if (!data.videoUrl) throw new Error("No video URL");
        onVideoGenerated(data.videoUrl);
      } else {
        const res = await fetch("/api/ai/veo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmed.slice(0, 4000) }),
        });
        const data = await res.json();
        if (!res.ok) {
          const extra =
            data?.gcsUri != null
              ? ` Output: ${data.gcsUri}. ${data.hint || ""}`
              : "";
          throw new Error((data?.error || `Veo failed (${res.status})`) + extra);
        }
        if (!data.videoUrl) throw new Error("No video URL from Veo");
        onVideoGenerated(data.videoUrl);
      }
      append(setVideoMessages, {
        id: uid(),
        role: "assistant",
        content: `Video clip at playhead (${videoProvider}).`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      setError(msg);
      append(setVideoMessages, {
        id: uid(),
        role: "assistant",
        content: `Error: ${msg}`,
      });
    } finally {
      setBusy(null);
    }
  };

  const applyTextFromBox = () => {
    const t = input.trim();
    if (t) onTextApply(t);
  };

  if (!isOpen) return null;

  const messages =
    tab === "audio" ? audioMessages : tab === "video" ? videoMessages : textMessages;

  const shellClassName =
    layout === "inline"
      ? "flex h-full min-h-[min(560px,70vh)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      : "flex h-[min(640px,90vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl";

  const card = (
    <div className={shellClassName}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MessageSquare className="h-5 w-5 shrink-0 text-slate-700" />
            <h2 className="truncate text-base font-semibold text-slate-900">
              AI studio
            </h2>
          </div>
          {layout === "modal" && onClose ? (
            <button
              type="button"
              onClick={onClose}
              disabled={busy !== null}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        <div className="flex border-b border-slate-200 px-2 pt-2">
          {(
            [
              ["audio", "Music", Mic2],
              ["video", "Video", Sparkles],
              ["text", "Text", Type],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setTab(id);
                setError(null);
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-t-lg px-3 py-2.5 text-sm font-medium transition disabled:opacity-40 ${
                tab === id
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-slate-900 text-white"
                    : m.role === "system"
                      ? "border border-slate-200 bg-white text-slate-600"
                      : "border border-slate-200 bg-white text-slate-800"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 bg-white p-4">
          {tab === "audio" && (
            <div className="mb-3 space-y-3">
              <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setSongMode("simple")}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium disabled:opacity-40 ${
                    songMode === "simple"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600"
                  }`}
                >
                  Simple
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setSongMode("custom")}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium disabled:opacity-40 ${
                    songMode === "custom"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600"
                  }`}
                >
                  Custom (genre + title)
                </button>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Vocal type
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {VOCAL_OPTIONS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setVocalId(v.id)}
                      className={`rounded-lg border px-2 py-2 text-left text-xs transition disabled:opacity-40 ${
                        vocalId === v.id
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <span className="block font-semibold">{v.label}</span>
                      <span
                        className={
                          vocalId === v.id ? "text-slate-300" : "text-slate-500"
                        }
                      >
                        {v.sub}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {songMode === "custom" && (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-600">
                      Music type / genre
                      <select
                        value={musicGenre}
                        onChange={(e) => setMusicGenre(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                      >
                        {MUSIC_GENRES.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-slate-600">
                      Track title
                      <input
                        type="text"
                        value={songTitle}
                        onChange={(e) => setSongTitle(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                        placeholder="Song title"
                      />
                    </label>
                  </div>
                  <label className="block text-xs font-medium text-slate-600">
                    Style details (optional)
                    <input
                      type="text"
                      value={styleExtra}
                      onChange={(e) => setStyleExtra(e.target.value)}
                      placeholder="e.g. 90 BPM, dreamy pads, lo-fi drums"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    />
                  </label>
                </>
              )}
            </div>
          )}

          {tab === "video" && (
            <div className="mb-3 flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setVideoProvider("replicate")}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-40 ${
                  videoProvider === "replicate"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                Replicate
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setVideoProvider("veo")}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-40 ${
                  videoProvider === "veo"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                Google Veo
              </button>
            </div>
          )}

          {error && (
            <div className="mb-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <label className="sr-only" htmlFor="ai-hub-input">
            Prompt
          </label>
          <textarea
            id="ai-hub-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy !== null}
            placeholder={
              tab === "audio"
                ? songMode === "simple"
                  ? "Describe your track or paste lyrics…"
                  : VOCAL_OPTIONS.find((v) => v.id === vocalId)?.instrumental
                    ? "Optional mood notes (genre and title are set above)"
                    : "Idea or draft lyrics…"
                : tab === "video"
                  ? "Describe the scene, lighting, motion…"
                  : "Headline or lines for the canvas…"
            }
            rows={3}
            className="mb-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy !== null || !input.trim()}
                onClick={() => void handleExpandPrompt()}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
              >
                {busy === "expand" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Expanding…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Expand prompt
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={busy !== null || !input.trim()}
                onClick={() => {
                  if (tab === "audio") void handleAudioSend();
                  else if (tab === "video") void handleVideoSend();
                  else applyTextFromBox();
                }}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
              >
                {busy === "generate" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : tab === "text" ? (
                  <>
                    <Type className="h-4 w-4" />
                    Apply to text layer
                  </>
                ) : tab === "audio" ? (
                  <>
                    <Send className="h-4 w-4" />
                    Generate music
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Generate video
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
  );

  if (layout === "inline") {
    return (
      <div className="flex h-full min-h-0 w-full justify-center">
        {card}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      {card}
    </div>
  );
}
