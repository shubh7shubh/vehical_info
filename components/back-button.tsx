"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * One back affordance for every dashboard page (client request: "every page
 * should have a Back button").
 *
 * It navigates to the parent route rather than calling router.back(), so the
 * destination is predictable: pressing Back after saving a form takes you to the
 * list, never back into the submitted form. Rendered by the dashboard layout, so
 * no page has to remember to add one.
 */

/** Landing pages — nothing above them to go back to. */
const ROOTS = new Set(["/dashboard", "/dashboard/owner"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  customers: "Customers",
  admin: "Admin",
  users: "Users",
  owner: "Dashboard",
  branches: "Branches",
  new: "Customers",
};

function parentOf(pathname: string): string | null {
  if (ROOTS.has(pathname)) return null;

  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments.length <= 1) return null;

  // /dashboard/customers/<id>/receipt/<paymentId> -> back to the customer card,
  // not to a bare /receipt segment that has no page.
  const drop = segments[segments.length - 2] === "receipt" ? 2 : 1;
  const parent = segments.slice(0, Math.max(segments.length - drop, 1));
  if (parent.length === 0) return null;

  return `/${parent.join("/")}`;
}

function labelFor(parent: string): string {
  const last = parent.split("/").filter(Boolean).pop() ?? "";
  if (UUID_RE.test(last)) return "Customer";
  return LABELS[last] ?? "Back";
}

export function BackButton() {
  const pathname = usePathname();
  const parent = parentOf(pathname);
  if (!parent) return null;

  return (
    <Link
      href={parent}
      className="mb-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted print:hidden"
    >
      <ArrowLeft size={16} />
      Back to {labelFor(parent)}
    </Link>
  );
}
