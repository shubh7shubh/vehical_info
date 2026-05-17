import Link from "next/link";
import { UserPlus, AlertTriangle, ChevronRight, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CustomerSearch } from "@/components/customer-search";

type OneOrMany<T> = T | T[] | null;

function one<T>(v: OneOrMany<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type ListRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  address_village: string | null;
  address_taluka: string | null;
  mobiles: string[];
  banks: OneOrMany<{ name: string }>;
  vehicles: OneOrMany<{
    rc_no: string | null;
    vehicle_name: string | null;
    engine_no_1: string | null;
  }>;
};

type SearchRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  address_village: string | null;
  address_taluka: string | null;
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
  place: string;
  mobiles: string[];
  rc_no: string | null;
  vehicleName: string | null;
  bankName: string | null;
  engineMissing: boolean;
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

function CustomerCard({ row }: { row: Row }) {
  return (
    <Link
      href={`/dashboard/customers/${row.id}`}
      className="group flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-accent/40 hover:shadow-md"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{row.name}</span>
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
        className="mt-0.5 shrink-0 text-muted-foreground transition group-hover:text-accent"
      />
    </Link>
  );
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const isSearch = query.length > 0;

  const supabase = await createSupabaseServerClient();

  let rows: Row[] = [];
  let totalCount: number | null = null;

  if (isSearch) {
    const { data } = await supabase.rpc("search_customers", { q: query });
    rows = ((data as SearchRow[] | null) ?? []).map((r) => ({
      id: r.id,
      name: fullName(r.first_name, r.middle_name, r.last_name),
      place: place(r.address_village, r.address_taluka),
      mobiles: r.mobiles ?? [],
      rc_no: r.rc_no,
      vehicleName: r.vehicle_name,
      bankName: r.bank_name,
      engineMissing: r.engine_missing,
    }));
  } else {
    const { count } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    totalCount = count ?? 0;

    const { data } = await supabase
      .from("customers")
      .select(
        "id, first_name, middle_name, last_name, address_village, address_taluka, mobiles, banks(name), vehicles(rc_no, vehicle_name, engine_no_1)",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<ListRow[]>();

    rows = (data ?? []).map((r) => {
      const vehicle = one(r.vehicles);
      return {
        id: r.id,
        name: fullName(r.first_name, r.middle_name, r.last_name),
        place: place(r.address_village, r.address_taluka),
        mobiles: r.mobiles ?? [],
        rc_no: vehicle?.rc_no ?? null,
        vehicleName: vehicle?.vehicle_name ?? null,
        bankName: one(r.banks)?.name ?? null,
        engineMissing:
          !vehicle ||
          !vehicle.engine_no_1 ||
          vehicle.engine_no_1.trim() === "",
      };
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSearch
              ? `Results for “${query}”`
              : totalCount != null
                ? `${totalCount} customer${totalCount === 1 ? "" : "s"} in your branch`
                : "Your branch's customers"}
          </p>
        </div>
        <Link
          href="/dashboard/customers/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover"
        >
          <UserPlus size={16} /> Add customer
        </Link>
      </div>

      <CustomerSearch defaultValue={query} />

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
              : "No customers yet — add your first one."}
          </p>
          {!isSearch ? (
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

      {!isSearch && totalCount != null && totalCount > 50 ? (
        <p className="text-center text-xs text-muted-foreground">
          Showing the 50 most recent. Use search to find any customer.
        </p>
      ) : null}
    </div>
  );
}
