"use client";

import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

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
  const searchParams = useSearchParams();
  const project = searchParams.get("project");

  if (!project?.trim()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">Missing project in the URL.</p>
        <a
          href="/"
          className="text-sm font-semibold text-violet-600 hover:underline"
        >
          Back to projects
        </a>
      </div>
    );
  }

  return <VideoEditorDynamic projectId={project.trim()} />;
}
