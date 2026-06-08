"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const paymentSchema = z.object({
  customer_id: z.string().uuid(),
  month_no: z.coerce.number().int().positive().optional(),
  installment: z.coerce.number().positive("Installment must be greater than 0"),
  penalty: z.coerce.number().min(0).optional(),
  receipt_no: z.string().trim().optional(),
  mode: z.enum(["cash", "online"]).optional(),
  paid_at: z.string().min(1, "Payment date is required"),
});

const followupSchema = z.object({
  customer_id: z.string().uuid(),
  note: z.string().trim().min(1, "Write a short note"),
});

/** Bounce back to the EMI History tab with a flash message. */
function back(id: string, kind: "ok" | "error", msg: string) {
  redirect(
    `/dashboard/customers/${id}?tab=emi&${kind}=${encodeURIComponent(msg)}`,
  );
}

export async function logPaymentAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("customer_id") ?? "");

  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    back(id, "error", parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const v = parsed.data!;

  const payload = {
    customer_id: v.customer_id,
    month_no: v.month_no ?? null,
    installment_paise: Math.round(v.installment * 100),
    penalty_paise: Math.round((v.penalty ?? 0) * 100),
    receipt_no: v.receipt_no ?? "",
    signature: formData.get("signature") != null,
    mode: v.mode ?? "cash",
    paid_at: v.paid_at,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("log_payment", { p: payload });
  if (error) back(v.customer_id, "error", error.message);

  revalidatePath(`/dashboard/customers/${v.customer_id}`);
  back(v.customer_id, "ok", "Installment recorded");
}

export async function addFollowupAction(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get("customer_id") ?? "");

  const parsed = followupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    back(id, "error", parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const v = parsed.data!;

  // Plain insert under RLS: set_branch_id stamps the branch from the customer,
  // the followups_insert policy enforces it's the caller's branch.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("followups")
    .insert({ customer_id: v.customer_id, note: v.note, created_by: me.id });
  if (error) back(v.customer_id, "error", error.message);

  revalidatePath(`/dashboard/customers/${v.customer_id}`);
  back(v.customer_id, "ok", "Follow-up added");
}
