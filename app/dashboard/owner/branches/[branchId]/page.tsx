import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { requireOwner } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type BranchStat = {
  branch_id: string;
  customer_count: number;
  active_loan_count: number;
  admin_count: number;
  employee_count: number;
  sub_id_count: number;
};

type StaffRow = {
  email: string;
  role: string;
  disabled_at: string | null;
};

type AuditRow = {
  action: string;
  table_name: string;
  at: string;
};

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  await requireOwner();
  const { branchId } = await params;

  const supabase = await createSupabaseServerClient();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, code, city, address, phone, deleted_at")
    .eq("id", branchId)
    .single();
  if (!branch) notFound();

  const { data: statsData } = await supabase.rpc("owner_branch_stats");
  const stat = ((statsData as BranchStat[] | null) ?? []).find(
    (s) => s.branch_id === branchId,
  );

  const { data: staffData } = await supabase
    .from("users")
    .select("email, role, disabled_at")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: true })
    .returns<StaffRow[]>();

  const { data: auditData } = await supabase
    .from("audit_log")
    .select("action, table_name, at")
    .eq("branch_id", branchId)
    .order("at", { ascending: false })
    .limit(15)
    .returns<AuditRow[]>();

  const tiles = [
    { label: "Customers", value: stat?.customer_count ?? 0 },
    { label: "Active loans", value: stat?.active_loan_count ?? 0 },
    { label: "Admins", value: stat?.admin_count ?? 0 },
    { label: "Employees", value: stat?.employee_count ?? 0 },
    { label: "Sub-IDs", value: stat?.sub_id_count ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/owner"
        className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        <ArrowLeft size={14} /> All branches
      </Link>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Building2 size={18} />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {branch.name}
              {branch.deleted_at ? (
                <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-danger">
                  Archived
                </span>
              ) : null}
            </h1>
            <p className="text-xs text-muted-foreground">
              {[branch.code, branch.city].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Read-only view. Day-to-day records are managed by this branch&apos;s
          own admin and staff.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5"
            >
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t.label}
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {t.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Staff</h2>
        {(staffData ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No staff yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {(staffData ?? []).map((s) => (
              <li
                key={s.email}
                className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-foreground"
              >
                {s.email}
                <span className="ml-1 uppercase text-muted-foreground">
                  {s.role}
                </span>
                {s.disabled_at ? (
                  <span className="ml-1 text-danger">(disabled)</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">
          Recent activity
        </h2>
        {(auditData ?? []).length === 0 ? (
          <p className="px-5 py-4 text-xs text-muted-foreground">
            No recorded activity yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">Action</th>
                  <th className="px-5 py-2.5 text-left">Table</th>
                  <th className="px-5 py-2.5 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {(auditData ?? []).map((a, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-5 py-2.5 font-medium text-foreground">
                      {a.action}
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">
                      {a.table_name}
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">
                      {new Date(a.at).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
