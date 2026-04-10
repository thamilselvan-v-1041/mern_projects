"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveV2PlaybackSource } from "@/lib/editor-v2/playback-source";
import { createEmptyProjectInStorage } from "@/lib/video-project-storage";
import VideoEditorV2Dynamic from "@/components/video-editor-v2-dynamic";

export default function EditorV2RouteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const project = searchParams.get("project");
  const source = resolveV2PlaybackSource({
    explicitSource: searchParams.get("src"),
  });

  useEffect(() => {
    if (project?.trim()) return;
    const createdId = createEmptyProjectInStorage();
    const next = new URLSearchParams(searchParams.toString());
    next.set("project", createdId);
    router.replace(`/editor-v2?${next.toString()}`);
  }, [project, router, searchParams]);

  if (!project?.trim()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">Opening a new project...</p>
      </div>
    );
  }

  return (
    <div>
      <VideoEditorV2Dynamic
        projectId={project.trim()}
        playbackSourceUrl={source.url ?? undefined}
      />
      {source.reason ? (
        <div className="fixed bottom-3 right-3 rounded-md border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
          {source.reason}
        </div>
      ) : null}
    </div>
  );
}
