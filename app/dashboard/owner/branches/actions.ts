"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BRANCHES_PATH = "/dashboard/owner/branches";

const createBranchSchema = z.object({
  name: z.string().trim().min(2, "Branch name must be at least 2 characters"),
  code: z.string().trim().max(12).optional(),
  city: z.string().trim().optional(),
  adminEmail: z.string().email("Enter a valid admin email"),
  adminPassword: z
    .string()
    .min(8, "Admin password must be at least 8 characters"),
});

const createBranchAdminSchema = z.object({
  branchId: z.string().uuid(),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function flash(kind: "error" | "ok", msg: string) {
  redirect(`${BRANCHES_PATH}?${kind}=${encodeURIComponent(msg)}`);
}

/** Provision an auth user, then patch their public.users row to admin@branch. */
async function provisionBranchAdmin(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
  password: string,
  branchId: string,
) {
  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    { email, password, email_confirm: true },
  );
  if (createErr || !created.user) {
    flash("error", createErr?.message ?? "Failed to create admin account");
  }

  // handle_new_auth_user created the row (role=employee, Main Branch).
  // Patch it to admin of the new branch.
  const { error: updErr } = await admin
    .from("users")
    .update({ role: "admin", branch_id: branchId })
    .eq("id", created!.user!.id);
  if (updErr) flash("error", updErr.message);
}

export async function createBranchAction(formData: FormData) {
  const me = await requireOwner();

  const parsed = createBranchSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code") || undefined,
    city: formData.get("city") || undefined,
    adminEmail: formData.get("adminEmail"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) {
    flash("error", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { name, code, city, adminEmail, adminPassword } = parsed.data!;
  const admin = createSupabaseAdminClient();

  const { data: branch, error: branchErr } = await admin
    .from("branches")
    .insert({
      name,
      code: code ?? null,
      city: city ?? null,
      created_by: me.id,
    })
    .select("id")
    .single();
  if (branchErr || !branch) {
    flash("error", branchErr?.message ?? "Failed to create branch");
  }

  await provisionBranchAdmin(admin, adminEmail, adminPassword, branch!.id);

  revalidatePath(BRANCHES_PATH);
  flash("ok", `Branch "${name}" created with admin ${adminEmail}`);
}

export async function createBranchAdminAction(formData: FormData) {
  await requireOwner();

  const parsed = createBranchAdminSchema.safeParse({
    branchId: formData.get("branchId"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    flash("error", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { branchId, email, password } = parsed.data!;
  const admin = createSupabaseAdminClient();

  const { data: branch } = await admin
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .is("deleted_at", null)
    .single();
  if (!branch) flash("error", "Branch not found");

  await provisionBranchAdmin(admin, email, password, branchId);

  revalidatePath(BRANCHES_PATH);
  flash("ok", `Added admin ${email}`);
}

export async function toggleBranchArchivedAction(formData: FormData) {
  await requireOwner();

  const branchId = String(formData.get("branchId") ?? "");
  const archive = formData.get("archive") === "true";
  if (!branchId) flash("error", "Missing branch");

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("branches")
    .update({ deleted_at: archive ? new Date().toISOString() : null })
    .eq("id", branchId);
  if (error) flash("error", error.message);

  revalidatePath(BRANCHES_PATH);
  flash("ok", archive ? "Branch archived" : "Branch restored");
}
