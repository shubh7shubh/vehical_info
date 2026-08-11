"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { customerFormSchema, customerRpcPayload } from "@/lib/customer-form";

/**
 * A receipt may now be short of the EMI, or be penalty-only (client feedback
 * round 3, recordings 11 and 13). So neither amount is required to be positive —
 * only their sum. `log_payment` and the payments_amount_or_penalty CHECK enforce
 * the same rule server-side.
 */
const paymentSchema = z
  .object({
    customer_id: z.string().uuid(),
    month_no: z.coerce.number().int().positive().optional(),
    installment: z.coerce.number().min(0).optional(),
    penalty: z.coerce.number().min(0).optional(),
    receipt_no: z.string().trim().optional(),
    remark: z.string().trim().optional(),
    mode: z.enum(["cash", "online"]).optional(),
    paid_at: z.string().min(1, "Payment date is required"),
  })
  .refine((v) => (v.installment ?? 0) + (v.penalty ?? 0) > 0, {
    message: "Enter an amount towards the instalment, the penalty, or both",
    path: ["installment"],
  });

/** Admin-only penalty edit / waive / manual charge (recording 10). */
const penaltySchema = z.object({
  customer_id: z.string().uuid(),
  penalty_id: z.string().uuid().optional(),
  loan_id: z.string().uuid().optional(),
  amount: z.coerce.number().min(0).optional(),
  month_no: z.coerce.number().int().positive().optional(),
  note: z.string().trim().optional(),
  waive: z.enum(["true", "false"]).optional(),
});

/** Admin-only correction of an already-recorded receipt (recording 13). */
const amendSchema = z
  .object({
    customer_id: z.string().uuid(),
    payment_id: z.string().uuid(),
    installment: z.coerce.number().min(0).optional(),
    penalty: z.coerce.number().min(0).optional(),
    receipt_no: z.string().trim().optional(),
    remark: z.string().trim().optional(),
    mode: z.enum(["cash", "online"]).optional(),
    paid_at: z.string().optional(),
  })
  .refine((v) => (v.installment ?? 0) + (v.penalty ?? 0) > 0, {
    message: "A receipt must be for an instalment amount, a penalty amount, or both",
    path: ["installment"],
  });

const followupSchema = z.object({
  customer_id: z.string().uuid(),
  note: z.string().trim().min(1, "Write a short note"),
});

const editSchema = customerFormSchema.extend({
  customer_id: z.string().uuid(),
});

/** Bounce back to the EMI History tab with a flash message. */
function back(
  id: string,
  kind: "ok" | "error",
  msg: string,
  extra?: Record<string, string>,
) {
  const params = new URLSearchParams({ tab: "emi", [kind]: msg, ...extra });
  redirect(`/dashboard/customers/${id}?${params.toString()}`);
}

export async function logPaymentAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("customer_id") ?? "");

  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    back(id, "error", parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const v = parsed.data!;

  const installmentPaise = Math.round((v.installment ?? 0) * 100);
  const penaltyPaise = Math.round((v.penalty ?? 0) * 100);

  const payload = {
    customer_id: v.customer_id,
    month_no: v.month_no ?? null,
    installment_paise: installmentPaise,
    penalty_paise: penaltyPaise,
    receipt_no: v.receipt_no ?? "",
    remark: v.remark ?? "",
    signature: formData.get("signature") != null,
    mode: v.mode ?? "cash",
    paid_at: v.paid_at,
  };

  const supabase = await createSupabaseServerClient();
  // log_payment returns the new payment id — pass it back so the success banner
  // can offer "Print receipt" straight away (client request #1).
  const { data, error } = await supabase.rpc("log_payment", { p: payload });
  if (error) back(v.customer_id, "error", error.message);

  revalidatePath(`/dashboard/customers/${v.customer_id}`);
  back(
    v.customer_id,
    "ok",
    installmentPaise === 0 ? "Penalty payment recorded" : "Instalment recorded",
    typeof data === "string" ? { receipt: data } : undefined,
  );
}

/**
 * Recording 10 — "only the Owner and Admin should be allowed to increase or
 * decrease a customer's penalty amount". Enforced inside `set_penalty_charge`,
 * which is admin-only; the owner is read-only at the DB layer, so it is excluded
 * along with employees and sub-IDs. The UI hides the controls too, but the RPC
 * is the gate that matters.
 */
export async function setPenaltyChargeAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("customer_id") ?? "");

  const parsed = penaltySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    back(id, "error", parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const v = parsed.data!;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_penalty_charge", {
    p: {
      penalty_id: v.penalty_id ?? null,
      loan_id: v.loan_id ?? null,
      amount_paise:
        v.amount === undefined ? null : String(Math.round(v.amount * 100)),
      month_no: v.month_no ?? null,
      note: v.note ?? "",
      waive: v.waive === undefined ? null : v.waive === "true",
    },
  });
  if (error) back(v.customer_id, "error", error.message);

  revalidatePath(`/dashboard/customers/${v.customer_id}`);
  back(
    v.customer_id,
    "ok",
    v.waive === "true" ? "Penalty waived" : "Penalty updated",
  );
}

/**
 * Recording 13 — "once this payment data has been recorded, only the Owner and
 * Admin should be allowed to make changes to it". Admin-only inside
 * `amend_payment`; the invoice number is never reassigned.
 */
export async function amendPaymentAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("customer_id") ?? "");

  const parsed = amendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    back(id, "error", parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const v = parsed.data!;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("amend_payment", {
    p: {
      payment_id: v.payment_id,
      installment_paise: String(Math.round((v.installment ?? 0) * 100)),
      penalty_paise: String(Math.round((v.penalty ?? 0) * 100)),
      receipt_no: v.receipt_no ?? "",
      remark: v.remark ?? "",
      mode: v.mode ?? "",
      paid_at: v.paid_at ?? "",
    },
  });
  if (error) back(v.customer_id, "error", error.message);

  revalidatePath(`/dashboard/customers/${v.customer_id}`);
  back(v.customer_id, "ok", "Receipt updated");
}

/** Admin-only soft delete of a mis-keyed receipt. Soft delete only (CLAUDE.md). */
export async function voidPaymentAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("customer_id") ?? "");
  const paymentId = String(formData.get("payment_id") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_payment", {
    p: {
      payment_id: paymentId,
      reason: String(formData.get("reason") ?? ""),
    },
  });
  if (error) back(id, "error", error.message);

  revalidatePath(`/dashboard/customers/${id}`);
  back(id, "ok", "Receipt voided");
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

/**
 * The Edit button on the customer card. Role and branch are enforced inside
 * `update_customer` (security definer), which is what lets an employee — who has
 * no RLS UPDATE policy — fix a record in the field.
 */
export async function updateCustomerAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("customer_id") ?? "");

  function fail(msg: string): never {
    redirect(
      `/dashboard/customers/${id}/edit?error=${encodeURIComponent(msg)}`,
    );
  }

  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    fail(parsed.error.issues[0]?.message ?? "Please check the form and retry");
  }
  const v = parsed.data!;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_customer", {
    p: { customer_id: v.customer_id, ...customerRpcPayload(v) },
  });
  if (error) fail(error.message);

  revalidatePath(`/dashboard/customers/${v.customer_id}`);
  redirect(
    `/dashboard/customers/${v.customer_id}?ok=${encodeURIComponent("Customer updated")}`,
  );
}
