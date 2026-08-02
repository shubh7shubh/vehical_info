import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  LedgerCustomerForm,
  type LedgerFormDefaults,
} from "@/components/ledger-customer-form";
import { updateCustomerAction } from "../actions";

type OneOrMany<T> = T | T[] | null;
function one<T>(v: OneOrMany<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type Bank = { id: string; name: string };

type EditRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  account_no: string | null;
  address_village: string | null;
  address_post: string | null;
  address_taluka: string | null;
  address_district: string | null;
  model_no: string | null;
  purchase_date: string | null;
  mobiles: string[];
  aadhaar: string | null;
  bank_id: string;
  vehicles: OneOrMany<{
    vehicle_name: string | null;
    rc_no: string | null;
    engine_no_1: string | null;
    engine_no_2: string | null;
    chassis_no: string | null;
  }>;
  guarantors: OneOrMany<{
    name: string;
    mobile: string | null;
    address: string | null;
  }>;
  loans: OneOrMany<{
    id: string;
    principal_paise: number;
    emi_paise: number;
    tenure_months: number;
    started_at: string;
    first_emi_date: string | null;
    status: string;
  }>;
};

function rupees(paise: number | undefined): string | undefined {
  return paise == null ? undefined : String(Math.round(paise / 100));
}

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;

  // update_customer rejects these roles anyway; don't show them a dead form.
  if (me.role === "owner" || me.role === "sub_id") {
    redirect(`/dashboard/customers/${id}`);
  }

  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: banks }] = await Promise.all([
    supabase
      .from("customers")
      .select(
        "id, first_name, middle_name, last_name, account_no, address_village, address_post, address_taluka, address_district, model_no, purchase_date, mobiles, aadhaar, bank_id, vehicles(vehicle_name, rc_no, engine_no_1, engine_no_2, chassis_no), guarantors(name, mobile, address), loans(id, principal_paise, emi_paise, tenure_months, started_at, first_emi_date, status)",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("banks").select("id, name").order("name").returns<Bank[]>(),
  ]);

  const customer = data as EditRow | null;
  if (!customer) notFound();

  const vehicle = one(customer.vehicles);
  const guarantor = one(customer.guarantors);
  const loanList = Array.isArray(customer.loans)
    ? customer.loans
    : customer.loans
      ? [customer.loans]
      : [];
  const loan = loanList.find((l) => l.status === "active") ?? loanList[0] ?? null;

  const fullName = [customer.first_name, customer.middle_name, customer.last_name]
    .filter(Boolean)
    .join(" ");

  const defaults: LedgerFormDefaults = {
    account_no: customer.account_no ?? "",
    model_no: customer.model_no ?? "",
    first_name: customer.first_name,
    middle_name: customer.middle_name ?? "",
    last_name: customer.last_name ?? "",
    address_village: customer.address_village ?? "",
    address_post: customer.address_post ?? "",
    address_taluka: customer.address_taluka ?? "",
    address_district: customer.address_district ?? "",
    mobile1: customer.mobiles?.[0] ?? "",
    mobile2: customer.mobiles?.[1] ?? "",
    purchase_date: (customer.purchase_date ?? loan?.started_at ?? "").slice(0, 10),
    first_emi_date: (loan?.first_emi_date ?? "").slice(0, 10),
    bank_id: customer.bank_id,
    principal: rupees(loan?.principal_paise),
    emi: rupees(loan?.emi_paise),
    tenure_months: loan ? String(loan.tenure_months) : undefined,
    aadhaar: customer.aadhaar ?? "",
    vehicle_name: vehicle?.vehicle_name ?? "",
    rc_no: vehicle?.rc_no ?? "",
    engine_no_1: vehicle?.engine_no_1 ?? "",
    engine_no_2: vehicle?.engine_no_2 ?? "",
    chassis_no: vehicle?.chassis_no ?? "",
    g_name: guarantor?.name ?? "",
    g_mobile: guarantor?.mobile ?? "",
    g_address: guarantor?.address ?? "",
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Edit {fullName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {customer.account_no ? `Account ${customer.account_no}. ` : ""}
          Recorded installments are not affected by changes made here.
        </p>
      </div>

      <LedgerCustomerForm
        banks={banks ?? []}
        today={today}
        error={error}
        action={updateCustomerAction}
        defaults={defaults}
        customerId={customer.id}
        cancelHref={`/dashboard/customers/${customer.id}`}
        submitLabel="Save changes"
      />
    </div>
  );
}
