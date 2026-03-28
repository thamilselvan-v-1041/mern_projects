import { Suspense } from "react";
import EditorRouteClient from "./editor-route-client";

export default function EditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white text-slate-600">
          <p className="text-sm font-medium">Opening editor…</p>
        </div>
      }
    >
      <EditorRouteClient />
    </Suspense>
  );
}
