import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Check,
  IndianRupee,
  Pencil,
  Printer,
  ReceiptText,
} from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/utils";
import { categorize, resolveFirstEmi } from "@/lib/loan-status";
import { StatusBadge } from "@/components/status-counts";
import { SubmitButton } from "@/components/submit-button";
import { PaymentEntryForm } from "@/components/payment-entry-form";
import {
  logPaymentAction,
  addFollowupAction,
  setPenaltyChargeAction,
  amendPaymentAction,
  voidPaymentAction,
} from "./actions";

type OneOrMany<T> = T | T[] | null;
function one<T>(v: OneOrMany<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
function many<T>(v: OneOrMany<T>): T[] {
  return Array.isArray(v) ? v : v ? [v] : [];
}

type Vehicle = {
  vehicle_name: string | null;
  rc_no: string | null;
  engine_no_1: string | null;
  engine_no_2: string | null;
  chassis_no: string | null;
};
type Guarantor = {
  name: string;
  mobile: string | null;
  address: string | null;
};
type Loan = {
  id: string;
  principal_paise: number;
  emi_paise: number;
  tenure_months: number;
  due_day: number;
  grace_days: number;
  penalty_type: string;
  penalty_rate_paise: number;
  status: string;
  started_at: string;
  first_emi_date: string | null;
  closed_at: string | null;
};
type Customer = {
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
  created_at: string;
  banks: OneOrMany<{ name: string }>;
  vehicles: OneOrMany<Vehicle>;
  guarantors: OneOrMany<Guarantor>;
  loans: OneOrMany<Loan>;
};
type Payment = {
  id: string;
  amount_paise: number;
  penalty_paise: number;
  mode: string;
  month_no: number | null;
  receipt_no: string | null;
  invoice_no: string | null;
  remark: string | null;
  signature: boolean;
  paid_at: string;
};
type Followup = {
  id: string;
  note: string;
  created_at: string;
};
/** One row of the `loan_balances` view — the canonical money read model. */
type LoanBalances = {
  emi_collected_paise: number;
  penalty_collected_paise: number;
  penalty_charged_paise: number;
  installments_due: number;
  installments_settled: number;
  installments_pending: number;
  months_behind: number;
  emi_overdue_paise: number;
  emi_remaining_paise: number;
  advance_paise: number;
  penalty_balance_paise: number;
  pending_month_no: number | null;
  pending_month_balance_paise: number;
  outstanding_paise: number;
  loan_balance_paise: number;
  next_due_date: string | null;
};
/** A row of the penalty ledger (public.penalties). */
type PenaltyCharge = {
  id: string;
  month_no: number | null;
  period_start: string;
  period_end: string;
  amount_paise: number;
  source: string;
  note: string | null;
  waived_at: string | null;
};

const TABS = [
  { key: "customer", label: "Customer" },
  { key: "vehicle", label: "Vehicle" },
  { key: "guarantor", label: "Guarantor" },
  { key: "loan", label: "Loan" },
  { key: "emi", label: "EMI / Payments" },
  { key: "status", label: "Foreclosure / Seizure" },
  { key: "docs", label: "Documents & Keys" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const penaltyLabel: Record<string, string> = {
  per_day: "Per day",
  monthly_fixed: "Monthly fixed",
};

const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:text-sm";

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("en-IN") : "—";
}
function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-border py-2.5 last:border-0">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-2 text-sm text-muted-foreground">{text}</p>;
}

/** One figure in the balances strip on the EMI tab. */
function Money({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`tabular-nums ${strong ? "text-base font-bold" : "text-sm font-medium"}`}
      >
        {value}
      </dd>
    </div>
  );
}

