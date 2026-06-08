import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { MobileNav } from "@/components/mobile-nav";
import { StatusCounts } from "@/components/status-counts";
import type { LoanColor } from "@/lib/loan-status";
import { logoutAction } from "../(auth)/login/actions";

const baseNav = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Customers", href: "/dashboard/customers" },
  { label: "Pending", href: "/dashboard/pending" },
  { label: "Bank Recovery", href: "/dashboard/recovery" },
  { label: "Daily Summary", href: "/dashboard/summary" },
];

const ownerNav = [
  { label: "Dashboard", href: "/dashboard/owner" },
  { label: "Branches", href: "/dashboard/owner/branches" },
];

function BrandMark({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground text-sm font-bold tracking-tight shadow-sm">
        VF
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-header-fg">
          Vehicle Finance
        </span>
        <span className="hidden text-[10px] font-medium uppercase tracking-[0.16em] text-header-fg-muted sm:block">
          Loan Management
        </span>
      </div>
    </Link>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  if (user.role === "sub_id") {
    return (
      <div className="flex min-h-screen flex-1 flex-col bg-background">
        <header className="bg-header-bg text-header-fg">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
            <BrandMark />
            <div className="flex items-center gap-2 text-sm">
              <span className="hidden text-header-fg-muted sm:inline">
                {user.email}
              </span>
              <form action={logoutAction}>
                <SubmitButton
                  pendingLabel="Signing out…"
                  className="inline-flex items-center gap-1.5 rounded-md border border-header-border px-3 py-1.5 text-xs font-medium text-header-fg hover:bg-header-border disabled:opacity-70"
                >
                  <LogOut size={14} /> Sign out
                </SubmitButton>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
          {children}
        </main>
      </div>
    );
  }

  const isOwner = user.role === "owner";
  const navItems = isOwner
    ? [...ownerNav]
    : user.role === "admin"
      ? [...baseNav, { label: "Admin", href: "/dashboard/admin" }]
      : [...baseNav];
  const brandHref = isOwner ? "/dashboard/owner" : "/dashboard";

  // Branch-scoped reminder counts for the header triage pills (admin/employee
  // only — the owner has its own nav and sees per-branch buckets on its
  // dashboard instead). The RPC is security-invoker, so it returns this
  // user's branch only.
  let counts: Record<LoanColor, number> | null = null;
  if (!isOwner) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.rpc("customer_status_counts");
    const r = (Array.isArray(data) ? data[0] : data) as
      | Record<LoanColor, number>
      | null
      | undefined;
    counts = {
      green: Number(r?.green ?? 0),
      yellow: Number(r?.yellow ?? 0),
      orange: Number(r?.orange ?? 0),
      red: Number(r?.red ?? 0),
    };
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 bg-header-bg text-header-fg shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-2.5">
          <BrandMark href={brandHref} />

          <nav className="hidden flex-1 items-center gap-0.5 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-header-fg/85 transition hover:bg-header-border hover:text-header-fg"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {counts ? (
              <StatusCounts counts={counts} className="hidden sm:flex" />
            ) : null}
            {!isOwner && user.branchName ? (
              <span className="hidden rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent lg:inline">
                {user.branchName}
              </span>
            ) : null}
            <div
              className="hidden items-center gap-2 rounded-full border border-header-border px-2.5 py-1 sm:flex"
              title={user.email}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold uppercase text-accent-foreground">
                {(user.email[0] ?? "?").toUpperCase()}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-header-fg-muted">
                {user.role}
              </span>
            </div>
            <form action={logoutAction} className="hidden md:block">
              <SubmitButton
                pendingLabel="Signing out…"
                className="inline-flex items-center gap-1.5 rounded-md border border-header-border px-3 py-1.5 text-xs font-medium text-header-fg hover:bg-header-border disabled:opacity-70"
              >
                <LogOut size={14} /> Sign out
              </SubmitButton>
            </form>
            <MobileNav items={navItems} />
          </div>
        </div>
        {/* Mobile sign-out as a row under header (since logout is a server action, not a link) */}
        <div className="border-t border-header-border md:hidden">
          {counts ? (
            <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 pt-2">
              <StatusCounts counts={counts} />
            </div>
          ) : null}
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-2 text-xs text-header-fg-muted">
            <span className="truncate">
              {user.email}
              {!isOwner && user.branchName ? ` · ${user.branchName}` : ""}
            </span>
            <form action={logoutAction}>
              <SubmitButton
                pendingLabel="Signing out…"
                className="inline-flex items-center gap-1.5 rounded-md border border-header-border px-2.5 py-1 text-xs font-medium text-header-fg hover:bg-header-border disabled:opacity-70"
              >
                <LogOut size={12} /> Sign out
              </SubmitButton>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
