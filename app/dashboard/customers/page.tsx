import Link from "next/link";
import {
  UserPlus,
  AlertTriangle,
  ChevronRight,
  IndianRupee,
  Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CustomerSearch } from "@/components/customer-search";
import { StatusBadge, STATUS_META } from "@/components/status-counts";
import { loanColor, type LoanColor } from "@/lib/loan-status";

type OneOrMany<T> = T | T[] | null;

function one<T>(v: OneOrMany<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type LoanEmbed = {
  id: string;
  tenure_months: number;
  status: string;
  first_emi_date: string | null;
};

type ListRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  account_no: string | null;
  address_village: string | null;
  address_taluka: string | null;
  purchase_date: string | null;
  mobiles: string[];
  banks: OneOrMany<{ name: string }>;
  vehicles: OneOrMany<{
    rc_no: string | null;
    vehicle_name: string | null;
    engine_no_1: string | null;
  }>;
  loans: OneOrMany<LoanEmbed>;
};

type SearchRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  address_village: string | null;
  address_taluka: string | null;
  account_no: string | null;
  mobiles: string[];
  aadhaar: string | null;
  rc_no: string | null;
  vehicle_name: string | null;
  engine_missing: boolean;
  bank_name: string | null;
};

type Row = {
  id: string;
  name: string;
  accountNo: string | null;
  place: string;
  mobiles: string[];
  rc_no: string | null;
  vehicleName: string | null;
  bankName: string | null;
  engineMissing: boolean;
  color: LoanColor | null;
};

function fullName(
  first: string,
  middle: string | null,
  last: string | null,
): string {
  return [first, middle, last].filter(Boolean).join(" ");
}

function place(village: string | null, taluka: string | null): string {
  return [village, taluka].filter(Boolean).join(", ") || "—";
}

/**
 * The whole card links to the customer, but a customer walking in to pay needs a
 * one-tap route to the installment form (the client couldn't find it). A nested
 * <Link> is invalid, so the card link is "stretched" over the card with an
 * ::after overlay and the action sits above it on its own stacking level.
 */
