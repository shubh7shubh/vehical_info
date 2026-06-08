import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { createCustomerAction } from "@/app/dashboard/customers/new/actions";

type Bank = { id: string; name: string };

const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:text-sm";
const label =
  "mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground";

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
 * Shared customer onboarding form, modeled on the physical loan-book page
 * (account no, name, village/post/taluka/district, mobiles, model no, purchase
 * date, loan/installment/tenure). Used by both the employee "Add new customer"
 * page and the sub-ID bulk-entry dashboard. Vehicle/guarantor extras live in a
 * collapsed section since the book itself doesn't track them.
 */
export function LedgerCustomerForm({
  banks,
  today,
  error,
  cancelHref,
  submitLabel = "Save customer",
}: {
  banks: Bank[];
  today: string;
  error?: string;
  cancelHref?: string;
  submitLabel?: string;
}) {
  return (
    <form action={createCustomerAction} className="space-y-6">
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
            className={field}
          />
        </Field>
        <Field name="model_no" labelText="Model no.">
          <input id="model_no" name="model_no" className={field} />
        </Field>
        <Field name="first_name" labelText="Name *">
          <input id="first_name" name="first_name" required className={field} />
        </Field>
        <Field name="middle_name" labelText="Father / middle name">
          <input id="middle_name" name="middle_name" className={field} />
        </Field>
        <Field name="last_name" labelText="Surname">
          <input id="last_name" name="last_name" className={field} />
        </Field>
        <Field name="address_village" labelText="Village">
          <input id="address_village" name="address_village" className={field} />
        </Field>
        <Field name="address_post" labelText="Post office">
          <input id="address_post" name="address_post" className={field} />
        </Field>
        <Field name="address_taluka" labelText="Taluka">
          <input id="address_taluka" name="address_taluka" className={field} />
        </Field>
        <Field name="address_district" labelText="District">
          <input
            id="address_district"
            name="address_district"
            className={field}
          />
        </Field>
        <Field name="mobile1" labelText="Mobile number 1">
          <input id="mobile1" name="mobile1" inputMode="tel" className={field} />
        </Field>
        <Field name="mobile2" labelText="Mobile number 2">
          <input id="mobile2" name="mobile2" inputMode="tel" className={field} />
        </Field>
      </Section>

      <Section title="Loan details">
        <Field name="purchase_date" labelText="Purchase date *">
          <input
            id="purchase_date"
            name="purchase_date"
            type="date"
            required
            defaultValue={today}
            className={field}
          />
        </Field>
        <Field name="bank_id" labelText="Bank assigned *">
          <select id="bank_id" name="bank_id" required className={field}>
            {banks.length !== 1 ? (
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
      </Section>

      <details className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold">
          Vehicle &amp; guarantor (optional)
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">
          Not in the loan book — fill only if you have these. Engine numbers can
          be added later; the record is flagged incomplete until they are.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field name="aadhaar" labelText="Aadhaar / ID reference">
            <input id="aadhaar" name="aadhaar" className={field} />
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
