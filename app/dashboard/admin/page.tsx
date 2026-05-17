import Link from "next/link";
import { Users, Layers, FileSearch } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current-user";

export default async function AdminPage() {
  const user = await requireAdmin();
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Admin Console</h1>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            admin
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as <strong className="text-foreground">{user.email}</strong>
          {user.branchName ? (
            <>
              {" "}
              · <strong className="text-foreground">{user.branchName}</strong>
            </>
          ) : null}
          . This area is restricted to admins and scoped to your branch.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/dashboard/admin/users"
          className="group rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:border-accent/40 hover:shadow-md"
        >
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Users size={18} />
          </div>
          <div className="font-semibold">Users</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Add staff, change roles, assign sub-ID ranges, disable accounts.
          </div>
        </Link>

        <div className="rounded-2xl border border-dashed border-border bg-surface p-5">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Layers size={18} />
          </div>
          <div className="font-semibold text-foreground">Sub-ID Monitoring</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Live progress per range and auto-disable when complete.
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-border bg-surface p-5">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <FileSearch size={18} />
          </div>
          <div className="font-semibold text-foreground">Audit Log</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Browse every create / update / delete across the system.
          </div>
        </div>
      </div>
    </div>
  );
}
