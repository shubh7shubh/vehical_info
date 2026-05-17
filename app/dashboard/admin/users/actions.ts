"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const USERS_PATH = "/dashboard/admin/users";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "employee", "sub_id"]),
  rangeStart: z.coerce.number().int().positive().optional(),
  rangeEnd: z.coerce.number().int().positive().optional(),
});

const setRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "employee", "sub_id"]),
  rangeStart: z.coerce.number().int().positive().optional(),
  rangeEnd: z.coerce.number().int().positive().optional(),
});

function flash(kind: "error" | "ok", msg: string) {
  redirect(`${USERS_PATH}?${kind}=${encodeURIComponent(msg)}`);
}

/** Count of active admins in a single branch. */
async function activeAdminCount(branchId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("branch_id", branchId)
    .is("disabled_at", null);
  if (error) throw error;
  return count ?? 0;
}

/** True when this user is the last active admin of their branch. */
async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data: target } = await admin
    .from("users")
    .select("role, disabled_at, branch_id")
    .eq("id", userId)
    .single();
  if (
    !target ||
    target.role !== "admin" ||
    target.disabled_at ||
    !target.branch_id
  ) {
    return false;
  }
  return (await activeAdminCount(target.branch_id)) <= 1;
}

export async function createUserAction(formData: FormData) {
  const me = await requireAdmin();

  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    rangeStart: formData.get("rangeStart") || undefined,
    rangeEnd: formData.get("rangeEnd") || undefined,
  });

  if (!parsed.success) {
    flash("error", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { email, password, role, rangeStart, rangeEnd } = parsed.data!;

  if (role === "sub_id" && (!rangeStart || !rangeEnd || rangeEnd < rangeStart)) {
    flash("error", "Sub-ID requires a valid range (start ≤ end)");
  }

  const admin = createSupabaseAdminClient();

  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createErr || !created.user) {
    flash("error", createErr?.message ?? "Failed to create auth user");
  }

  // handle_new_auth_user trigger creates public.users with role=employee on the
  // Main Branch. Patch role/range and move the user into the admin's branch.
  const { error: updErr } = await admin
    .from("users")
    .update({
      role,
      branch_id: me.branchId,
      sub_id_range_start: role === "sub_id" ? rangeStart : null,
      sub_id_range_end: role === "sub_id" ? rangeEnd : null,
    })
    .eq("id", created!.user!.id);

  if (updErr) flash("error", updErr.message);

  revalidatePath(USERS_PATH);
  flash("ok", `Created ${email}`);
}

export async function setUserRoleAction(formData: FormData) {
  const me = await requireAdmin();

  const parsed = setRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
    rangeStart: formData.get("rangeStart") || undefined,
    rangeEnd: formData.get("rangeEnd") || undefined,
  });
  if (!parsed.success) flash("error", "Invalid role input");

  const { userId, role, rangeStart, rangeEnd } = parsed.data!;

  if (userId === me.id && role !== "admin") {
    flash("error", "You cannot demote yourself");
  }

  if (role !== "admin" && (await isLastActiveAdmin(userId))) {
    flash("error", "Cannot demote the only active admin");
  }

  if (role === "sub_id" && (!rangeStart || !rangeEnd || rangeEnd < rangeStart)) {
    flash("error", "Sub-ID requires a valid range (start ≤ end)");
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("users")
    .update({
      role,
      sub_id_range_start: role === "sub_id" ? rangeStart : null,
      sub_id_range_end: role === "sub_id" ? rangeEnd : null,
    })
    .eq("id", userId);

  if (error) flash("error", error.message);

  revalidatePath(USERS_PATH);
  flash("ok", "Role updated");
}

export async function toggleUserDisabledAction(formData: FormData) {
  const me = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const disabled = formData.get("disabled") === "true";

  if (!userId) flash("error", "Missing user");

  if (userId === me.id && disabled) {
    flash("error", "You cannot disable yourself");
  }

  if (disabled && (await isLastActiveAdmin(userId))) {
    flash("error", "Cannot disable the only active admin");
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("users")
    .update({ disabled_at: disabled ? new Date().toISOString() : null })
    .eq("id", userId);

  if (error) flash("error", error.message);

  revalidatePath(USERS_PATH);
  flash("ok", disabled ? "Account disabled" : "Account enabled");
}

export async function deleteUserAction(formData: FormData) {
  const me = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  if (!userId) flash("error", "Missing user");
  if (userId === me.id) flash("error", "You cannot delete yourself");
  if (await isLastActiveAdmin(userId)) {
    flash("error", "Cannot delete the only active admin");
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) flash("error", error.message);

  revalidatePath(USERS_PATH);
  flash("ok", "User deleted");
}
