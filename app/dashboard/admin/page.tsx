import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-user";

export default async function AdminPage() {
  const user = await requireAdmin();
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-background p-6">
        <h1 className="text-lg font-semibold">Admin Console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as <strong>{user.email}</strong>. This area is restricted
          to admins.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/dashboard/admin/users"
          className="rounded-2xl border border-border bg-background p-5 text-sm transition hover:border-primary/30 hover:shadow-sm"
        >
          <div className="mb-1 font-semibold">Users</div>
          <div className="text-muted-foreground">
            Add staff, change roles, assign sub-ID ranges, disable accounts.
          </div>
        </Link>
        <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          <div className="mb-1 font-semibold text-foreground">Sub-ID Monitoring</div>
          Live progress per range and auto-disable when complete.
        </div>
        <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          <div className="mb-1 font-semibold text-foreground">Audit Log</div>
          Browse every create / update / delete across the system.
        </div>
      </div>
    </div>
  );
}
