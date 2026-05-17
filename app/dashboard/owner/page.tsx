import Link from "next/link";
import { Building2, Users, Receipt, ChevronRight } from "lucide-react";
import { requireOwner } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type BranchStat = {
  branch_id: string;
  branch_name: string;
  branch_code: string | null;
  city: string | null;
  deleted_at: string | null;
  admin_count: number;
  employee_count: number;
  sub_id_count: number;
  customer_count: number;
  active_loan_count: number;
};

export default async function OwnerDashboard() {
  const user = await requireOwner();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("owner_branch_stats");
  const branches = ((data as BranchStat[] | null) ?? []).filter(
    (b) => !b.deleted_at,
  );

  const totals = branches.reduce(
    (acc, b) => ({
      customers: acc.customers + Number(b.customer_count),
      loans: acc.loans + Number(b.active_loan_count),
      staff:
        acc.staff +
        Number(b.admin_count) +
        Number(b.employee_count) +
        Number(b.sub_id_count),
    }),
    { customers: 0, loans: 0, staff: 0 },
  );

  const summary = [
    { label: "Branches", value: branches.length, Icon: Building2 },
    { label: "Customers", value: totals.customers, Icon: Users },
    { label: "Active loans", value: totals.loans, Icon: Receipt },
    { label: "Staff", value: totals.staff, Icon: Users },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold tracking-tight">
            Owner Overview
          </h1>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            owner
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as <strong className="text-foreground">{user.email}</strong>
          . Live totals across every branch.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          {summary.map(({ label, value, Icon }) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <Icon size={12} /> {label}
              </div>
              <div className="mt-1 text-xl font-semibold text-foreground">
                {value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Branches
          </h2>
          <Link
            href="/dashboard/owner/branches"
            className="text-xs font-medium text-accent hover:underline"
          >
            Manage branches
          </Link>
        </div>

        {error ? (
          <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
            Could not load branch stats: {error.message}
          </div>
        ) : branches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No branches yet.
            </p>
            <Link
              href="/dashboard/owner/branches"
              className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              Create your first branch
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => (
              <Link
                key={b.branch_id}
                href={`/dashboard/owner/branches/${b.branch_id}`}
                className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:border-accent/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-foreground">
                      {b.branch_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[b.branch_code, b.city].filter(Boolean).join(" · ") ||
                        "—"}
                    </div>
                  </div>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Building2 size={16} />
                  </span>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { k: "Customers", v: b.customer_count },
                    { k: "Loans", v: b.active_loan_count },
                    {
                      k: "Staff",
                      v:
                        Number(b.admin_count) +
                        Number(b.employee_count) +
                        Number(b.sub_id_count),
                    },
                  ].map(({ k, v }) => (
                    <div
                      key={k}
                      className="rounded-lg border border-border bg-surface-muted py-1.5"
                    >
                      <dt className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                        {k}
                      </dt>
                      <dd className="text-sm font-semibold text-foreground">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-auto flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition group-hover:opacity-100">
                  Open branch <ChevronRight size={14} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
