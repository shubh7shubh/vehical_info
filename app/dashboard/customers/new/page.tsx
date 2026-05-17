import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { createCustomerAction } from "./actions";

type Bank = { id: string; name: string };

const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:text-sm";
const label =
  "mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  name,
  labelText,
  children,
  full,
}: {
  name: string;
  labelText: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <label htmlFor={name} className={label}>
        {labelText}
      </label>
      {children}
    </div>
  );
}

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { error } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: banks } = await supabase
    .from("banks")
    .select("id, name")
    .order("name")
    .returns<Bank[]>();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/customers"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <ArrowLeft size={14} /> All customers
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">
          Add new customer
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the customer, vehicle, guarantor and loan details. The new
          record is added to your branch.
        </p>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{decodeURIComponent(error)}</span>
        </div>
      ) : null}

      <form action={createCustomerAction} className="space-y-6">
        <Section title="Customer details">
          <Field name="first_name" labelText="First name *">
            <input id="first_name" name="first_name" required className={field} />
          </Field>
          <Field name="middle_name" labelText="Middle name">
            <input id="middle_name" name="middle_name" className={field} />
          </Field>
          <Field name="last_name" labelText="Last name">
            <input id="last_name" name="last_name" className={field} />
          </Field>
          <Field name="aadhaar" labelText="Aadhaar / ID reference">
            <input id="aadhaar" name="aadhaar" className={field} />
          </Field>
          <Field name="address_village" labelText="Village">
            <input
              id="address_village"
              name="address_village"
              className={field}
            />
          </Field>
          <Field name="address_taluka" labelText="Taluka">
            <input
              id="address_taluka"
              name="address_taluka"
              className={field}
            />
          </Field>
          <Field name="mobile1" labelText="Mobile number 1">
            <input
              id="mobile1"
              name="mobile1"
              inputMode="tel"
              className={field}
            />
          </Field>
          <Field name="mobile2" labelText="Mobile number 2">
            <input
              id="mobile2"
              name="mobile2"
              inputMode="tel"
              className={field}
            />
          </Field>
        </Section>

        <Section
          title="Vehicle details"
          hint="Leave engine numbers blank if not known — the record is flagged as incomplete until they are filled."
        >
          <Field name="vehicle_name" labelText="Vehicle name / model">
            <input
              id="vehicle_name"
              name="vehicle_name"
              className={field}
            />
          </Field>
          <Field name="rc_no" labelText="RC number">
            <input id="rc_no" name="rc_no" className={field} />
          </Field>
          <Field name="engine_no_1" labelText="Engine number 1">
            <input id="engine_no_1" name="engine_no_1" className={field} />
          </Field>
          <Field name="engine_no_2" labelText="Engine number 2">
            <input id="engine_no_2" name="engine_no_2" className={field} />
          </Field>
          <Field name="chassis_no" labelText="Chassis number" full>
            <input id="chassis_no" name="chassis_no" className={field} />
          </Field>
        </Section>

        <Section
          title="Guarantor details"
          hint="Optional — fill the name to add a guarantor."
        >
          <Field name="g_name" labelText="Guarantor name">
            <input id="g_name" name="g_name" className={field} />
          </Field>
          <Field name="g_mobile" labelText="Guarantor mobile">
            <input
              id="g_mobile"
              name="g_mobile"
              inputMode="tel"
              className={field}
            />
          </Field>
          <Field name="g_address" labelText="Guarantor address" full>
            <input id="g_address" name="g_address" className={field} />
          </Field>
        </Section>

        <Section title="Loan details">
          <Field name="bank_id" labelText="Bank assigned *">
            <select id="bank_id" name="bank_id" required className={field}>
              <option value="">Select a bank…</option>
              {(banks ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field name="started_at" labelText="Loan start date *">
            <input
              id="started_at"
              name="started_at"
              type="date"
              required
              defaultValue={today}
              className={field}
            />
          </Field>
          <Field name="principal" labelText="Loan amount (₹) *">
            <input
              id="principal"
              name="principal"
              type="number"
              min={1}
              step="1"
              required
              inputMode="numeric"
              className={field}
            />
          </Field>
          <Field name="emi" labelText="EMI amount (₹) *">
            <input
              id="emi"
              name="emi"
              type="number"
              min={1}
              step="1"
              required
              inputMode="numeric"
              className={field}
            />
          </Field>
          <Field name="tenure_months" labelText="Tenure (months) *">
            <input
              id="tenure_months"
              name="tenure_months"
              type="number"
              min={1}
              step="1"
              required
              inputMode="numeric"
              className={field}
            />
          </Field>
          <Field name="due_day" labelText="EMI due day (1–31) *">
            <input
              id="due_day"
              name="due_day"
              type="number"
              min={1}
              max={31}
              step="1"
              required
              inputMode="numeric"
              className={field}
            />
          </Field>
        </Section>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/dashboard/customers"
            className="rounded-lg border border-border bg-surface px-4 py-2.5 text-center text-sm font-medium hover:bg-muted"
          >
            Cancel
          </Link>
          <SubmitButton
            pendingLabel="Saving customer…"
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-70"
          >
            Save customer
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