function CustomerCard({ row }: { row: Row }) {
  return (
    <div className="group relative rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-accent/40 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/customers/${row.id}`}
              className="font-semibold text-foreground after:absolute after:inset-0 after:content-['']"
            >
              {row.name}
            </Link>
            {row.accountNo ? (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                A/c {row.accountNo}
              </span>
            ) : null}
            {row.color ? <StatusBadge color={row.color} /> : null}
            {row.engineMissing ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
                <AlertTriangle size={10} /> Record incomplete
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{row.place}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {row.rc_no ? <span>RC: {row.rc_no}</span> : null}
            {row.vehicleName ? <span>{row.vehicleName}</span> : null}
            {row.mobiles.length ? <span>{row.mobiles.join(" · ")}</span> : null}
            {row.bankName ? <span>{row.bankName}</span> : null}
          </div>
        </div>
        <ChevronRight
          size={16}
          className="mt-0.5 hidden shrink-0 text-muted-foreground transition group-hover:text-accent sm:block"
        />
      </div>

      <div className="relative z-10 mt-3 flex justify-end">
        <Link
          href={`/dashboard/customers/${row.id}?tab=emi`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent hover:text-accent-foreground"
        >
          <IndianRupee size={14} /> Record EMI
        </Link>
      </div>
    </div>
  );
}

const STATUS_KEYS: LoanColor[] = ["green", "yellow", "orange", "red"];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireUser();
  const { q, status } = await searchParams;
  const query = (q ?? "").trim();
  const isSearch = query.length > 0;
  const statusFilter = STATUS_KEYS.includes(status as LoanColor)
    ? (status as LoanColor)
    : null;

  const supabase = await createSupabaseServerClient();

  let rows: Row[] = [];
  let totalCount: number | null = null;

  if (isSearch) {
    const { data } = await supabase.rpc("search_customers", { q: query });
    rows = ((data as SearchRow[] | null) ?? []).map((r) => ({
      id: r.id,
      name: fullName(r.first_name, r.middle_name, r.last_name),
      accountNo: r.account_no,
      place: place(r.address_village, r.address_taluka),
      mobiles: r.mobiles ?? [],
      rc_no: r.rc_no,
      vehicleName: r.vehicle_name,
      bankName: r.bank_name,
      engineMissing: r.engine_missing,
      color: null,
    }));
  } else {
    const { count } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    totalCount = count ?? 0;

    // A wider window when filtering by status so the bucket isn't truncated by
    // the recent-50 cap.
    const { data } = await supabase
      .from("customers")
      .select(
        "id, first_name, middle_name, last_name, account_no, address_village, address_taluka, purchase_date, mobiles, banks(name), vehicles(rc_no, vehicle_name, engine_no_1), loans(id, tenure_months, status, first_emi_date)",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(statusFilter ? 500 : 50)
      .returns<ListRow[]>();

    // Reminder colour is amount-based now (a part-paid month still counts as
    // behind), and PostgREST cannot sum() through an embed — so the settled
    // counts come from one extra read of the loan_balances view rather than the
    // old `payments(count)` embed.
    const loanIds = (data ?? [])
      .flatMap((r) => (Array.isArray(r.loans) ? r.loans : r.loans ? [r.loans] : []))
      .map((l) => l.id);
    const settledByLoan = new Map<string, number>();
    if (loanIds.length) {
      const { data: bal } = await supabase
        .from("loan_balances")
        .select("loan_id, installments_settled")
        .in("loan_id", loanIds)
        .returns<{ loan_id: string; installments_settled: number }[]>();
      for (const b of bal ?? []) {
        settledByLoan.set(b.loan_id, b.installments_settled);
      }
    }

    rows = (data ?? []).map((r) => {
      const vehicle = one(r.vehicles);
      const loan =
        (Array.isArray(r.loans)
          ? r.loans.find((l) => l.status === "active") ?? r.loans[0]
          : r.loans) ?? null;
      const paidCount = loan ? (settledByLoan.get(loan.id) ?? 0) : 0;
      return {
        id: r.id,
        name: fullName(r.first_name, r.middle_name, r.last_name),
        accountNo: r.account_no,
        place: place(r.address_village, r.address_taluka),
        mobiles: r.mobiles ?? [],
        rc_no: vehicle?.rc_no ?? null,
        vehicleName: vehicle?.vehicle_name ?? null,
        bankName: one(r.banks)?.name ?? null,
        engineMissing:
          !vehicle ||
          !vehicle.engine_no_1 ||
          vehicle.engine_no_1.trim() === "",
        color: loan
          ? loanColor({
              purchaseDate: r.purchase_date,
              firstEmiDate: loan.first_emi_date,
              tenureMonths: loan.tenure_months,
              paidCount,
            })
          : null,
      };
    });

    if (statusFilter) {
      rows = rows.filter((r) => r.color === statusFilter);
    }
  }

  const heading = isSearch
    ? `Results for “${query}”`
    : statusFilter
      ? `${STATUS_META[statusFilter].label} · ${rows.length} customer${rows.length === 1 ? "" : "s"}`
      : totalCount != null
        ? `${totalCount} customer${totalCount === 1 ? "" : "s"} in your branch`
        : "Your branch's customers";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">{heading}</p>
        </div>
        <Link
          href="/dashboard/customers/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover"
        >
          <UserPlus size={16} /> Add customer
        </Link>
      </div>

      <CustomerSearch defaultValue={query} />

      {statusFilter ? (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Filtered by status</span>
          <Link
            href="/dashboard/customers"
            className="rounded-full border border-border px-2 py-0.5 font-medium hover:bg-muted"
          >
            Clear
          </Link>
        </div>
      ) : null}

      {isSearch && rows.length > 1 ? (
        <p className="text-xs text-muted-foreground">
          Multiple matches — check the village and mobile number to pick the
          right customer.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <Users size={28} className="mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {isSearch
              ? "No customers match that search."
              : statusFilter
                ? "No customers in this status band."
                : "No customers yet — add your first one."}
          </p>
          {!isSearch && !statusFilter ? (
            <Link
              href="/dashboard/customers/new"
              className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              Add customer
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <CustomerCard key={row.id} row={row} />
          ))}
        </div>
      )}

      {!isSearch && !statusFilter && totalCount != null && totalCount > 50 ? (
        <p className="text-center text-xs text-muted-foreground">
          Showing the 50 most recent. Use search to find any customer.
        </p>
      ) : null}
    </div>
  );
}
