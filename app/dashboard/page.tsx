import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";

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

export default async function DashboardHome() {
  const user = await requireUser();

  if (user.role === "sub_id") {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-background p-6">
          <h1 className="text-lg font-semibold">Bulk Customer Entry</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as <strong>{user.email}</strong>. You can add customer
            records within your assigned range only.
          </p>
          {user.subIdRange ? (
            <p className="mt-3 text-sm">
              Range: <strong>{user.subIdRange.start}</strong> –{" "}
              <strong>{user.subIdRange.end}</strong>
            </p>
          ) : (
            <p className="mt-3 text-sm text-warning">
              No range assigned yet. Ask your admin to assign one before
              entering records.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-background p-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold">
            Welcome, {user.email.split("@")[0]}
          </h1>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {user.role}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-5">
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

    </div>
  );
}
