import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Gavel,
  Lock,
  Search,
  Unlock,
} from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/utils";
import { SubmitButton } from "@/components/submit-button";
import {
  recordForeclosureAction,
  settleForeclosureAction,
  recordSeizureAction,
  approveSeizureAction,
  exitSeizureAction,
} from "./actions";

/**
 * Foreclosure & Seizing — client feedback round 3, recordings 4 to 9.
 *
 * "Enter the customer's loan number and view all the relevant loan details",
 * with Add Foreclosure and Add Seizing on the same screen.
 *
 * On "loan number": there is no such column, and inventing one would hand the
 * branch an identifier that does not exist in their books. `customers.account_no`
 * IS the number they write down, and `search_customers` already matches it — so
 * the box is labelled "Loan / account number" and searches that.
 *
 * Six-month rule (recordings 5 and 6): Add Foreclosure is disabled, with the
 * eligible-from date in the label, until the loan is six months old. The RPC
 * re-checks — a disabled button is a courtesy, not a control.
 */

type SearchRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  account_no: string | null;
  address_village: string | null;
  mobiles: string[] | null;
};

type Lookup = {
  customer: {
    id: string;
    account_no: string | null;
    name: string;
    village: string | null;
    taluka: string | null;
    district: string | null;
    mobiles: string[] | null;
    model_no: string | null;
  };
  vehicle: {
    vehicle_name: string | null;
    rc_no: string | null;
    engine_no_1: string | null;
    chassis_no: string | null;
  } | null;
  loan: {
    id: string;
    principal_paise: number;
    emi_paise: number;
    tenure_months: number;
    started_at: string;
    first_emi_date: string | null;
    status: string;
  } | null;
  balances: {
    installments_settled: number;
    installments_pending: number;
    months_behind: number;
    emi_overdue_paise: number;
    emi_remaining_paise: number;
    penalty_balance_paise: number;
    outstanding_paise: number;
    loan_balance_paise: number;
    pending_month_no: number | null;
    next_due_date: string | null;
  } | null;
  foreclosure_quote: {
    eligible: boolean;
    eligible_from: string;
    months_elapsed: number;
    remaining_months: number;
    emi_outstanding_paise: number;
    penalty_balance_paise: number;
    total_interest_paise: number;
    remaining_interest_paise: number;
    interest_waived_paise: number;
    bank_charge_paise: number;
    final_payable_paise: number;
    customer_saving_paise: number;
  } | null;
  foreclosures: {
    id: string;
    calculated_at: string;
    final_payable_paise: number;
    interest_waived_paise: number;
    bank_charge_paise: number;
    paid_at: string | null;
    noc_issued_at: string | null;
  }[];
  seizures: {
    id: string;
    status: string;
    amount_paise: number;
    notes: string | null;
    created_at: string;
    approved_at: string | null;
    exited_at: string | null;
    exit_reason: string | null;
  }[];
};

type SeizedRow = {
  seizure_id: string;
  customer_id: string;
  account_no: string | null;
  name: string;
  status: string;
  amount_paise: number;
  created_at: string;
  days_held: number;
  outstanding_paise: number;
};

function fmtDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("en-IN") : "—";
}

function fullName(f: string, m: string | null, l: string | null): string {
  return [f, m, l].filter(Boolean).join(" ");
}

const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:text-sm";
const label =
  "mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground";
const primaryBtn =
  "inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50";
