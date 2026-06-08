import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LedgerCustomerForm } from "@/components/ledger-customer-form";

type Bank = { id: string; name: string };

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { error } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: banks } = await supabase
    .from("banks")
    .select("id, name")
    .order("name")
    .returns<Bank[]>();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/customers"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <ArrowLeft size={14} /> All customers
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">
          Add new customer
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the loan-book details. The new record is added to your branch.
        </p>
      </div>

      <LedgerCustomerForm
        banks={banks ?? []}
        today={today}
        error={error}
        cancelHref="/dashboard/customers"
      />
    </div>
  );
}