export default async function CustomerCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    ok?: string;
    error?: string;
    receipt?: string;
  }>;
}) {
  const me = await requireUser();
  const { id } = await params;
  const { tab, ok, error, receipt } = await searchParams;
  const activeTab: TabKey = TABS.some((t) => t.key === tab)
    ? (tab as TabKey)
    : "customer";

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("customers")
    .select(
      "id, first_name, middle_name, last_name, account_no, address_village, address_post, address_taluka, address_district, model_no, purchase_date, mobiles, aadhaar, created_at, banks(name), vehicles(vehicle_name, rc_no, engine_no_1, engine_no_2, chassis_no), guarantors(name, mobile, address), loans(id, principal_paise, emi_paise, tenure_months, due_day, grace_days, penalty_type, penalty_rate_paise, status, started_at, first_emi_date, closed_at)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const customer = data as Customer | null;
  if (!customer) notFound();

  const vehicle = one(customer.vehicles);
  const guarantors = many(customer.guarantors);
  const loans = many(customer.loans);
  const activeLoan = loans.find((l) => l.status === "active") ?? loans[0] ?? null;
  const bankName = one(customer.banks)?.name ?? null;
  const fullName = [
    customer.first_name,
    customer.middle_name,
    customer.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  const engineMissing =
    !vehicle || !vehicle.engine_no_1 || vehicle.engine_no_1.trim() === "";

  // Bring the penalty ledger up to date before reading balances, so a customer
  // who has not paid in months still shows the penalty they have accrued rather
  // than waiting for the next collection or the nightly sweep. Idempotent, and a
  // no-op for read-only roles (the owner never triggers a write). Deliberately
  // ignoring the error: a penalty-engine hiccup must not 500 the customer card.
  if (activeLoan) {
    await supabase.rpc("accrue_penalties", { p_loan_id: activeLoan.id });
  }

  // Payments + follow-ups for the installment registry.
  let payments: Payment[] = [];
  let balances: LoanBalances | null = null;
  let penaltyCharges: PenaltyCharge[] = [];
  if (activeLoan) {
    const { data: pdata } = await supabase
      .from("payments")
      .select(
        "id, amount_paise, penalty_paise, mode, month_no, receipt_no, invoice_no, remark, signature, paid_at",
      )
      .eq("loan_id", activeLoan.id)
      .is("deleted_at", null)
      .order("paid_at", { ascending: true })
      .returns<Payment[]>();
    payments = pdata ?? [];

    // The one place loan money is computed (see the loan_balances view).
    const { data: bdata } = await supabase
      .from("loan_balances")
      .select("*")
      .eq("loan_id", activeLoan.id)
      .maybeSingle();
    balances = (bdata as LoanBalances | null) ?? null;

    const { data: cdata } = await supabase
      .from("penalties")
      .select(
        "id, month_no, period_start, period_end, amount_paise, source, note, waived_at",
      )
      .eq("loan_id", activeLoan.id)
      .order("period_start", { ascending: true })
      .returns<PenaltyCharge[]>();
    penaltyCharges = cdata ?? [];
  }
  const { data: fData } = await supabase
    .from("followups")
    .select("id, note, created_at")
    .eq("customer_id", id)
    .order("created_at", { ascending: false })
    .returns<Followup[]>();
  const followups = fData ?? [];

  // Money is counted, not rows: two half-EMIs are one settled installment.
  const paidCount = balances?.installments_settled ?? 0;
  // The schedule is anchored on the first EMI date (falls back to purchase + 1
  // month for records created before Phase 4.5) — same rule as the DB.
  const firstEmi = activeLoan
    ? resolveFirstEmi(customer.purchase_date, activeLoan.first_emi_date)
    : null;
  const behind = balances?.months_behind ?? 0;
  const color = activeLoan && firstEmi ? categorize(behind) : null;
  const pendingCount = balances?.installments_pending ?? 0;
  const nextDue = balances?.next_due_date
    ? new Date(balances.next_due_date)
    : null;
  const penaltyBalance = balances?.penalty_balance_paise ?? 0;
  const canEdit = me.role === "admin" || me.role === "employee";
  const isAdmin = me.role === "admin";
  const place =
    [customer.address_village, customer.address_taluka, customer.address_district]
      .filter(Boolean)
      .join(", ") || "Address not recorded";

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{fullName}</h1>
          {customer.account_no ? (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
              A/c {customer.account_no}
            </span>
          ) : null}
          {color ? <StatusBadge color={color} /> : null}
          {engineMissing ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
              <AlertTriangle size={10} /> Record incomplete — engine details
              missing
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {place}
          {bankName ? ` · ${bankName}` : ""}
        </p>
      </div>

      {/* Action bar — the client couldn't find where to record an EMI, and asked
          for Edit / Print / Invoice Print on every customer page. */}
      <div className="flex flex-wrap gap-2 print:hidden">
        {activeLoan ? (
          <Link
            href={`/dashboard/customers/${customer.id}?tab=emi`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover"
          >
            <IndianRupee size={16} /> Record EMI payment
          </Link>
        ) : null}
        {canEdit ? (
          <Link
            href={`/dashboard/customers/${customer.id}/edit`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <Pencil size={16} /> Edit
          </Link>
        ) : null}
        <Link
          href={`/dashboard/customers/${customer.id}/print`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <Printer size={16} /> Print
        </Link>
        {payments.length ? (
          <Link
            href={`/dashboard/customers/${customer.id}/receipt/latest`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <ReceiptText size={16} /> Invoice print
          </Link>
        ) : null}
      </div>

      {/* Flash messages live outside the tabs so an edit / payment confirmation
          is visible whichever tab you land on. */}
      {ok ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success print:hidden">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            {decodeURIComponent(ok)}
          </span>
          {receipt ? (
            <Link
              href={`/dashboard/customers/${customer.id}/receipt/${receipt}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              <Printer size={14} /> Print receipt
            </Link>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger print:hidden">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{decodeURIComponent(error)}</span>
        </div>
      ) : null}

      {/* Tab strip — horizontally scrollable on mobile */}
      <div className="overflow-x-auto">
        <nav className="flex min-w-max gap-1 border-b border-border">
          {TABS.map((t) => {
            const active = t.key === activeTab;
            return (
              <Link
                key={t.key}
                href={`/dashboard/customers/${customer.id}?tab=${t.key}`}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "border-accent text-accent"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {activeTab === "customer" ? (
        <Panel title="Customer details">
          <dl>
            <Detail label="Account number" value={customer.account_no} />
            <Detail label="Full name" value={fullName} />
            <Detail label="Village" value={customer.address_village} />
            <Detail label="Post office" value={customer.address_post} />
            <Detail label="Taluka" value={customer.address_taluka} />
            <Detail label="District" value={customer.address_district} />
            <Detail
              label="Mobile number(s)"
              value={
                customer.mobiles.length ? customer.mobiles.join(" · ") : null
              }
            />
            <Detail label="Model no." value={customer.model_no} />
            <Detail label="Aadhaar / ID" value={customer.aadhaar} />
            <Detail label="Bank assigned" value={bankName} />
            <Detail
              label="Purchase date"
              value={fmtDate(customer.purchase_date)}
            />
            <Detail label="Record created" value={fmtDate(customer.created_at)} />
          </dl>
        </Panel>
      ) : null}

      {activeTab === "vehicle" ? (
        <Panel title="Vehicle details">
          {vehicle ? (
            <dl>
              <Detail
                label="Vehicle name / model"
                value={vehicle.vehicle_name}
              />
              <Detail label="RC number" value={vehicle.rc_no} />
              <Detail
                label="Engine number 1"
                value={
                  vehicle.engine_no_1 || (
                    <span className="text-warning">Missing</span>
                  )
                }
              />
              <Detail label="Engine number 2" value={vehicle.engine_no_2} />
              <Detail label="Chassis number" value={vehicle.chassis_no} />
            </dl>
          ) : (
            <Empty text="No vehicle recorded for this customer." />
          )}
        </Panel>
      ) : null}

      {activeTab === "guarantor" ? (
        <Panel title="Guarantor details">
          {guarantors.length ? (
            <div className="space-y-4">
              {guarantors.map((g, i) => (
                <dl key={i}>
                  <Detail label="Name" value={g.name} />
                  <Detail label="Mobile" value={g.mobile} />
                  <Detail label="Address" value={g.address} />
                </dl>
              ))}
            </div>
          ) : (
            <Empty text="No guarantor recorded for this customer." />
          )}
        </Panel>
      ) : null}

      {activeTab === "loan" ? (
        <Panel title="Loan summary">
          {loans.length ? (
            <div className="space-y-5">
              {loans.map((l) => (
                <dl key={l.id}>
                  <Detail
                    label="Loan amount"
                    value={formatINR(l.principal_paise)}
                  />
                  <Detail label="Installment / EMI" value={formatINR(l.emi_paise)} />
                  <Detail label="Tenure" value={`${l.tenure_months} months`} />
                  <Detail
                    label="First EMI date"
                    value={fmtDate(
                      l.first_emi_date ??
                        (customer.purchase_date
                          ? (resolveFirstEmi(customer.purchase_date)
                              ?.toISOString()
                              .slice(0, 10) ?? null)
                          : null),
                    )}
                  />
                  <Detail
                    label="EMI due day"
                    value={`Day ${l.due_day} of each month`}
                  />
                  <Detail label="Grace period" value={`${l.grace_days} days`} />
                  <Detail
                    label="Penalty"
                    value={`${penaltyLabel[l.penalty_type] ?? l.penalty_type} · ${formatINR(l.penalty_rate_paise)}`}
                  />
                  <Detail label="Loan started" value={fmtDate(l.started_at)} />
                  <Detail
                    label="Status"
                    value={<span className="capitalize">{l.status}</span>}
                  />
                </dl>
              ))}
            </div>
          ) : (
            <Empty text="No loan recorded for this customer." />
          )}
        </Panel>
      ) : null}

      {activeTab === "emi" ? (
        <div className="space-y-5">
          {!activeLoan ? (
            <Panel title="EMI history">
              <Empty text="No active loan on record — add the loan first." />
            </Panel>
          ) : (
            <>
              <Panel title="Installment registry">
                <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
                  {color ? <StatusBadge color={color} /> : null}
                  <span className="text-muted-foreground">
                    Paid <strong className="text-foreground">{paidCount}</strong>{" "}
                    of {activeLoan.tenure_months} ·{" "}
                    <strong className="text-foreground">{pendingCount}</strong>{" "}
                    pending
                    {behind > 0 ? (
                      <>
                        {" "}
                        ·{" "}
                        <strong className="text-foreground">
                          {behind}
                        </strong>{" "}
                        behind
                      </>
                    ) : null}
                  </span>
                  {nextDue ? (
                    <span className="text-muted-foreground">
                      Next due{" "}
                      <strong className="text-foreground">
                        {nextDue.toLocaleDateString("en-IN")}
                      </strong>
                    </span>
                  ) : null}
                </div>

                {/* Recordings 11/12/14 — what the customer owes, at a glance. */}
                {balances ? (
                  <dl className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-muted p-3 sm:grid-cols-4">
                    <Money
                      label={
                        balances.pending_month_no
                          ? `Balance on EMI #${balances.pending_month_no}`
                          : "Loan complete"
                      }
                      value={
                        balances.pending_month_no
                          ? formatINR(balances.pending_month_balance_paise)
                          : "—"
                      }
                    />
                    <Money
                      label="EMI overdue"
                      value={formatINR(balances.emi_overdue_paise)}
                    />
                    <Money
                      label="Penalty balance"
                      value={formatINR(balances.penalty_balance_paise)}
                    />
                    <Money
                      label="Total outstanding"
                      value={formatINR(balances.loan_balance_paise)}
                      strong
                    />
                  </dl>
                ) : null}

                <PaymentEntryForm
                  action={logPaymentAction}
                  customerId={customer.id}
                  emiPaise={activeLoan.emi_paise}
                  tenureMonths={activeLoan.tenure_months}
                  emiCollectedPaise={balances?.emi_collected_paise ?? 0}
                  emiOverduePaise={balances?.emi_overdue_paise ?? 0}
                  penaltyChargedPaise={balances?.penalty_charged_paise ?? 0}
                  penaltyCollectedPaise={balances?.penalty_collected_paise ?? 0}
                  today={new Date().toISOString().slice(0, 10)}
                />

                <p className="mt-3 text-xs text-muted-foreground">
                  Enter the cash the customer actually handed over — the split
                  across penalty and instalment is filled in for you and stays
                  editable. A printable receipt is created every time, and the
                  Print receipt button appears as soon as you save.
                </p>
              </Panel>

              {/* Recording 13 — a penalty-only receipt, kept separate so the
                  employee cannot confuse it with a normal collection. */}
              {penaltyBalance > 0 ? (
                <Panel title="Pay penalty only">
                  <p className="mb-3 text-sm text-muted-foreground">
                    Outstanding penalty{" "}
                    <strong className="text-foreground">
                      {formatINR(penaltyBalance)}
                    </strong>
                    . Use this when the customer is paying part or all of the
                    penalty without an instalment.
                  </p>
                  <PaymentEntryForm
                    action={logPaymentAction}
                    customerId={customer.id}
                    emiPaise={activeLoan.emi_paise}
                    tenureMonths={activeLoan.tenure_months}
                    emiCollectedPaise={balances?.emi_collected_paise ?? 0}
                    emiOverduePaise={balances?.emi_overdue_paise ?? 0}
                    penaltyChargedPaise={balances?.penalty_charged_paise ?? 0}
                    penaltyCollectedPaise={
                      balances?.penalty_collected_paise ?? 0
                    }
                    today={new Date().toISOString().slice(0, 10)}
                    penaltyOnly
                  />
                </Panel>
              ) : null}

              {/* Recording 10 — increase / decrease / waive a penalty. Admin
                  only; employees see the ledger read-only. */}
              <Panel title="Penalty ledger">
                {penaltyCharges.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Month</th>
                          <th className="px-3 py-2 text-left">Period</th>
                          <th className="px-3 py-2 text-left">Source</th>
                          <th className="px-3 py-2 text-right">Charged</th>
                          {isAdmin ? (
                            <th className="px-3 py-2 text-right">Change</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {penaltyCharges.map((pc) => (
                          <tr key={pc.id} className="border-t border-border">
                            <td className="px-3 py-2">{pc.month_no ?? "—"}</td>
                            <td className="px-3 py-2">
                              {fmtDate(pc.period_start)}
                            </td>
                            <td className="px-3 py-2">
                              {pc.waived_at ? (
                                <span className="text-muted-foreground">
                                  Waived
                                </span>
                              ) : pc.source === "manual" ? (
                                "Manual"
                              ) : (
                                "Automatic"
                              )}
                            </td>
                            <td
                              className={`px-3 py-2 text-right ${
                                pc.waived_at
                                  ? "text-muted-foreground line-through"
                                  : "font-medium"
                              }`}
                            >
                              {formatINR(pc.amount_paise)}
                            </td>
                            {isAdmin ? (
                              <td className="px-3 py-2">
                                <form
                                  action={setPenaltyChargeAction}
                                  className="flex items-center justify-end gap-1.5"
                                >
                                  <input
                                    type="hidden"
                                    name="customer_id"
                                    value={customer.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="penalty_id"
                                    value={pc.id}
                                  />
                                  <input
                                    name="amount"
                                    type="number"
                                    min={0}
                                    step="1"
                                    defaultValue={Math.round(
                                      pc.amount_paise / 100,
                                    )}
                                    inputMode="numeric"
                                    aria-label="Penalty amount in rupees"
                                    className="w-24 rounded-md border border-border bg-surface px-2 py-1.5 text-base sm:text-sm"
                                  />
                                  <SubmitButton
                                    pendingLabel="…"
                                    className="min-h-9 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-70"
                                  >
                                    Save
                                  </SubmitButton>
                                  <SubmitButton
                                    pendingLabel="…"
                                    formAction={setPenaltyChargeAction}
                                    name="waive"
                                    value={pc.waived_at ? "false" : "true"}
                                    className="min-h-9 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-70"
                                  >
                                    {pc.waived_at ? "Restore" : "Waive"}
                                  </SubmitButton>
                                </form>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty text="No penalty has been charged on this loan." />
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  A penalty of{" "}
                  <strong className="text-foreground">
                    {formatINR(activeLoan.penalty_rate_paise)}
                  </strong>{" "}
                  is charged automatically for every instalment still short{" "}
                  {activeLoan.grace_days} day
                  {activeLoan.grace_days === 1 ? "" : "s"} after it falls due.
                  {isAdmin
                    ? " You can change or waive any charge above."
                    : " Only a branch admin can change or waive a charge."}
                </p>
              </Panel>

              <Panel title="Payments">
                {payments.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-sm">
                      <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Sr</th>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Month</th>
                          <th className="px-3 py-2 text-right">Instalment</th>
                          <th className="px-3 py-2 text-right">Penalty</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-left">Remark</th>
                          <th className="px-3 py-2 text-left">Book no.</th>
                          <th className="px-3 py-2 text-center">Sign</th>
                          <th className="px-3 py-2 text-center">Receipt no.</th>
                          {isAdmin ? (
                            <th className="px-3 py-2 text-center">Correct</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p, i) => (
                          <tr key={p.id} className="border-t border-border">
                            <td className="px-3 py-2">{i + 1}</td>
                            <td className="px-3 py-2">{fmtDate(p.paid_at)}</td>
                            <td className="px-3 py-2">{p.month_no ?? "—"}</td>
                            <td className="px-3 py-2 text-right">
                              {formatINR(p.amount_paise)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {p.penalty_paise
                                ? formatINR(p.penalty_paise)
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {formatINR(p.amount_paise + p.penalty_paise)}
                            </td>
                            <td
                              className="max-w-[180px] truncate px-3 py-2 text-muted-foreground"
                              title={p.remark ?? undefined}
                            >
                              {p.remark ?? "—"}
                            </td>
                            <td className="px-3 py-2">{p.receipt_no ?? "—"}</td>
                            <td className="px-3 py-2 text-center">
                              {p.signature ? (
                                <Check
                                  size={14}
                                  className="mx-auto text-success"
                                />
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Link
                                href={`/dashboard/customers/${customer.id}/receipt/${p.id}`}
                                title={`Print receipt ${p.invoice_no ?? ""}`}
                                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-accent hover:bg-muted"
                              >
                                <Printer size={13} />
                                {p.invoice_no ?? "Print"}
                              </Link>
                            </td>
                            {/* Recording 13 — a recorded receipt may only be
                                changed by an admin. Tucked behind a disclosure
                                so the grid stays readable. */}
                            {isAdmin ? (
                              <td className="px-3 py-2 text-center">
                                <details className="text-left">
                                  <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted">
                                    Edit
                                  </summary>
                                  <form
                                    action={amendPaymentAction}
                                    className="mt-2 flex flex-wrap items-end gap-1.5"
                                  >
                                    <input
                                      type="hidden"
                                      name="customer_id"
                                      value={customer.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="payment_id"
                                      value={p.id}
                                    />
                                    <input
                                      name="installment"
                                      type="number"
                                      min={0}
                                      step="1"
                                      defaultValue={Math.round(
                                        p.amount_paise / 100,
                                      )}
                                      aria-label="Instalment in rupees"
                                      className="w-24 rounded-md border border-border bg-surface px-2 py-1.5 text-base sm:text-sm"
                                    />
                                    <input
                                      name="penalty"
                                      type="number"
                                      min={0}
                                      step="1"
                                      defaultValue={Math.round(
                                        p.penalty_paise / 100,
                                      )}
                                      aria-label="Penalty in rupees"
                                      className="w-24 rounded-md border border-border bg-surface px-2 py-1.5 text-base sm:text-sm"
                                    />
                                    <input
                                      name="remark"
                                      defaultValue={p.remark ?? ""}
                                      placeholder="Remark"
                                      aria-label="Remark"
                                      className="w-32 rounded-md border border-border bg-surface px-2 py-1.5 text-base sm:text-sm"
                                    />
                                    <SubmitButton
                                      pendingLabel="…"
                                      className="min-h-9 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-70"
                                    >
                                      Save
                                    </SubmitButton>
                                    <SubmitButton
                                      pendingLabel="…"
                                      formAction={voidPaymentAction}
                                      title="Void this receipt — the row is kept, but its money leaves every balance"
                                      className="min-h-9 rounded-md border border-danger/40 px-2 py-1 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-70"
                                    >
                                      Void
                                    </SubmitButton>
                                  </form>
                                </details>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty text="No installments recorded yet." />
                )}
              </Panel>

              <Panel title="Follow-ups">
                <form action={addFollowupAction} className="mb-4 space-y-2">
                  <input type="hidden" name="customer_id" value={customer.id} />
                  <textarea
                    name="note"
                    rows={2}
                    required
                    placeholder="What did the customer say? (reason / promised date)"
                    className={input}
                  />
                  <div className="flex justify-end">
                    <SubmitButton
                      pendingLabel="Adding…"
                      className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-70"
                    >
                      Add follow-up
                    </SubmitButton>
                  </div>
                </form>
                {followups.length ? (
                  <ol className="space-y-3">
                    {followups.map((f) => (
                      <li
                        key={f.id}
                        className="rounded-lg border border-border bg-surface-muted px-3 py-2"
                      >
                        <div className="text-[11px] font-medium text-muted-foreground">
                          {fmtDateTime(f.created_at)}
                        </div>
                        <div className="mt-0.5 text-sm text-foreground">
                          {f.note}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty text="No follow-ups logged yet." />
                )}
              </Panel>
            </>
          )}
        </div>
      ) : null}

      {activeTab === "status" ? (
        <Panel title="Foreclosure / Seizure">
          <Empty text="No foreclosure or seizure on record for this customer." />
        </Panel>
      ) : null}

      {activeTab === "docs" ? (
        <Panel title="Documents & Keys">
          <Empty text="Document and key handover statuses are not recorded yet." />
        </Panel>
      ) : null}
    </div>
  );
}
