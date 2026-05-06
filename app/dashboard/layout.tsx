import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { logoutAction } from "../(auth)/login/actions";

const baseNav = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Customers", href: "/dashboard/customers" },
  { label: "Pending", href: "/dashboard/pending" },
  { label: "Bank Recovery", href: "/dashboard/recovery" },
  { label: "Daily Summary", href: "/dashboard/summary" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  if (user.role === "sub_id") {
    return (
      <div className="flex min-h-screen flex-1 flex-col bg-muted">
        <header className="border-b border-border bg-background">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                VF
              </div>
              <span className="font-semibold">Bulk Data Entry</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{user.email}</span>
              <form action={logoutAction}>
                <button className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                  Sign out
                </button>
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

  const navItems = [...baseNav];
  if (user.role === "admin") {
    navItems.push({ label: "Admin", href: "/dashboard/admin" });
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              VF
            </div>
            <span className="font-semibold">Vehicle Finance</span>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <input
              type="search"
              placeholder="Search name, RC, engine, mobile…"
              className="hidden w-72 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 md:block"
              disabled
              title="Smart search wires up in Phase 3"
            />
            <div
              className="flex items-center gap-2 rounded-full border border-border px-2 py-1 text-xs"
              title={user.email}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted font-medium">
                {(user.email[0] ?? "?").toUpperCase()}
              </span>
              <span className="hidden text-muted-foreground sm:inline">
                {user.role}
              </span>
            </div>
            <form action={logoutAction}>
              <button className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        v0.2 — Phase 2 · Built with Next.js 16 & Supabase
      </footer>
    </div>
  );
}
