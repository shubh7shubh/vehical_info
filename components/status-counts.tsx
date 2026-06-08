import Link from "next/link";
import type { LoanColor } from "@/lib/loan-status";

/**
 * Shared visual language for the 4 reminder buckets (pure months-behind:
 * 0 -> green, 1..2 -> yellow, 3 -> orange, >3 -> red). Uses Tailwind's default
 * palette so the four states stay clearly distinct.
 */
export const STATUS_META: Record<
  LoanColor,
  { label: string; dot: string; badge: string }
> = {
  green: {
    label: "On time",
    dot: "bg-green-500",
    badge: "bg-green-100 text-green-700",
  },
  yellow: {
    label: "1–2 behind",
    dot: "bg-yellow-400",
    badge: "bg-yellow-100 text-yellow-800",
  },
  orange: {
    label: "3 behind",
    dot: "bg-orange-500",
    badge: "bg-orange-100 text-orange-700",
  },
  red: {
    label: "3+ behind",
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-700",
  },
};

const ORDER: LoanColor[] = ["green", "yellow", "orange", "red"];

/** A single reminder badge with a colored dot, used on customer cards. */
export function StatusBadge({ color }: { color: LoanColor }) {
  const m = STATUS_META[color];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${m.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

/**
 * The 4 colored count pills shown in the header. Each links to the customers
 * list filtered to that bucket. Counts are already branch-scoped by the RPC.
 */
export function StatusCounts({
  counts,
  className = "",
}: {
  counts: Record<LoanColor, number>;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {ORDER.map((c) => {
        const m = STATUS_META[c];
        return (
          <Link
            key={c}
            href={`/dashboard/customers?status=${c}`}
            title={`${m.label} — ${counts[c]}`}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${m.badge}`}
          >
            <span className={`h-2 w-2 rounded-full ${m.dot}`} />
            {counts[c]}
          </Link>
        );
      })}
    </div>
  );
}
