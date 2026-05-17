import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/utils";

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
  address_village: string | null;
  address_taluka: string | null;
  mobiles: string[];
  aadhaar: string | null;
  created_at: string;
  banks: OneOrMany<{ name: string }>;
  vehicles: OneOrMany<Vehicle>;
  guarantors: OneOrMany<Guarantor>;
  loans: OneOrMany<Loan>;
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

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("en-IN") : "—";
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
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab: TabKey = TABS.some((t) => t.key === tab)
    ? (tab as TabKey)
    : "customer";

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("customers")
    .select(
      "id, first_name, middle_name, last_name, address_village, address_taluka, mobiles, aadhaar, created_at, banks(name), vehicles(vehicle_name, rc_no, engine_no_1, engine_no_2, chassis_no), guarantors(name, mobile, address), loans(id, principal_paise, emi_paise, tenure_months, due_day, grace_days, penalty_type, penalty_rate_paise, status, started_at, closed_at)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const customer = data as Customer | null;
  if (!customer) notFound();

  const vehicle = one(customer.vehicles);
  const guarantors = many(customer.guarantors);
  const loans = many(customer.loans);
  const bankName = one(customer.banks)?.name ?? null;
  const fullName = [
    customer.first_name,
    customer.middle_name,
    customer.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  const engineMissing =
    !vehicle ||
    !vehicle.engine_no_1 ||
    vehicle.engine_no_1.trim() === "";

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
          {engineMissing ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
              <AlertTriangle size={10} /> Record incomplete — engine details
              missing
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {[customer.address_village, customer.address_taluka]
            .filter(Boolean)
            .join(", ") || "Address not recorded"}
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
            <Detail label="Full name" value={fullName} />
            <Detail
              label="Village"
              value={customer.address_village}
            />
            <Detail label="Taluka" value={customer.address_taluka} />
            <Detail
              label="Mobile number(s)"
              value={
                customer.mobiles.length
                  ? customer.mobiles.join(" · ")
                  : null
              }
            />
            <Detail label="Aadhaar / ID" value={customer.aadhaar} />
            <Detail label="Bank assigned" value={bankName} />
            <Detail
              label="Record created"
              value={fmtDate(customer.created_at)}
            />
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
                  <Detail
                    label="EMI amount"
                    value={formatINR(l.emi_paise)}
                  />
                  <Detail
                    label="Tenure"
                    value={`${l.tenure_months} months`}
                  />
                  <Detail
                    label="EMI due day"
                    value={`Day ${l.due_day} of each month`}
                  />
                  <Detail
                    label="Grace period"
                    value={`${l.grace_days} days`}
                  />
                  <Detail
                    label="Penalty"
                    value={`${penaltyLabel[l.penalty_type] ?? l.penalty_type} · ${formatINR(l.penalty_rate_paise)}`}
                  />
                  <Detail
                    label="Loan started"
                    value={fmtDate(l.started_at)}
                  />
                  <Detail
                    label="Status"
                    value={
                      <span className="capitalize">{l.status}</span>
                    }
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
        <Panel title="EMI history">
          <Empty text="No payments recorded yet. Payments and penalties will appear here once EMI logging is enabled." />
        </Panel>
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
