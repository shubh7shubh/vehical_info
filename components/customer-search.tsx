import { Search } from "lucide-react";

/**
 * Smart-search bar. Plain GET form — submits to the customers page, which runs
 * the branch-scoped `search_customers` RPC. No client JS needed.
 */
export function CustomerSearch({
  defaultValue = "",
  autoFocus = false,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  return (
    <form action="/dashboard/customers" method="get" className="flex gap-2">
      <div className="relative flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          name="q"
          defaultValue={defaultValue}
          autoFocus={autoFocus}
          placeholder="Search name, RC, engine, mobile or Aadhaar"
          aria-label="Search customers"
          className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:text-sm"
        />
      </div>
      <button
        type="submit"
        className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        Search
      </button>
    </form>
  );
}
