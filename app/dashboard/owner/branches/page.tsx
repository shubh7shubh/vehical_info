import { CheckCircle2, AlertTriangle, Building2 } from "lucide-react";
import { requireOwner } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SubmitButton } from "@/components/submit-button";
import {
  createBranchAction,
  createBranchAdminAction,
  toggleBranchArchivedAction,
} from "./actions";

type BranchRow = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  deleted_at: string | null;
  created_at: string;
};

type AdminRow = {
  id: string;
  email: string;
  branch_id: string | null;
  disabled_at: string | null;
};

const inputCls =
  "rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:text-sm";

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireOwner();
  const { ok, error } = await searchParams;

  const admin = createSupabaseAdminClient();
  const { data: branchData } = await admin
    .from("branches")
    .select("id, name, code, city, deleted_at, created_at")
    .order("created_at", { ascending: true })
    .returns<BranchRow[]>();
  const { data: adminData } = await admin
    .from("users")
    .select("id, email, branch_id, disabled_at")
    .eq("role", "admin")
    .returns<AdminRow[]>();

  const branches = branchData ?? [];
  const adminsByBranch = new Map<string, AdminRow[]>();
  for (const a of adminData ?? []) {
    if (!a.branch_id) continue;
    const list = adminsByBranch.get(a.branch_id) ?? [];
    list.push(a);
    adminsByBranch.set(a.branch_id, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Branches</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create branches and assign each its admin. Each branch&apos;s data is
          fully isolated from the others.
        </p>
      </div>

      {ok ? (
        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>{decodeURIComponent(ok)}</span>
        </div>
      ) : null}
      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{decodeURIComponent(error)}</span>
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Create branch</h2>
        <form action={createBranchAction} className="grid gap-3 sm:grid-cols-2">
          <input
            name="name"
            required
            placeholder="Branch name (e.g. Pune Branch)"
            className={inputCls}
          />
          <input name="code" placeholder="Code (optional, e.g. PUN)" className={inputCls} />
          <input name="city" placeholder="City (optional)" className={inputCls} />
          <div className="hidden sm:block" />
          <input
            name="adminEmail"
            type="email"
            required
            placeholder="Branch admin email"
            className={inputCls}
          />
          <input
            name="adminPassword"
            type="password"
            required
            minLength={8}
            placeholder="Admin password (≥ 8 chars)"
            className={inputCls}
          />
          <SubmitButton
            pendingLabel="Creating branch…"
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-70 sm:col-span-2"
          >
            Create branch
          </SubmitButton>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          The branch is created together with its first admin account, who can
          sign in immediately.
        </p>
      </section>

      <section className="space-y-4">
        {branches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
            No branches yet — create one above.
          </div>
        ) : (
          branches.map((b) => {
            const admins = adminsByBranch.get(b.id) ?? [];
            const archived = !!b.deleted_at;
            return (
              <div
                key={b.id}
                className={`rounded-2xl border bg-surface p-5 shadow-sm ${
                  archived ? "border-dashed border-border opacity-70" : "border-border"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      <Building2 size={18} />
                    </span>
                    <div>
                      <div className="font-semibold text-foreground">
                        {b.name}
                        {archived ? (
                          <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-danger">
                            Archived
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[b.code, b.city].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                  </div>
                  <form action={toggleBranchArchivedAction}>
                    <input type="hidden" name="branchId" value={b.id} />
                    <input
                      type="hidden"
                      name="archive"
                      value={(!archived).toString()}
                    />
                    <SubmitButton
                      pendingLabel="…"
                      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-70"
                    >
                      {archived ? "Restore" : "Archive"}
                    </SubmitButton>
                  </form>
                </div>

                <div className="mt-4 border-t border-border pt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Admins
                  </div>
                  {admins.length === 0 ? (
                    <p className="mt-1 text-xs text-warning">
                      No admin assigned — add one below.
                    </p>
                  ) : (
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {admins.map((a) => (
                        <li
                          key={a.id}
                          className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-foreground"
                        >
                          {a.email}
                          {a.disabled_at ? (
                            <span className="ml-1 text-danger">(disabled)</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}

                  {!archived ? (
                    <form
                      action={createBranchAdminAction}
                      className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                    >
                      <input type="hidden" name="branchId" value={b.id} />
                      <input
                        name="email"
                        type="email"
                        required
                        placeholder="New admin email"
                        className={inputCls}
                      />
                      <input
                        name="password"
                        type="password"
                        required
                        minLength={8}
                        placeholder="Password (≥ 8 chars)"
                        className={inputCls}
                      />
                      <SubmitButton
                        pendingLabel="Adding…"
                        className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-70"
                      >
                        Add admin
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
