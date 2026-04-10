"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { createEmptyProjectInStorage } from "@/lib/video-project-storage";

const VideoEditorDynamic = dynamic(
  () => import("@/components/video-editor-dynamic"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-white text-slate-600">
        <div className="rounded-xl border border-slate-200 bg-white px-8 py-10 text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-pulse rounded-lg bg-slate-200" />
          <p className="text-sm font-medium text-slate-600">Loading editor…</p>
        </div>
      </div>
    ),
  }
);

export default function EditorRouteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const project = searchParams.get("project");

  useEffect(() => {
    if (project?.trim()) return;
    const createdId = createEmptyProjectInStorage();
    const next = new URLSearchParams(searchParams.toString());
    next.set("project", createdId);
    router.replace(`/editor?${next.toString()}`);
  }, [project, router, searchParams]);

  if (!project?.trim()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">Opening a new project...</p>
      </div>
    );
  }

  return <VideoEditorDynamic projectId={project.trim()} />;
}
