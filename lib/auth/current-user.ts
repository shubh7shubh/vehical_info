import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole = "owner" | "admin" | "employee" | "sub_id";

export type CurrentUser = {
  id: string;
  email: string;
  role: AppRole;
  disabled: boolean;
  subIdRange: { start: number; end: number } | null;
  branchId: string | null;
  branchName: string | null;
};

type ProfileRow = {
  role: AppRole;
  disabled_at: string | null;
  sub_id_range_start: number | null;
  sub_id_range_end: number | null;
  branch_id: string | null;
  branches: { name: string } | { name: string }[] | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select(
      "role, disabled_at, sub_id_range_start, sub_id_range_end, branch_id, branches(name)",
    )
    .eq("id", user.id)
    .single();

  const profile = data as ProfileRow | null;
  if (!profile) return null;

  const branch = Array.isArray(profile.branches)
    ? (profile.branches[0] ?? null)
    : profile.branches;

  return {
    id: user.id,
    email: user.email ?? "",
    role: profile.role,
    disabled: !!profile.disabled_at,
    subIdRange:
      profile.sub_id_range_start != null && profile.sub_id_range_end != null
        ? { start: profile.sub_id_range_start, end: profile.sub_id_range_end }
        : null,
    branchId: profile.branch_id,
    branchName: branch?.name ?? null,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.disabled) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

export async function requireOwner(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/dashboard");
  return user;
}
