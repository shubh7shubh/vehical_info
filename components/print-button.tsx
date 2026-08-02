"use client";

import { Printer } from "lucide-react";

/**
 * Opens the browser print dialog for the current page. The print routes hide all
 * app chrome behind Tailwind's `print:` variant, so what prints is just the
 * receipt / statement.
 */
export function PrintButton({
  label = "Print",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ??
        "inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover print:hidden"
      }
    >
      <Printer size={16} />
      {label}
    </button>
  );
}
