import { CheckCircle2, AlertTriangle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SubmitButton } from "@/components/submit-button";
import {
  createUserAction,
  deleteUserAction,
  setUserRoleAction,
  toggleUserDisabledAction,
} from "./actions";

type UserRow = {
  id: string;
  email: string;
  role: "owner" | "admin" | "employee" | "sub_id";
  disabled_at: string | null;
  sub_id_range_start: number | null;
  sub_id_range_end: number | null;
  created_at: string;
};

const roleLabel: Record<UserRow["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  employee: "Employee",
  sub_id: "Sub-ID",
};

const roleBadge: Record<UserRow["role"], string> = {
  owner: "bg-accent-soft text-accent",
  admin: "bg-accent-soft text-accent",
  employee: "bg-bank-a-soft text-bank-a",
  sub_id: "bg-warning-soft text-warning",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const me = await requireAdmin();
  const { ok, error } = await searchParams;

  const admin = createSupabaseAdminClient();
  const { data: users } = await admin
    .from("users")
    .select(
      "id, email, role, disabled_at, sub_id_range_start, sub_id_range_end, created_at",
    )
    .eq("branch_id", me.branchId)
    .order("created_at", { ascending: false })
    .returns<UserRow[]>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Staff for{" "}
          <strong className="text-foreground">
            {me.branchName ?? "your branch"}
          </strong>
          . Sub-IDs are temporary accounts limited to a customer-record range.
          New users join this branch automatically.
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
        <h2 className="mb-3 text-sm font-semibold">Add user</h2>
        <form
          action={createUserAction}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
        >
          <input
            name="email"
            type="email"
            required
            placeholder="email@example.com"
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 lg:col-span-2"
          />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Password (≥ 8 chars)"
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <select
            name="role"
            defaultValue="employee"
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
          >
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
            <option value="sub_id">Sub-ID</option>
          </select>
          <input
            name="rangeStart"
            type="number"
            min={1}
            placeholder="Range start"
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
          />
          <input
            name="rangeEnd"
            type="number"
            min={1}
            placeholder="Range end"
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
          />
          <SubmitButton
            pendingLabel="Creating user…"
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-70 lg:col-span-6"
          >
            Add user
          </SubmitButton>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Range fields apply only when role is <strong>Sub-ID</strong>.
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Role / Range</th>
                <th className="px-4 py-3 text-left">Range</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => {
                const isMe = u.id === me.id;
                const disabled = !!u.disabled_at;
                return (
                  <tr key={u.id} className="border-t border-border align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {u.email}
                      </div>
                      {isMe ? (
                        <div className="text-[11px] text-muted-foreground">
                          (you)
                        </div>
                      ) : null}
                      <div className="mt-1 inline-flex">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${roleBadge[u.role]}`}
                        >
                          {roleLabel[u.role]}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <form
                        action={setUserRoleAction}
                        className="flex flex-wrap items-center gap-1"
                      >
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="role"
                          defaultValue={u.role}
                          className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
                        >
                          <option value="employee">Employee</option>
                          <option value="admin">Admin</option>
                          <option value="sub_id">Sub-ID</option>
                        </select>
                        <input
                          name="rangeStart"
                          type="number"
                          min={1}
                          defaultValue={u.sub_id_range_start ?? ""}
                          placeholder="start"
                          className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-xs"
                        />
                        <input
                          name="rangeEnd"
                          type="number"
                          min={1}
                          defaultValue={u.sub_id_range_end ?? ""}
                          placeholder="end"
                          className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-xs"
                        />
                        <SubmitButton
                          pendingLabel="Saving…"
                          className="rounded-md border border-border bg-surface px-2 py-1 text-xs hover:bg-muted disabled:opacity-70"
                        >
                          Save
                        </SubmitButton>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.role === "sub_id" &&
                      u.sub_id_range_start &&
                      u.sub_id_range_end
                        ? `${u.sub_id_range_start} – ${u.sub_id_range_end}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {disabled ? (
                        <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-danger">
                          Disabled
                        </span>
                      ) : (
                        <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <form action={toggleUserDisabledAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input
                            type="hidden"
                            name="disabled"
                            value={(!disabled).toString()}
                          />
                          <SubmitButton
                            disabled={isMe && !disabled}
                            pendingLabel="…"
                            className="rounded-md border border-border bg-surface px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {disabled ? "Enable" : "Disable"}
                          </SubmitButton>
                        </form>
                        <form action={deleteUserAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <SubmitButton
                            disabled={isMe}
                            pendingLabel="…"
                            className="rounded-md border border-danger/30 bg-surface px-2 py-1 text-xs text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Delete
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
