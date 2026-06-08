"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NEW_PATH = "/dashboard/customers/new";

const schema = z.object({
  account_no: z.string().trim().min(1, "Account number is required"),
  first_name: z.string().trim().min(1, "Customer name is required"),
  middle_name: z.string().trim().optional(),
  last_name: z.string().trim().optional(),
  address_village: z.string().trim().optional(),
  address_post: z.string().trim().optional(),
  address_taluka: z.string().trim().optional(),
  address_district: z.string().trim().optional(),
  mobile1: z.string().trim().optional(),
  mobile2: z.string().trim().optional(),
  aadhaar: z.string().trim().optional(),
  model_no: z.string().trim().optional(),
  bank_id: z.string().uuid("Select a bank"),
  purchase_date: z.string().min(1, "Purchase / loan start date is required"),
  principal: z.coerce.number().positive("Loan amount must be greater than 0"),
  emi: z.coerce.number().positive("Installment must be greater than 0"),
  tenure_months: z.coerce
    .number()
    .int()
    .positive("Tenure must be at least 1 month"),
  // Optional vehicle / guarantor extras (collapsed in the form).
  vehicle_name: z.string().trim().optional(),
  rc_no: z.string().trim().optional(),
  engine_no_1: z.string().trim().optional(),
  engine_no_2: z.string().trim().optional(),
  chassis_no: z.string().trim().optional(),
  g_name: z.string().trim().optional(),
  g_mobile: z.string().trim().optional(),
  g_address: z.string().trim().optional(),
});

function fail(msg: string) {
  redirect(`${NEW_PATH}?error=${encodeURIComponent(msg)}`);
}

export async function createCustomerAction(formData: FormData) {
  const me = await requireUser();

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    fail(parsed.error.issues[0]?.message ?? "Please check the form and retry");
  }
  const v = parsed.data!;

  const payload = {
    customer: {
      account_no: v.account_no,
      first_name: v.first_name,
      middle_name: v.middle_name ?? "",
      last_name: v.last_name ?? "",
      address_village: v.address_village ?? "",
      address_post: v.address_post ?? "",
      address_taluka: v.address_taluka ?? "",
      address_district: v.address_district ?? "",
      model_no: v.model_no ?? "",
      mobiles: [v.mobile1, v.mobile2].filter(
        (m): m is string => !!m && m.trim() !== "",
      ),
      aadhaar: v.aadhaar ?? "",
      bank_id: v.bank_id,
    },
    vehicle: {
      vehicle_name: v.vehicle_name ?? "",
      rc_no: v.rc_no ?? "",
      engine_no_1: v.engine_no_1 ?? "",
      engine_no_2: v.engine_no_2 ?? "",
      chassis_no: v.chassis_no ?? "",
    },
    guarantor: {
      name: v.g_name ?? "",
      mobile: v.g_mobile ?? "",
      address: v.g_address ?? "",
    },
    loan: {
      principal_paise: Math.round(v.principal * 100),
      emi_paise: Math.round(v.emi * 100),
      tenure_months: v.tenure_months,
      purchase_date: v.purchase_date,
    },
  };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_customer", {
    p: payload,
  });

  if (error) fail(error.message);

  // Sub-IDs can't open the full customer card (no read policy on vehicles/loans).
  // Send them back to their entry screen with a success flash; everyone else goes
  // to the new customer's card.
  if (me.role === "sub_id") {
    redirect(
      `/dashboard?ok=${encodeURIComponent(`Added account ${v.account_no} — ${v.first_name}`)}`,
    );
  }
  redirect(`/dashboard/customers/${data}`);
}
