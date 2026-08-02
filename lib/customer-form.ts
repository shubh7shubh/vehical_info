import { z } from "zod";

/**
 * The loan-book customer form, shared by "Add customer" and "Edit customer".
 * Kept out of the "use server" action files because those may only export async
 * functions — both actions import the schema and the payload builder from here
 * so the two paths can never drift.
 */
export const customerFormSchema = z.object({
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
  purchase_date: z.string().min(1, "Purchase / loan date is required"),
  first_emi_date: z.string().trim().optional(),
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

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

/**
 * The nested jsonb shape both `create_customer(p)` and `update_customer(p)`
 * expect. Money is converted to integer paise here (CLAUDE.md: never float).
 */
export function customerRpcPayload(v: CustomerFormValues) {
  return {
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
      // Blank -> the RPC falls back to purchase date + 1 month.
      first_emi_date: v.first_emi_date ?? "",
    },
  };
}
