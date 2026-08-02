import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/utils";
import {
  monthsBehind,
  nextDueDate,
  remainingInstallments,
  resolveFirstEmi,
} from "@/lib/loan-status";
import { PrintButton } from "@/components/print-button";

/**
 * Full customer statement on A4 — the plain "Print" button on the customer card
 * (client request #8), as distinct from the per-payment "Invoice Print".
 * Everything the branch keeps on the physical loan-book page, plus the complete
 * installment ledger and its totals.
 */

type OneOrMany<T> = T | T[] | null;
function one<T>(v: OneOrMany<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
function many<T>(v: OneOrMany<T>): T[] {
  return Array.isArray(v) ? v : v ? [v] : [];
}

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
  banks: OneOrMany<{ name: string }>;
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
  signature: boolean;
  paid_at: string;
};

function fmtDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("en-IN") : "—";
}

const penaltyLabel: Record<string, string> = {
  per_day: "Per day",
  monthly_fixed: "Monthly fixed",
};

function Pair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1 text-[12px] print:border-black">
      <span className="text-muted-foreground print:text-black">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="print-block rounded-xl border border-border bg-surface p-4 print:rounded-none print:border-black print:bg-white">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function CustomerStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("customers")
    .select(
      "id, first_name, middle_name, last_name, account_no, address_village, address_post, address_taluka, address_district, model_no, purchase_date, mobiles, aadhaar, banks(name), vehicles(vehicle_name, rc_no, engine_no_1, engine_no_2, chassis_no), guarantors(name, mobile, address), loans(id, principal_paise, emi_paise, tenure_months, due_day, grace_days, penalty_type, penalty_rate_paise, status, started_at, first_emi_date)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const customer = data as Customer | null;
  if (!customer) notFound();

  const vehicle = one(customer.vehicles);
  const guarantor = one(customer.guarantors);
  const loans = many(customer.loans);
  const loan = loans.find((l) => l.status === "active") ?? loans[0] ?? null;

  let payments: Payment[] = [];
  if (loan) {
    const { data: pdata } = await supabase
      .from("payments")
      .select(
        "id, amount_paise, penalty_paise, mode, month_no, receipt_no, invoice_no, signature, paid_at",
      )
      .eq("loan_id", loan.id)
      .order("paid_at", { ascending: true })
      .returns<Payment[]>();
    payments = pdata ?? [];
  }

  const fullName = [customer.first_name, customer.middle_name, customer.last_name]
    .filter(Boolean)
    .join(" ");
  const place =
    [
      customer.address_village,
      customer.address_post,
      customer.address_taluka,
      customer.address_district,
    ]
      .filter(Boolean)
      .join(", ") || "—";

  const paidCount = payments.length;
  const firstEmi = loan
    ? resolveFirstEmi(customer.purchase_date, loan.first_emi_date)
    : null;
  const pending = loan ? remainingInstallments(loan.tenure_months, paidCount) : 0;
  const behind =
    loan && firstEmi
      ? monthsBehind(firstEmi, new Date(), loan.tenure_months, paidCount)
      : 0;
  const nextDue =
    loan && firstEmi ? nextDueDate(firstEmi, paidCount, loan.tenure_months) : null;

  const collectedInstallments = payments.reduce(
    (sum, p) => sum + p.amount_paise,
    0,
  );
  const collectedPenalty = payments.reduce((sum, p) => sum + p.penalty_paise, 0);

  return (
    <div className="mx-auto w-full max-w-[190mm] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Customer statement
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Full record and installment ledger for {fullName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/dashboard/customers/${id}`}
            className="inline-flex min-h-10 items-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Back to customer
          </Link>
          <PrintButton label="Print statement" />
        </div>
      </div>

      <header className="print-block flex flex-wrap items-start justify-between gap-3 border-b-2 border-border pb-3 print:border-black">
        <div>
          <div className="text-base font-bold uppercase tracking-wide">
            {me.branchName ?? "Vehicle Finance"}
          </div>
          <div className="text-[11px] text-muted-foreground print:text-black">
            Customer statement · printed {new Date().toLocaleDateString("en-IN")}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold">{fullName}</div>
          <div className="text-[11px] text-muted-foreground print:text-black">
            {customer.account_no ? `A/c ${customer.account_no}` : "No account no."}
          </div>
        </div>
      </header>

      {loan ? (
        <section className="print-block grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Installments paid", value: `${paidCount} of ${loan.tenure_months}` },
            { label: "Pending", value: String(pending) },
            { label: "Months behind", value: String(behind) },
            {
              label: "Next due",
              value: nextDue ? nextDue.toLocaleDateString("en-IN") : "Loan complete",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border bg-surface p-3 print:rounded-none print:border-black print:bg-white"
            >
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground print:text-black">
                {s.label}
              </div>
              <div className="mt-0.5 text-sm font-bold">{s.value}</div>
            </div>
          ))}
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Block title="Customer">
          <Pair label="Account number" value={customer.account_no} />
          <Pair label="Full name" value={fullName} />
          <Pair label="Address" value={place} />
          <Pair
            label="Mobile"
            value={customer.mobiles?.length ? customer.mobiles.join(" · ") : null}
          />
          <Pair label="Model no." value={customer.model_no} />
          <Pair label="Aadhaar / ID" value={customer.aadhaar} />
          <Pair label="Bank" value={one(customer.banks)?.name} />
        </Block>

        <Block title="Loan">
          {loan ? (
            <>
              <Pair label="Loan amount" value={formatINR(loan.principal_paise)} />
              <Pair label="Installment / EMI" value={formatINR(loan.emi_paise)} />
              <Pair label="Tenure" value={`${loan.tenure_months} months`} />
              <Pair label="Purchase / loan date" value={fmtDate(customer.purchase_date ?? loan.started_at)} />
              <Pair
                label="First EMI date"
                value={fmtDate(
                  loan.first_emi_date ??
                    (firstEmi ? firstEmi.toISOString().slice(0, 10) : null),
                )}
              />
              <Pair label="Due day" value={`Day ${loan.due_day} of each month`} />
              <Pair
                label="Penalty"
                value={`${penaltyLabel[loan.penalty_type] ?? loan.penalty_type} · ${formatINR(loan.penalty_rate_paise)}`}
              />
              <Pair
                label="Status"
                value={<span className="capitalize">{loan.status}</span>}
              />
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              No loan recorded.
            </p>
          )}
        </Block>

        <Block title="Vehicle">
          {vehicle ? (
            <>
              <Pair label="Vehicle name" value={vehicle.vehicle_name} />
              <Pair label="RC number" value={vehicle.rc_no} />
              <Pair label="Engine number 1" value={vehicle.engine_no_1} />
              <Pair label="Engine number 2" value={vehicle.engine_no_2} />
              <Pair label="Chassis number" value={vehicle.chassis_no} />
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              No vehicle recorded.
            </p>
          )}
        </Block>

        <Block title="Guarantor">
          {guarantor ? (
            <>
              <Pair label="Name" value={guarantor.name} />
              <Pair label="Mobile" value={guarantor.mobile} />
              <Pair label="Address" value={guarantor.address} />
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              No guarantor recorded.
            </p>
          )}
        </Block>
      </div>

      <Block title="Installment ledger">
        {payments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[11px] print:min-w-0">
              <thead className="bg-surface-muted text-[10px] uppercase tracking-wider text-muted-foreground print:bg-white print:text-black">
                <tr>
                  <th className="px-2 py-1.5 text-left">Sr</th>
                  <th className="px-2 py-1.5 text-left">Date</th>
                  <th className="px-2 py-1.5 text-left">Month</th>
                  <th className="px-2 py-1.5 text-right">Installment</th>
                  <th className="px-2 py-1.5 text-right">Penalty</th>
                  <th className="px-2 py-1.5 text-right">Total</th>
                  <th className="px-2 py-1.5 text-left">Mode</th>
                  <th className="px-2 py-1.5 text-left">Invoice</th>
                  <th className="px-2 py-1.5 text-left">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr
                    key={p.id}
                    className="border-t border-border print:border-black"
                  >
                    <td className="px-2 py-1">{i + 1}</td>
                    <td className="px-2 py-1">{fmtDate(p.paid_at)}</td>
                    <td className="px-2 py-1">{p.month_no ?? "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {formatINR(p.amount_paise)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {p.penalty_paise ? formatINR(p.penalty_paise) : "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-semibold tabular-nums">
                      {formatINR(p.amount_paise + p.penalty_paise)}
                    </td>
                    <td className="px-2 py-1 capitalize">{p.mode}</td>
                    <td className="px-2 py-1">{p.invoice_no ?? "—"}</td>
                    <td className="px-2 py-1">{p.receipt_no ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-bold print:border-black">
                  <td className="px-2 py-1.5" colSpan={3}>
                    Total collected
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatINR(collectedInstallments)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatINR(collectedPenalty)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatINR(collectedInstallments + collectedPenalty)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            No installments recorded yet.
          </p>
        )}
      </Block>

      <div className="print-block flex items-end justify-between gap-6 pt-8 text-[11px]">
        <div className="flex-1 border-t border-border pt-1 print:border-black">
          Branch signature
        </div>
        <div className="flex-1 border-t border-border pt-1 text-right print:border-black">
          Customer signature
        </div>
      </div>
    </div>
  );
}
