import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, CheckCircle2, Check } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/utils";
import { loanColor, monthsBehind, parseISODate } from "@/lib/loan-status";
import { StatusBadge } from "@/components/status-counts";
import { SubmitButton } from "@/components/submit-button";
import { logPaymentAction, addFollowupAction } from "./actions";

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
  signature: boolean;
  paid_at: string;
};
type Followup = {
  id: string;
  note: string;
  created_at: string;
};

const TABS = [
  { key: "customer", label: "Customer" },
  { key: "vehicle", label: "Vehicle" },
  { key: "guarantor", label: "Guarantor" },
  { key: "loan", label: "Loan" },
  { key: "emi", label: "EMI History" },
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
const inputLabel =
  "mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground";

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

export default async function CustomerCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; ok?: string; error?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { tab, ok, error } = await searchParams;
  const activeTab: TabKey = TABS.some((t) => t.key === tab)
    ? (tab as TabKey)
    : "customer";

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("customers")
    .select(
      "id, first_name, middle_name, last_name, account_no, address_village, address_post, address_taluka, address_district, model_no, purchase_date, mobiles, aadhaar, created_at, banks(name), vehicles(vehicle_name, rc_no, engine_no_1, engine_no_2, chassis_no), guarantors(name, mobile, address), loans(id, principal_paise, emi_paise, tenure_months, due_day, grace_days, penalty_type, penalty_rate_paise, status, started_at, closed_at)",
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

  // Payments + follow-ups for the installment registry.
  let payments: Payment[] = [];
  if (activeLoan) {
    const { data: pdata } = await supabase
      .from("payments")
      .select(
        "id, amount_paise, penalty_paise, mode, month_no, receipt_no, signature, paid_at",
      )
      .eq("loan_id", activeLoan.id)
      .order("paid_at", { ascending: true })
      .returns<Payment[]>();
    payments = pdata ?? [];
  }
  const { data: fData } = await supabase
    .from("followups")
    .select("id, note, created_at")
    .eq("customer_id", id)
    .order("created_at", { ascending: false })
    .returns<Followup[]>();
  const followups = fData ?? [];

  const paidCount = payments.length;
  const color = activeLoan
    ? loanColor({
        purchaseDate: customer.purchase_date,
        tenureMonths: activeLoan.tenure_months,
        paidCount,
      })
    : null;
  const behind =
    activeLoan && customer.purchase_date
      ? monthsBehind(
          parseISODate(customer.purchase_date),
          new Date(),
          activeLoan.tenure_months,
          paidCount,
        )
      : 0;
  const place =
    [customer.address_village, customer.address_taluka, customer.address_district]
      .filter(Boolean)
      .join(", ") || "Address not recorded";

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/dashboard/customers"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <ArrowLeft size={14} /> All customers
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
          {ok ? (
            <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>{decodeURIComponent(ok)}</span>
            </div>
          ) : null}
          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{decodeURIComponent(error)}</span>
            </div>
          ) : null}

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
                    of {activeLoan.tenure_months}
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
                </div>

                <form
                  action={logPaymentAction}
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
                >
                  <input type="hidden" name="customer_id" value={customer.id} />
                  <div>
                    <label htmlFor="month_no" className={inputLabel}>
                      Month #
                    </label>
                    <input
                      id="month_no"
                      name="month_no"
                      type="number"
                      min={1}
                      max={activeLoan.tenure_months}
                      defaultValue={paidCount + 1}
                      inputMode="numeric"
                      className={input}
                    />
                  </div>
                  <div>
                    <label htmlFor="paid_at" className={inputLabel}>
                      Date *
                    </label>
                    <input
                      id="paid_at"
                      name="paid_at"
                      type="date"
                      required
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className={input}
                    />
                  </div>
                  <div>
                    <label htmlFor="installment" className={inputLabel}>
                      Installment (₹) *
                    </label>
                    <input
                      id="installment"
                      name="installment"
                      type="number"
                      min={1}
                      step="1"
                      required
                      defaultValue={Math.round(activeLoan.emi_paise / 100)}
                      inputMode="numeric"
                      className={input}
                    />
                  </div>
                  <div>
                    <label htmlFor="penalty" className={inputLabel}>
                      Penalty (₹)
                    </label>
                    <input
                      id="penalty"
                      name="penalty"
                      type="number"
                      min={0}
                      step="1"
                      defaultValue={0}
                      inputMode="numeric"
                      className={input}
                    />
                  </div>
                  <div>
                    <label htmlFor="receipt_no" className={inputLabel}>
                      Receipt no.
                    </label>
                    <input id="receipt_no" name="receipt_no" className={input} />
                  </div>
                  <div>
                    <label htmlFor="mode" className={inputLabel}>
                      Mode
                    </label>
                    <select
                      id="mode"
                      name="mode"
                      defaultValue="cash"
                      className={input}
                    >
                      <option value="cash">Cash</option>
                      <option value="online">Online</option>
                    </select>
                  </div>
                  <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-3 lg:col-span-4">
                    <input
                      type="checkbox"
                      name="signature"
                      className="h-4 w-4 rounded border-border"
                    />
                    Signature taken
                  </label>
                  <SubmitButton
                    pendingLabel="Recording…"
                    className="col-span-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-70 sm:col-span-3 lg:col-span-2"
                  >
                    Record installment
                  </SubmitButton>
                </form>
              </Panel>

              <Panel title="Payments">
                {payments.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-surface-muted text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Sr</th>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Month</th>
                          <th className="px-3 py-2 text-right">Installment</th>
                          <th className="px-3 py-2 text-right">Penalty</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-left">Receipt</th>
                          <th className="px-3 py-2 text-center">Sign</th>
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
