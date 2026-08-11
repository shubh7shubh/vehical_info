import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  Banknote,
  Gavel,
  IndianRupee,
  Receipt,
  Users,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CustomerSearch } from "@/components/customer-search";
import { LedgerCustomerForm } from "@/components/ledger-customer-form";

type Bank = { id: string; name: string };

const headerStats = [
  {
    label: "Today",
    value: new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    }),
  },
  { label: "Installments collected", value: "—" },
  { label: "Penalty applied", value: "—" },
  { label: "Receipts", value: "—" },
  { label: "Pending signatures", value: "—" },
];

const tiles = [
  {
    href: "/dashboard/customers",
    title: "Record EMI Payment",
    desc: "Search the customer, then record the installment they came to pay",
    Icon: IndianRupee,
    accent: "bg-success-soft text-success",
  },
  {
    href: "/dashboard/pending",
    title: "Pending Customers",
    desc: "Filter by 0 / 1 / 3 / 5 / Below 3 / Above 5 overdue installments",
    Icon: AlertCircle,
    accent: "bg-warning-soft text-warning",
  },
  {
    href: "/dashboard/foreclosure",
    title: "Foreclosure & Seizing",
    desc: "Close a loan early, or record and release a seized vehicle",
    Icon: Gavel,
    accent: "bg-danger-soft text-danger",
  },
  {
    href: "/dashboard/recovery",
    title: "Bank Recovery",
    desc: "Two color-coded recovery lists, one per partner bank",
    Icon: Banknote,
    accent: "bg-bank-a-soft text-bank-a",
  },
  {
    href: "/dashboard/summary",
    title: "Daily Summary",
    desc: "Cash + online collections, UTRs, penalties, totals",
    Icon: Receipt,
    accent: "bg-success-soft text-success",
  },
  {
    href: "/dashboard/customers",
    title: "Total Customers",
    desc: "~5,000 active accounts · Add new · Closing customers",
    Icon: Users,
    accent: "bg-accent-soft text-accent",
  },
];

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { ok, error } = await searchParams;

  if (user.role === "owner") {
    redirect("/dashboard/owner");
  }

  if (user.role === "sub_id") {
    const supabase = await createSupabaseServerClient();
    const { data: banks } = await supabase
      .from("banks")
      .select("id, name")
      .order("name")
      .returns<Bank[]>();

    // Sub-IDs can read their own customers (RLS), so this count is their live
    // progress against the assigned range.
    const { count } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("created_by", user.id)
      .is("deleted_at", null);

    const range = user.subIdRange;
    const rangeSize = range ? range.end - range.start + 1 : null;
    const entered = count ?? 0;
    const remaining = rangeSize != null ? Math.max(rangeSize - entered, 0) : null;
    const today = new Date().toISOString().slice(0, 10);

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Bulk Customer Entry</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as <strong>{user.email}</strong>. Add customer records from
            the loan book — one per entry.
          </p>
          {range ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <div className="inline-flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-1.5">
                <span className="text-muted-foreground">Range</span>
                <span className="font-semibold text-accent">
                  {range.start} – {range.end}
                </span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-1.5">
                <span className="text-muted-foreground">Entered</span>
                <span className="font-semibold text-foreground">
                  {entered}
                  {rangeSize != null ? ` / ${rangeSize}` : ""}
                </span>
              </div>
              {remaining != null ? (
                <div className="inline-flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-1.5">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="font-semibold text-foreground">
                    {remaining}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-warning">
              No range assigned yet. Ask your admin to assign one before entering
              records.
            </p>
          )}
        </div>

        {ok ? (
          <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>{decodeURIComponent(ok)}</span>
          </div>
        ) : null}

        {range ? (
          <LedgerCustomerForm
            banks={banks ?? []}
            today={today}
            error={error}
            submitLabel="Add customer"
          />
        ) : null}
      </div>
    );
  }

  const displayName = user.email.split("@")[0];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold tracking-tight">
            Welcome, {displayName}
          </h1>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            {user.role}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-5">
          {headerStats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5"
            >
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </div>
              <div className="mt-1 text-base font-semibold text-foreground">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Find a customer
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Search by name, account number, mobile, RC or engine number — then open
          the customer to record the EMI they came to pay.
        </p>
        <CustomerSearch />
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Quick access
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map(({ href, title, desc, Icon, accent }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:border-accent/40 hover:shadow-md"
            >
              <div
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}
              >
                <Icon size={18} />
              </div>
              <div>
                <div className="font-semibold text-foreground">{title}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {desc}
                </div>
              </div>
              <div className="mt-auto flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition group-hover:opacity-100">
                Open <ChevronRight size={14} />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
