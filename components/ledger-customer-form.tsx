import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { EmiDateFields } from "@/components/emi-date-fields";
import { fieldClass as field, labelClass as label } from "@/components/form-styles";
import { createCustomerAction } from "@/app/dashboard/customers/new/actions";

type Bank = { id: string; name: string };

/** Pre-filled values when the form is used to edit an existing record. */
export type LedgerFormDefaults = Partial<{
  account_no: string;
  model_no: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  address_village: string;
  address_post: string;
  address_taluka: string;
  address_district: string;
  mobile1: string;
  mobile2: string;
  purchase_date: string;
  first_emi_date: string;
  bank_id: string;
  principal: string;
  emi: string;
  tenure_months: string;
  aadhaar: string;
  vehicle_name: string;
  rc_no: string;
  engine_no_1: string;
  engine_no_2: string;
  chassis_no: string;
  g_name: string;
  g_mobile: string;
  g_address: string;
}>;

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

/**
 * Shared customer form, modeled on the physical loan-book page (account no,
 * name, village/post/taluka/district, mobiles, model no, purchase + first EMI
 * date, loan/installment/tenure).
 *
 * Used in three places: the employee "Add new customer" page, the sub-ID
 * bulk-entry dashboard, and the "Edit" screen on the customer card — the last
 * one passes `action`, `defaults` and `customerId`. Vehicle/guarantor extras
 * live in a collapsed section since the book itself doesn't track them.
 */
