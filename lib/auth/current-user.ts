import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "employee" | "sub_id";

export type CurrentUser = {
  id: string;
  email: string;
  role: AppRole;
  disabled: boolean;
  subIdRange: { start: number; end: number } | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("role, disabled_at, sub_id_range_start, sub_id_range_end")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    role: profile.role as AppRole,
    disabled: !!profile.disabled_at,
    subIdRange:
      profile.sub_id_range_start != null && profile.sub_id_range_end != null
        ? { start: profile.sub_id_range_start, end: profile.sub_id_range_end }
        : null,
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
