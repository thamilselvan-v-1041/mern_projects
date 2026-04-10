import { Suspense } from "react";
import EditorV2RouteClient from "./editor-route-client";

export default function EditorV2Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white text-slate-600">
          <p className="text-sm font-medium">Opening editor v2…</p>
        </div>
      }
    >
      <EditorV2RouteClient />
    </Suspense>
  );
}