export function LedgerCustomerForm({
  banks,
  today,
  error,
  cancelHref,
  submitLabel = "Save customer",
  action = createCustomerAction,
  defaults,
  customerId,
}: {
  banks: Bank[];
  today: string;
  error?: string;
  cancelHref?: string;
  submitLabel?: string;
  action?: (formData: FormData) => Promise<void>;
  defaults?: LedgerFormDefaults;
  customerId?: string;
}) {
  const d = defaults ?? {};
  // Open the optional section straight away when it already holds data.
  const extrasFilled = Boolean(
    d.aadhaar ||
      d.vehicle_name ||
      d.rc_no ||
      d.engine_no_1 ||
      d.engine_no_2 ||
      d.chassis_no ||
      d.g_name ||
      d.g_mobile ||
      d.g_address,
  );

  return (
    <form action={action} className="space-y-6">
      {customerId ? (
        <input type="hidden" name="customer_id" value={customerId} />
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{decodeURIComponent(error)}</span>
        </div>
      ) : null}

      <Section
        title="Customer details"
        hint="Account number is the physical-book number — it must be unique within your branch."
      >
        <Field name="account_no" labelText="Account number *">
          <input
            id="account_no"
            name="account_no"
            required
            inputMode="numeric"
            defaultValue={d.account_no}
            className={field}
          />
        </Field>
        <Field name="model_no" labelText="Model no.">
          <input
            id="model_no"
            name="model_no"
            defaultValue={d.model_no}
            className={field}
          />
        </Field>
        <Field name="first_name" labelText="Name *">
          <input
            id="first_name"
            name="first_name"
            required
            defaultValue={d.first_name}
            className={field}
          />
        </Field>
        <Field name="middle_name" labelText="Father / middle name">
          <input
            id="middle_name"
            name="middle_name"
            defaultValue={d.middle_name}
            className={field}
          />
        </Field>
        <Field name="last_name" labelText="Surname">
          <input
            id="last_name"
            name="last_name"
            defaultValue={d.last_name}
            className={field}
          />
        </Field>
        <Field name="address_village" labelText="Village">
          <input
            id="address_village"
            name="address_village"
            defaultValue={d.address_village}
            className={field}
          />
        </Field>
        <Field name="address_post" labelText="Post office">
          <input
            id="address_post"
            name="address_post"
            defaultValue={d.address_post}
            className={field}
          />
        </Field>
        <Field name="address_taluka" labelText="Taluka">
          <input
            id="address_taluka"
            name="address_taluka"
            defaultValue={d.address_taluka}
            className={field}
          />
        </Field>
        <Field name="address_district" labelText="District">
          <input
            id="address_district"
            name="address_district"
            defaultValue={d.address_district}
            className={field}
          />
        </Field>
        <Field name="mobile1" labelText="Mobile number 1">
          <input
            id="mobile1"
            name="mobile1"
            inputMode="tel"
            defaultValue={d.mobile1}
            className={field}
          />
        </Field>
        <Field name="mobile2" labelText="Mobile number 2">
          <input
            id="mobile2"
            name="mobile2"
            inputMode="tel"
            defaultValue={d.mobile2}
            className={field}
          />
        </Field>
      </Section>

      <Section title="Loan details">
        <EmiDateFields
          purchaseDefault={d.purchase_date ?? today}
          firstEmiDefault={d.first_emi_date}
        />
        <Field name="bank_id" labelText="Bank assigned *">
          <select
            id="bank_id"
            name="bank_id"
            required
            defaultValue={d.bank_id}
            className={field}
          >
            {banks.length !== 1 && !d.bank_id ? (
              <option value="">Select a bank…</option>
            ) : null}
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
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
            defaultValue={d.principal}
            className={field}
          />
        </Field>
        <Field name="emi" labelText="Installment / EMI (₹) *">
          <input
            id="emi"
            name="emi"
            type="number"
            min={1}
            step="1"
            required
            inputMode="numeric"
            defaultValue={d.emi}
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
            defaultValue={d.tenure_months}
            className={field}
          />
        </Field>
      </Section>

      <details
        open={extrasFilled}
        className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
      >
        <summary className="cursor-pointer text-sm font-semibold">
          Vehicle &amp; guarantor (optional)
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">
          Not in the loan book — fill only if you have these. Engine numbers can
          be added later; the record is flagged incomplete until they are.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field name="aadhaar" labelText="Aadhaar / ID reference">
            <input
              id="aadhaar"
              name="aadhaar"
              defaultValue={d.aadhaar}
              className={field}
            />
          </Field>
          <Field name="vehicle_name" labelText="Vehicle name">
            <input
              id="vehicle_name"
              name="vehicle_name"
              defaultValue={d.vehicle_name}
              className={field}
            />
          </Field>
          <Field name="rc_no" labelText="RC number">
            <input
              id="rc_no"
              name="rc_no"
              defaultValue={d.rc_no}
              className={field}
            />
          </Field>
          <Field name="chassis_no" labelText="Chassis number">
            <input
              id="chassis_no"
              name="chassis_no"
              defaultValue={d.chassis_no}
              className={field}
            />
          </Field>
          <Field name="engine_no_1" labelText="Engine number 1">
            <input
              id="engine_no_1"
              name="engine_no_1"
              defaultValue={d.engine_no_1}
              className={field}
            />
          </Field>
          <Field name="engine_no_2" labelText="Engine number 2">
            <input
              id="engine_no_2"
              name="engine_no_2"
              defaultValue={d.engine_no_2}
              className={field}
            />
          </Field>
          <Field name="g_name" labelText="Guarantor name">
            <input
              id="g_name"
              name="g_name"
              defaultValue={d.g_name}
              className={field}
            />
          </Field>
          <Field name="g_mobile" labelText="Guarantor mobile">
            <input
              id="g_mobile"
              name="g_mobile"
              inputMode="tel"
              defaultValue={d.g_mobile}
              className={field}
            />
          </Field>
          <Field name="g_address" labelText="Guarantor address" full>
            <input
              id="g_address"
              name="g_address"
              defaultValue={d.g_address}
              className={field}
            />
          </Field>
        </div>
      </details>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {cancelHref ? (
          <Link
            href={cancelHref}
            className="rounded-lg border border-border bg-surface px-4 py-2.5 text-center text-sm font-medium hover:bg-muted"
          >
            Cancel
          </Link>
        ) : null}
        <SubmitButton
          pendingLabel="Saving customer…"
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-70"
        >
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
