import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/utils";
import { PrintButton } from "@/components/print-button";

/**
 * The printable EMI receipt (client request #1 and #4: "an invoice should be
 * printable for every EMI payment" and "the printout should show how many EMIs
 * are still pending").
 *
 * One A4 sheet carries two identical A5 halves — Office Copy and Customer Copy —
 * so it prints on the ordinary printer the branch already owns. All app chrome
 * is hidden behind Tailwind's `print:` variant.
 *
 * `paymentId` may be the literal "latest", which is what the "Invoice Print"
 * button on the customer card uses.
 */

type Receipt = {
  branch: {
    name: string | null;
    code: string | null;
    city: string | null;
    address: string | null;
    phone: string | null;
  } | null;
  customer: {
    id: string;
    account_no: string | null;
    name: string;
    village: string | null;
    post: string | null;
    taluka: string | null;
    district: string | null;
    mobiles: string[] | null;
    model_no: string | null;
    purchase_date: string | null;
  };
  loan: {
    id: string;
    principal_paise: number;
    emi_paise: number;
    tenure_months: number;
    first_emi_date: string | null;
    due_day: number;
  };
  payment: {
    id: string;
    invoice_no: string | null;
    receipt_no: string | null;
    month_no: number | null;
    amount_paise: number;
    penalty_paise: number;
    total_paise: number;
    mode: string;
    signature: boolean;
    paid_at: string;
  };
  paid_count: number;
  pending_count: number;
  next_due_date: string | null;
};

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("en-IN") : "—";
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-0.5 ${
        strong ? "text-sm font-bold" : "text-[12px]"
      }`}
    >
      <span className={strong ? "" : "text-muted-foreground print:text-black"}>
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Slip({ r, copy }: { r: Receipt; copy: string }) {
  const place =
    [r.customer.village, r.customer.post, r.customer.taluka, r.customer.district]
      .filter(Boolean)
      .join(", ") || "—";
  const mobiles = (r.customer.mobiles ?? []).join(" · ");

  return (
    <article className="print-block rounded-xl border border-border bg-surface p-5 print:rounded-none print:border-black print:bg-white print:p-4">
      <header className="flex items-start justify-between gap-3 border-b border-border pb-2 print:border-black">
        <div>
          <div className="text-base font-bold uppercase tracking-wide">
            {r.branch?.name ?? "Vehicle Finance"}
          </div>
          <div className="text-[11px] text-muted-foreground print:text-black">
            {[r.branch?.address, r.branch?.city].filter(Boolean).join(", ") ||
              "Vehicle Finance — Loan Management"}
            {r.branch?.phone ? ` · ${r.branch.phone}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider print:border-black">
            {copy}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2 print:border-black">
        <div className="text-sm font-bold uppercase tracking-wide">
          EMI Receipt
        </div>
        <div className="text-right text-[11px]">
          <div>
            Invoice{" "}
            <strong className="tabular-nums">
              {r.payment.invoice_no ?? "—"}
            </strong>
          </div>
          {r.payment.receipt_no ? (
            <div className="text-muted-foreground print:text-black">
              Receipt book no. {r.payment.receipt_no}
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-b border-border py-2 text-[12px] print:border-black">
        <div className="flex flex-wrap items-baseline gap-x-3">
          {r.customer.account_no ? (
            <span className="font-semibold">A/c {r.customer.account_no}</span>
          ) : null}
          <span className="font-semibold">{r.customer.name}</span>
        </div>
        <div className="text-muted-foreground print:text-black">{place}</div>
        <div className="text-muted-foreground print:text-black">
          {mobiles ? `${mobiles}` : ""}
          {r.customer.model_no ? `${mobiles ? " · " : ""}${r.customer.model_no}` : ""}
        </div>
      </div>

      <div className="border-b border-border py-2 print:border-black">
        <Row
          label={
            r.payment.month_no
              ? `Installment no. ${r.payment.month_no}`
              : "Installment"
          }
          value={fmtDate(r.payment.paid_at)}
        />
        <Row label="Installment amount" value={formatINR(r.payment.amount_paise)} />
        <Row
          label="Penalty"
          value={
            r.payment.penalty_paise ? formatINR(r.payment.penalty_paise) : "—"
          }
        />
        <Row
          label={`Total paid (${r.payment.mode})`}
          value={formatINR(r.payment.total_paise)}
          strong
        />
      </div>

      {/* The line the client specifically asked for. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2 text-[12px] print:border-black">
        <span>
          Paid <strong>{r.paid_count}</strong> of{" "}
          <strong>{r.loan.tenure_months}</strong>
        </span>
        <span className="rounded bg-warning-soft px-2 py-0.5 font-bold uppercase tracking-wider text-warning print:bg-white print:text-black">
          Pending {r.pending_count}
        </span>
        <span>
          Next due <strong>{fmtDate(r.next_due_date)}</strong>
        </span>
      </div>

      <div className="flex items-end justify-between gap-6 pt-6 text-[11px]">
        <div className="flex-1 border-t border-border pt-1 print:border-black">
          Received by
        </div>
        <div className="flex-1 border-t border-border pt-1 text-right print:border-black">
          Customer signature
        </div>
      </div>
    </article>
  );
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  await requireUser();
  const { id, paymentId } = await params;

  const supabase = await createSupabaseServerClient();

  // "latest" -> the customer's most recent payment. RLS keeps this branch-scoped.
  let targetId: string | null = paymentId;
  if (paymentId === "latest") {
    const { data: last } = await supabase
      .from("payments")
      .select("id, paid_at, loans!inner(customer_id)")
      .eq("loans.customer_id", id)
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    targetId = (last as { id: string } | null)?.id ?? null;
  }
  if (!targetId) notFound();

  const { data } = await supabase.rpc("payment_receipt", {
    p_payment_id: targetId,
  });
  const receipt = data as Receipt | null;
  if (!receipt || receipt.customer?.id !== id) notFound();

  return (
    <div className="mx-auto w-full max-w-[190mm] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">EMI receipt</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            One A4 sheet — office copy on top, customer copy below.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/dashboard/customers/${id}?tab=emi`}
            className="inline-flex min-h-10 items-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Back to customer
          </Link>
          <PrintButton label="Print receipt" />
        </div>
      </div>

      <div className="space-y-4 print:space-y-0">
        <Slip r={receipt} copy="Office copy" />
        <div className="border-t border-dashed border-border-strong print:my-4 print:border-black" />
        <Slip r={receipt} copy="Customer copy" />
      </div>
    </div>
  );
}
