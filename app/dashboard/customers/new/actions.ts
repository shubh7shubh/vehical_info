"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { customerFormSchema, customerRpcPayload } from "@/lib/customer-form";

const NEW_PATH = "/dashboard/customers/new";

function fail(msg: string) {
  redirect(`${NEW_PATH}?error=${encodeURIComponent(msg)}`);
}

export async function createCustomerAction(formData: FormData) {
  const me = await requireUser();

  const parsed = customerFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    fail(parsed.error.issues[0]?.message ?? "Please check the form and retry");
  }
  const v = parsed.data!;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_customer", {
    p: customerRpcPayload(v),
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