const outlineBtn =
  "inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({
  label: l,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-0 ${
        strong ? "text-sm font-bold" : "text-[13px]"
      }`}
    >
      <span className={strong ? "" : "text-muted-foreground"}>{l}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export default async function ForeclosurePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    customer?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const me = await requireUser();
  const { q, customer: customerId, ok, error } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const isAdmin = me.role === "admin";
  const canRecord = me.role === "admin" || me.role === "employee";

  // Search by loan / account number (or name, mobile, RC — same RPC the
  // customers page uses, so the branch does not have to learn a second box).
  let results: SearchRow[] = [];
  if (q && q.trim() && !customerId) {
    const { data } = await supabase.rpc("search_customers", { q: q.trim() });
    results = (data as SearchRow[] | null) ?? [];
  }

  let lookup: Lookup | null = null;
  if (customerId) {
    const { data } = await supabase.rpc("closure_lookup", {
      p_customer_id: customerId,
    });
    lookup = (data as Lookup | null) ?? null;
  }

  const { data: seizedData } = await supabase.rpc("seized_customers");
  const seized = (seizedData as SeizedRow[] | null) ?? [];

  const quote = lookup?.foreclosure_quote ?? null;
  const openForeclosure =
    lookup?.foreclosures.find((f) => f.paid_at === null) ?? null;
  const openSeizure =
    lookup?.seizures.find(
      (s) => s.status === "pending" || s.status === "active",
    ) ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Foreclosure &amp; Seizing
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Close a loan early, or record and release a seized vehicle.
        </p>
      </div>

      {ok ? (
        <div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>{decodeURIComponent(ok)}</span>
        </div>
      ) : null}
      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{decodeURIComponent(error)}</span>
        </div>
      ) : null}

      {/* ---- search (recordings 4 and 7) ---- */}
      <Panel title="Find the loan">
        <form
          action="/dashboard/foreclosure"
          method="get"
          className="flex flex-col gap-2 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Loan / account number"
              aria-label="Loan or account number"
              className={`${field} pl-9`}
            />
          </div>
          <button type="submit" className={primaryBtn}>
            Search
          </button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          This is the account number written in the book. Name, mobile, RC or
          engine number work too.
        </p>

        {results.length ? (
          <ul className="mt-4 divide-y divide-border">
            {results.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/foreclosure?customer=${r.id}`}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-muted"
                >
                  <span className="text-sm font-medium">
                    {r.account_no ? (
                      <span className="mr-2 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                        {r.account_no}
                      </span>
                    ) : null}
                    {fullName(r.first_name, r.middle_name, r.last_name)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[r.address_village, (r.mobiles ?? [])[0]]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : q && !customerId ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No customer matched “{q}”.
          </p>
        ) : null}
      </Panel>

      {/* ---- the loan detail + the two actions ---- */}
      {lookup ? (
        <>
          <Panel
            title="Loan details"
            action={
              <Link
                href={`/dashboard/customers/${lookup.customer.id}`}
                className="text-xs font-medium text-accent underline"
              >
                Open customer card
              </Link>
            }
          >
            <div className="mb-3 flex flex-wrap items-baseline gap-2">
              {lookup.customer.account_no ? (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                  A/c {lookup.customer.account_no}
                </span>
              ) : null}
              <span className="text-base font-semibold">
                {lookup.customer.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {[
                  lookup.customer.village,
                  lookup.customer.taluka,
                  lookup.customer.district,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </div>

            {lookup.loan && lookup.balances ? (
              <div className="grid gap-x-6 sm:grid-cols-2">
                <div>
                  <Row
                    label="Loan amount"
                    value={formatINR(lookup.loan.principal_paise)}
                  />
                  <Row
                    label="Instalment / EMI"
                    value={formatINR(lookup.loan.emi_paise)}
                  />
                  <Row
                    label="Tenure"
                    value={`${lookup.loan.tenure_months} months`}
                  />
                  <Row
                    label="Loan start date"
                    value={fmtDate(lookup.loan.started_at)}
                  />
                  <Row
                    label="First EMI date"
                    value={fmtDate(lookup.loan.first_emi_date)}
                  />
                  <Row
                    label="Vehicle"
                    value={
                      [
                        lookup.vehicle?.vehicle_name ?? lookup.customer.model_no,
                        lookup.vehicle?.rc_no,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"
                    }
                  />
                </div>
                <div>
                  <Row
                    label="Instalments paid"
                    value={`${lookup.balances.installments_settled} of ${lookup.loan.tenure_months}`}
                  />
                  <Row
                    label="Months behind"
                    value={String(lookup.balances.months_behind)}
                  />
                  <Row
                    label="EMI overdue"
                    value={formatINR(lookup.balances.emi_overdue_paise)}
                  />
                  <Row
                    label="Penalty balance"
                    value={formatINR(lookup.balances.penalty_balance_paise)}
                  />
                  <Row
                    label="Loan status"
                    value={
                      <span className="capitalize">{lookup.loan.status}</span>
                    }
                  />
                  <Row
                    label="Total outstanding"
                    value={formatINR(lookup.balances.loan_balance_paise)}
                    strong
                  />
                </div>
              </div>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">
                No loan on record for this customer.
              </p>
            )}
          </Panel>

          {/* ---- Foreclosure (recordings 4, 5, 6) ---- */}
          <Panel title="Foreclosure">
            {!lookup.loan ? (
              <p className="py-2 text-sm text-muted-foreground">
                No loan to foreclose.
              </p>
            ) : lookup.loan.status !== "active" ? (
              <p className="py-2 text-sm text-muted-foreground">
                This loan is already{" "}
                <span className="font-medium capitalize">
                  {lookup.loan.status}
                </span>
                .
              </p>
            ) : quote ? (
              <>
                {!quote.eligible ? (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning">
                    <Lock size={15} className="mt-0.5 shrink-0" />
                    <span>
                      Foreclosure opens six months after the loan start date.
                      This loan is{" "}
                      <strong>{quote.months_elapsed} month
                      {quote.months_elapsed === 1 ? "" : "s"}</strong> old —
                      eligible from{" "}
                      <strong>{fmtDate(quote.eligible_from)}</strong>.
                    </span>
                  </div>
                ) : null}

                <form
                  action={recordForeclosureAction}
                  className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                >
                  <input
                    type="hidden"
                    name="customer_id"
                    value={lookup.customer.id}
                  />
                  <input type="hidden" name="loan_id" value={lookup.loan.id} />

                  <div className="col-span-2 sm:col-span-4">
                    <div className="grid gap-x-6 sm:grid-cols-2">
                      <div>
                        <Row
                          label="Remaining months"
                          value={String(quote.remaining_months)}
                        />
                        <Row
                          label="EMI outstanding"
                          value={formatINR(quote.emi_outstanding_paise)}
                        />
                        <Row
                          label="Interest still scheduled"
                          value={formatINR(quote.remaining_interest_paise)}
                        />
                      </div>
                      <div>
                        <Row
                          label="Penalty balance"
                          value={formatINR(quote.penalty_balance_paise)}
                        />
                        <Row
                          label="Customer saves"
                          value={formatINR(quote.customer_saving_paise)}
                        />
                        <Row
                          label="Final payable"
                          value={formatINR(quote.final_payable_paise)}
                          strong
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="interest_waiver" className={label}>
                      Interest waived (₹)
                    </label>
                    <input
                      id="interest_waiver"
                      name="interest_waiver"
                      type="number"
                      min={0}
                      step="1"
                      defaultValue={Math.round(
                        quote.remaining_interest_paise / 100,
                      )}
                      inputMode="numeric"
                      className={field}
                    />
                  </div>
                  <div>
                    <label htmlFor="bank_charge" className={label}>
                      Bank charge (₹)
                    </label>
                    <input
                      id="bank_charge"
                      name="bank_charge"
                      type="number"
                      min={0}
                      step="1"
                      defaultValue={Math.round(quote.bank_charge_paise / 100)}
                      inputMode="numeric"
                      className={field}
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="fc_notes" className={label}>
                      Notes
                    </label>
                    <input id="fc_notes" name="notes" className={field} />
                  </div>

                  <div className="col-span-2 sm:col-span-4">
                    <SubmitButton
                      pendingLabel="Recording…"
                      disabled={!quote.eligible || !isAdmin || !!openForeclosure}
                      title={
                        !quote.eligible
                          ? `Available from ${fmtDate(quote.eligible_from)} — six months after the loan start date`
                          : !isAdmin
                            ? "Only a branch admin can record a foreclosure"
                            : openForeclosure
                              ? "This loan already has an unpaid foreclosure quote"
                              : undefined
                      }
                      className={primaryBtn}
                    >
                      <Gavel size={16} /> Add Foreclosure
                    </SubmitButton>
                    {!isAdmin ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Only a branch admin can record a foreclosure. You can see
                        the figures above.
                      </p>
                    ) : null}
                  </div>
                </form>

                <p className="mt-3 text-xs text-muted-foreground">
                  Interest is split straight-line across the tenure. The waiver
                  defaults to the whole remaining interest and the bank charge to{" "}
                  {formatINR(100000)} — change either before saving.
                </p>
              </>
            ) : null}

            {lookup.foreclosures.length ? (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Quoted</th>
                      <th className="px-3 py-2 text-right">Waived</th>
                      <th className="px-3 py-2 text-right">Bank charge</th>
                      <th className="px-3 py-2 text-right">Payable</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      {isAdmin ? (
                        <th className="px-3 py-2 text-right">Action</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {lookup.foreclosures.map((f) => (
                      <tr key={f.id} className="border-t border-border">
                        <td className="px-3 py-2">{fmtDate(f.calculated_at)}</td>
                        <td className="px-3 py-2 text-right">
                          {formatINR(f.interest_waived_paise)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatINR(f.bank_charge_paise)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatINR(f.final_payable_paise)}
                        </td>
                        <td className="px-3 py-2">
                          {f.paid_at ? (
                            <span className="text-success">
                              Paid {fmtDate(f.paid_at)}
                              {f.noc_issued_at ? " · NOC issued" : ""}
                            </span>
                          ) : (
                            <span className="text-warning">Unpaid</span>
                          )}
                        </td>
                        {isAdmin ? (
                          <td className="px-3 py-2 text-right">
                            {f.paid_at ? (
                              "—"
                            ) : (
                              <form
                                action={settleForeclosureAction}
                                className="flex items-center justify-end gap-2"
                              >
                                <input
                                  type="hidden"
                                  name="customer_id"
                                  value={lookup!.customer.id}
                                />
                                <input
                                  type="hidden"
                                  name="foreclosure_id"
                                  value={f.id}
                                />
                                <label className="flex items-center gap-1 text-xs">
                                  <input
                                    type="checkbox"
                                    name="noc_issued"
                                    className="h-4 w-4 rounded border-border"
                                  />
                                  NOC
                                </label>
                                <SubmitButton
                                  pendingLabel="…"
                                  className="min-h-9 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-70"
                                >
                                  Mark paid
                                </SubmitButton>
                              </form>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Panel>

          {/* ---- Seizing (recordings 7, 8, 9) ---- */}
          <Panel title="Seizing">
            {openSeizure ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                      openSeizure.status === "active"
                        ? "bg-danger-soft text-danger"
                        : "bg-warning-soft text-warning"
                    }`}
                  >
                    {openSeizure.status === "active"
                      ? "Seized"
                      : "Pending approval"}
                  </span>
                  <span className="text-muted-foreground">
                    Since {fmtDate(openSeizure.created_at)} ·{" "}
                    {formatINR(openSeizure.amount_paise)}
                    {openSeizure.notes ? ` · ${openSeizure.notes}` : ""}
                  </span>
                </div>

                {openSeizure.status === "pending" && isAdmin ? (
                  <form
                    action={approveSeizureAction}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input
                      type="hidden"
                      name="customer_id"
                      value={lookup.customer.id}
                    />
                    <input
                      type="hidden"
                      name="seizure_id"
                      value={openSeizure.id}
                    />
                    <div>
                      <label htmlFor="approve_amount" className={label}>
                        Final amount (₹)
                      </label>
                      <input
                        id="approve_amount"
                        name="amount"
                        type="number"
                        min={0}
                        step="1"
                        defaultValue={Math.round(
                          openSeizure.amount_paise / 100,
                        )}
                        inputMode="numeric"
                        className={`${field} w-36`}
                      />
                    </div>
                    <SubmitButton pendingLabel="Approving…" className={primaryBtn}>
                      Approve seizing
                    </SubmitButton>
                  </form>
                ) : null}

                {/* Recording 8 + 9 — admin only, and only once nothing is owed. */}
                <form
                  action={exitSeizureAction}
                  className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
                >
                  <input
                    type="hidden"
                    name="customer_id"
                    value={lookup.customer.id}
                  />
                  <input
                    type="hidden"
                    name="seizure_id"
                    value={openSeizure.id}
                  />
                  <div className="flex-1 sm:max-w-xs">
                    <label htmlFor="exit_reason" className={label}>
                      Reason
                    </label>
                    <input
                      id="exit_reason"
                      name="exit_reason"
                      placeholder="Cleared all dues"
                      className={field}
                    />
                  </div>
                  <SubmitButton
                    pendingLabel="Releasing…"
                    disabled={
                      !isAdmin ||
                      (lookup.balances?.outstanding_paise ?? 0) > 0
                    }
                    title={
                      !isAdmin
                        ? "Only a branch admin can remove a customer from seizing"
                        : (lookup.balances?.outstanding_paise ?? 0) > 0
                          ? `${formatINR(lookup.balances?.outstanding_paise ?? 0)} is still outstanding`
                          : undefined
                    }
                    className={outlineBtn}
                  >
                    <Unlock size={16} /> Exit Seizing
                  </SubmitButton>
                  {(lookup.balances?.outstanding_paise ?? 0) > 0 ? (
                    <p className="w-full text-xs text-muted-foreground">
                      <strong className="text-foreground">
                        {formatINR(lookup.balances?.outstanding_paise ?? 0)}
                      </strong>{" "}
                      is still outstanding (dues + penalty). The customer can only
                      leave seizing once that, and any recorded foreclosure
                      amount, is cleared.
                    </p>
                  ) : !isAdmin ? (
                    <p className="w-full text-xs text-muted-foreground">
                      Only a branch admin can remove a customer from seizing.
                    </p>
                  ) : null}
                </form>
              </div>
            ) : (
              <form
                action={recordSeizureAction}
                className="flex flex-wrap items-end gap-2"
              >
                <input
                  type="hidden"
                  name="customer_id"
                  value={lookup.customer.id}
                />
                <div>
                  <label htmlFor="seize_amount" className={label}>
                    Seizing charges (₹)
                  </label>
                  <input
                    id="seize_amount"
                    name="amount"
                    type="number"
                    min={0}
                    step="1"
                    defaultValue={1000}
                    inputMode="numeric"
                    className={`${field} w-36`}
                  />
                </div>
                <div className="flex-1 sm:max-w-xs">
                  <label htmlFor="seize_notes" className={label}>
                    Notes
                  </label>
                  <input
                    id="seize_notes"
                    name="notes"
                    placeholder="Towing, storage…"
                    className={field}
                  />
                </div>
                {isAdmin ? (
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="approve"
                      defaultChecked
                      className="h-4 w-4 rounded border-border"
                    />
                    Approve now
                  </label>
                ) : null}
                <SubmitButton
                  pendingLabel="Recording…"
                  disabled={!canRecord || !lookup.loan}
                  title={
                    !lookup.loan
                      ? "No active loan to seize against"
                      : undefined
                  }
                  className={primaryBtn}
                >
                  <Lock size={16} /> Add Seizing
                </SubmitButton>
                {!isAdmin ? (
                  <p className="w-full text-xs text-muted-foreground">
                    Your entry is saved as <strong>pending</strong> until a branch
                    admin approves the amount.
                  </p>
                ) : null}
              </form>
            )}

            {lookup.seizures.filter((s) => s.exited_at).length ? (
              <ul className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                {lookup.seizures
                  .filter((s) => s.exited_at)
                  .map((s) => (
                    <li key={s.id}>
                      Released {fmtDate(s.exited_at)}
                      {s.exit_reason ? ` — ${s.exit_reason}` : ""}
                    </li>
                  ))}
              </ul>
            ) : null}
          </Panel>
        </>
      ) : null}

      {/* ---- the branch's live seizure list ---- */}
      <Panel title="Currently seized">
        {seized.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">A/c</th>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Charges</th>
                  <th className="px-3 py-2 text-right">Outstanding</th>
                  <th className="px-3 py-2 text-right">Days held</th>
                </tr>
              </thead>
              <tbody>
                {seized.map((s) => (
                  <tr key={s.seizure_id} className="border-t border-border">
                    <td className="px-3 py-2">{s.account_no ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/dashboard/foreclosure?customer=${s.customer_id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 capitalize">
                      {s.status === "pending" ? "Pending approval" : "Seized"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatINR(s.amount_paise)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatINR(s.outstanding_paise)}
                    </td>
                    <td className="px-3 py-2 text-right">{s.days_held}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">
            No vehicle is under seizing right now.
          </p>
        )}
      </Panel>
    </div>
  );
}
