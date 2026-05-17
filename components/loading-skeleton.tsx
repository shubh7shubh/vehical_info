import { cn } from "@/lib/utils";

/** A single shimmer block. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-surface-muted", className)} />
  );
}

/**
 * Generic page skeleton — a header card with stat tiles followed by a card
 * grid. Rendered instantly by `loading.tsx` while a server page fetches data,
 * so navigation always gives immediate feedback.
 */
export function PageSkeleton({
  tiles = 4,
  cards = 6,
}: {
  tiles?: number;
  cards?: number;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-2 h-3.5 w-64 max-w-full" />
        {tiles > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: tiles }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton for table-heavy pages (user lists, customer lists). */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-3.5 w-72 max-w-full" />
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b border-border px-4 py-4 last:border-0"
          >
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
