"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Foreclosure & Seizing — client feedback round 3, recordings 4 to 9.
 *
 * Every role check that matters lives in the RPCs (`record_foreclosure`,
 * `approve_seizure`, `exit_seizure` … are admin-only; `record_seizure` also
 * accepts an employee, who gets a `pending` row). These actions only validate,
 * call, and bounce back with a flash message — the UI hiding a button is a
 * courtesy, never the control.
 */

const rupees = z.coerce.number().min(0).optional();

const foreclosureSchema = z.object({
  customer_id: z.string().uuid(),
  loan_id: z.string().uuid(),
  bank_charge: rupees,
  interest_waiver: rupees,
  notes: z.string().trim().optional(),
});

const settleSchema = z.object({
  customer_id: z.string().uuid(),
  foreclosure_id: z.string().uuid(),
  notes: z.string().trim().optional(),
});

const seizureSchema = z.object({
  customer_id: z.string().uuid(),
  amount: rupees,
  notes: z.string().trim().optional(),
});

const seizureIdSchema = z.object({
  customer_id: z.string().uuid(),
  seizure_id: z.string().uuid(),
  amount: rupees,
  exit_reason: z.string().trim().optional(),
});

/** Bounce back to the same customer's panel with a flash message. */
function back(
  customerId: string,
  kind: "ok" | "error",
  msg: string,
): never {
  const params = new URLSearchParams({ customer: customerId, [kind]: msg });
  redirect(`/dashboard/foreclosure?${params.toString()}`);
}

/** Rupees from a form field -> the paise string the RPCs expect, or null. */
function paise(v: number | undefined): string | null {
  return v === undefined ? null : String(Math.round(v * 100));
}

export async function recordForeclosureAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("customer_id") ?? "");

  const parsed = foreclosureSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    back(id, "error", parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const v = parsed.data!;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_foreclosure", {
    p: {
      loan_id: v.loan_id,
      bank_charge_paise: paise(v.bank_charge),
      interest_waiver_paise: paise(v.interest_waiver),
      notes: v.notes ?? "",
    },
  });
  if (error) back(v.customer_id, "error", error.message);

  revalidatePath("/dashboard/foreclosure");
  back(v.customer_id, "ok", "Foreclosure recorded");
}

export async function settleForeclosureAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("customer_id") ?? "");

  const parsed = settleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    back(id, "error", parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const v = parsed.data!;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("settle_foreclosure", {
    p: {
      foreclosure_id: v.foreclosure_id,
      noc_issued: formData.get("noc_issued") != null,
      notes: v.notes ?? "",
    },
  });
  if (error) back(v.customer_id, "error", error.message);

  revalidatePath("/dashboard/foreclosure");
  back(v.customer_id, "ok", "Foreclosure marked paid — the loan is now closed");
}

export async function recordSeizureAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("customer_id") ?? "");

  const parsed = seizureSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    back(id, "error", parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const v = parsed.data!;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_seizure", {
    p: {
      customer_id: v.customer_id,
      amount_paise: paise(v.amount) ?? "0",
      notes: v.notes ?? "",
      // An admin approving inline is the RPC's decision, not ours — it ignores
      // this for an employee.
      approve: formData.get("approve") != null,
    },
  });
  if (error) back(v.customer_id, "error", error.message);

  revalidatePath("/dashboard/foreclosure");
  back(v.customer_id, "ok", "Seizing recorded");
}

export async function approveSeizureAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("customer_id") ?? "");

  const parsed = seizureIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    back(id, "error", parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const v = parsed.data!;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("approve_seizure", {
    p: { seizure_id: v.seizure_id, amount_paise: paise(v.amount) },
  });
  if (error) back(v.customer_id, "error", error.message);

  revalidatePath("/dashboard/foreclosure");
  back(v.customer_id, "ok", "Seizing approved");
}

/**
 * Recording 8 + 9. The RPC refuses unless every due, every penalty and any
 * recorded foreclosure amount is cleared — and refuses anyone who is not an
 * admin. Its error message is what the operator sees, so it names the figure
 * that is still outstanding.
 */
export async function exitSeizureAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("customer_id") ?? "");

  const parsed = seizureIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    back(id, "error", parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const v = parsed.data!;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("exit_seizure", {
    p: { seizure_id: v.seizure_id, exit_reason: v.exit_reason ?? "" },
  });
  if (error) back(v.customer_id, "error", error.message);

  revalidatePath("/dashboard/foreclosure");
  back(v.customer_id, "ok", "Customer removed from seizing");
}
