/**
 * Loan reminder status — the single source of truth for "how far behind is this
 * customer". Mirrors the Postgres `months_elapsed()` / `customer_status_counts()`
 * logic exactly (see supabase/migrations/20260609120100_ledger_rpcs.sql) so the
 * header badges, the customers list and the DB never disagree.
 *
 * Buckets (pure months-behind):
 *   0 -> green, 1..2 -> yellow, 3 -> orange, >3 -> red.
 */

export type LoanColor = "green" | "yellow" | "orange" | "red";

/** Parse a 'YYYY-MM-DD' date string as UTC midnight (tz-stable). */
export function parseISODate(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00Z`);
}

/**
 * Whole calendar months completed between two dates. A month completes on the
 * same day-of-month: 15 Jan -> 15 Feb is 1 month, but 14 Feb is still 0. Never
 * negative. Matches Postgres `age()`-based month counting.
 */
export function monthsElapsed(from: Date, to: Date): number {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(months, 0);
}

/** Installments due by `to`, capped at the loan tenure. */
export function expectedInstallments(
  from: Date,
  to: Date,
  tenureMonths: number,
): number {
  return Math.min(monthsElapsed(from, to), tenureMonths);
}

/** Installments due-by-now minus installments actually paid. Never negative. */
export function monthsBehind(
  from: Date,
  to: Date,
  tenureMonths: number,
  paidCount: number,
): number {
  return Math.max(expectedInstallments(from, to, tenureMonths) - paidCount, 0);
}

/** Map a months-behind count to its reminder color. */
export function categorize(behind: number): LoanColor {
  if (behind <= 0) return "green";
  if (behind <= 2) return "yellow";
  if (behind === 3) return "orange";
  return "red";
}

/**
 * Convenience used by the customers list: returns the reminder color for a loan,
 * or null when there is no purchase date to anchor the schedule.
 */
export function loanColor(opts: {
  purchaseDate: string | Date | null | undefined;
  tenureMonths: number;
  paidCount: number;
  today?: Date;
}): LoanColor | null {
  if (!opts.purchaseDate) return null;
  const from =
    typeof opts.purchaseDate === "string"
      ? parseISODate(opts.purchaseDate)
      : opts.purchaseDate;
  const to = opts.today ?? new Date();
  return categorize(monthsBehind(from, to, opts.tenureMonths, opts.paidCount));
}
