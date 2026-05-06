import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function GlobalNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-accent-soft px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-md">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Compass size={26} />
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          404 — Not found
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or hasn't been built yet.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover"
          >
            <Home size={14} /> Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
