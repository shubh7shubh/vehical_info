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
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Plain-column select only. Do NOT embed `branches` here: there are two FKs
  // between `users` and `branches` (users.branch_id and branches.created_by),
  // so a PostgREST embed is ambiguous and fails — which would null out the
  // profile and log the user out. The branch name is fetched separately below.
  const { data } = await supabase
    .from("users")
    .select(
      "role, disabled_at, sub_id_range_start, sub_id_range_end, branch_id",
    )
    .eq("id", user.id)
    .single();

  const profile = data as ProfileRow | null;
  if (!profile) return null;

  // Branch name is non-critical: a failure here must never block sign-in.
  let branchName: string | null = null;
  if (profile.branch_id) {
    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("id", profile.branch_id)
      .maybeSingle();
    branchName = (branch as { name: string } | null)?.name ?? null;
  }

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
    branchName,
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
