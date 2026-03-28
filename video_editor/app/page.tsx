import dynamic from "next/dynamic";

const ReactVideoEditor = dynamic(
  () => import("@/components/react-video-editor"),
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

export default function Home() {
  return (
    <main className="min-h-screen w-full bg-white">
      <ReactVideoEditor />
    </main>
  );
}
