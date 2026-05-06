import Link from "next/link";

const headerStats = [
  { label: "Today", value: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) },
  { label: "Installments collected", value: "—" },
  { label: "Penalty applied", value: "—" },
  { label: "Receipts", value: "—" },
  { label: "Pending signatures", value: "—" },
];

const tiles = [
  {
    href: "/dashboard/pending",
    title: "Pending Customers",
    desc: "Filter by 0 / 1 / 3 / 5 / Below 3 / Above 5 overdue installments",
    accent: "bg-bank-a-soft text-bank-a",
  },
  {
    href: "/dashboard/recovery",
    title: "Bank Recovery",
    desc: "Two color-coded recovery lists, one per partner bank",
    accent: "bg-bank-b-soft text-bank-b",
  },
  {
    href: "/dashboard/summary",
    title: "Daily Summary",
    desc: "Cash + online collections, UTRs, penalties, totals",
    accent: "bg-muted text-foreground",
  },
  {
    href: "/dashboard/customers",
    title: "Total Customers",
    desc: "~5,000 active accounts · Add new · Closing customers",
    accent: "bg-muted text-foreground",
  },
];

export default function DashboardHome() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-background p-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {headerStats.map((stat) => (
            <div key={stat.label}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </div>
              <div className="mt-1 text-lg font-semibold">{stat.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quick access
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="group flex flex-col gap-2 rounded-2xl border border-border bg-background p-5 transition hover:border-primary/30 hover:shadow-sm"
            >
              <div
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold ${tile.accent}`}
              >
                →
              </div>
              <div className="font-semibold">{tile.title}</div>
              <div className="text-xs leading-relaxed text-muted-foreground">
                {tile.desc}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        <strong className="text-foreground">Phase 1 preview.</strong> This is a
        UI skeleton. Auth, search, customer cards, penalty engine, and bank
        recovery lists land in Phases 2–7. See <code>docs/PROJECT_REPORT.md</code>{" "}
        for the build schedule.
      </section>
    </div>
  );
}
