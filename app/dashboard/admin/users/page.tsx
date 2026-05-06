import { requireAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createUserAction,
  deleteUserAction,
  setUserRoleAction,
  toggleUserDisabledAction,
} from "./actions";

type UserRow = {
  id: string;
  email: string;
  role: "admin" | "employee" | "sub_id";
  disabled_at: string | null;
  sub_id_range_start: number | null;
  sub_id_range_end: number | null;
  created_at: string;
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
    .order("created_at", { ascending: false })
    .returns<UserRow[]>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add staff and assign roles. Sub-IDs are temporary accounts limited
          to a customer-record range.
        </p>
      </div>

      {ok ? (
        <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          {decodeURIComponent(ok)}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {decodeURIComponent(error)}
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-background p-5">
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
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 lg:col-span-2"
          />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Password (≥ 8 chars)"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <select
            name="role"
            defaultValue="employee"
            className="rounded-lg border border-border px-3 py-2 text-sm"
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
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
          <input
            name="rangeEnd"
            type="number"
            min={1}
            placeholder="Range end"
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 lg:col-span-6"
          >
            Add user
          </button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Range fields apply only when role is <strong>Sub-ID</strong>.
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Range</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => {
              const isMe = u.id === me.id;
              const disabled = !!u.disabled_at;
              return (
                <tr key={u.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    {u.email} {isMe ? <span className="text-xs text-muted-foreground">(you)</span> : null}
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
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
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
                        className="w-20 rounded-md border border-border px-2 py-1 text-xs"
                      />
                      <input
                        name="rangeEnd"
                        type="number"
                        min={1}
                        defaultValue={u.sub_id_range_end ?? ""}
                        placeholder="end"
                        className="w-20 rounded-md border border-border px-2 py-1 text-xs"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        Save
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {u.role === "sub_id" && u.sub_id_range_start && u.sub_id_range_end
                      ? `${u.sub_id_range_start} – ${u.sub_id_range_end}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {disabled ? (
                      <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">
                        Disabled
                      </span>
                    ) : (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
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
                        <button
                          type="submit"
                          disabled={isMe && !disabled}
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {disabled ? "Enable" : "Disable"}
                        </button>
                      </form>
                      <form action={deleteUserAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button
                          type="submit"
                          disabled={isMe}
                          className="rounded-md border border-danger/30 px-2 py-1 text-xs text-danger hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
