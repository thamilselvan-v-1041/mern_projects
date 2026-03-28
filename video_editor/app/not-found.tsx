import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white text-slate-800">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-slate-600">The page you requested does not exist.</p>
      <Link
        href="/"
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Back to editor
      </Link>
    </div>
  );
}
