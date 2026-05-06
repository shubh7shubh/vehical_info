import Link from "next/link";
import { Construction, ArrowLeft } from "lucide-react";

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
          <Construction size={26} />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Coming soon</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This section is part of the upcoming release. We're building it out
          over the next few days — customer management, smart search, payments,
          penalty tracking, bank recovery lists, daily summaries, and more.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover"
          >
            <ArrowLeft size={14} /> Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
