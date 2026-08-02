/**
 * Loan reminder status — the single source of truth for "how far behind is this
 * customer". Mirrors the Postgres `months_elapsed()` / `installments_due()` /
 * `customer_status_counts()` logic exactly (see
 * supabase/migrations/20260802120100_receipt_edit_rpcs.sql) so the header badges,
 * the customers list and the DB never disagree. Change the two together.
 *
 * The schedule is anchored on the loan's **first EMI date**. When that is not
 * recorded (rows created before Phase 4.5) it falls back to
 * `purchase_date + 1 month`, which is exactly what the older purchase-anchored
 * math assumed — so no existing customer changes colour.
 *
 * Buckets (pure months-behind):
 *   0 -> green, 1..2 -> yellow, 3 -> orange, >3 -> red.
 */

export type LoanColor = "green" | "yellow" | "orange" | "red";
export type PenaltyType = "per_day" | "monthly_fixed";

/** Parse a 'YYYY-MM-DD' date string as UTC midnight (tz-stable). */
export function parseISODate(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00Z`);
}

/** Format a Date back to 'YYYY-MM-DD' (what `<input type="date">` expects). */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Add whole months, clamping to the end of a shorter month the same way
 * Postgres does: 31 Jan + 1 month -> 28 Feb.
 */
export function addMonthsUTC(d: Date, n: number): Date {
  const day = d.getUTCDate();
  const shifted = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDayOfMonth = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDayOfMonth));
  return shifted;
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

function asDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  return typeof v === "string" ? parseISODate(v) : v;
}

/**
 * The date installment #1 falls due: the recorded first-EMI date, else one month
 * after purchase. Null when neither is known.
 */
export function resolveFirstEmi(
  purchaseDate: string | Date | null | undefined,
  firstEmiDate?: string | Date | null,
): Date | null {
  const explicit = asDate(firstEmiDate);
  if (explicit) return explicit;
  const purchase = asDate(purchaseDate);
  return purchase ? addMonthsUTC(purchase, 1) : null;
}

/**
 * Installments that have fallen due by `to`, capped at the loan tenure.
 * Installment 1 is due ON `firstEmi`, so the count is `monthsElapsed + 1` from
 * that date onward, and 0 before it.
 */
export function installmentsDue(
  firstEmi: Date,
  to: Date,
  tenureMonths: number,
): number {
  if (to < firstEmi) return 0;
  return Math.min(monthsElapsed(firstEmi, to) + 1, tenureMonths);
}

/** Installments due-by-now minus installments actually paid. Never negative. */
export function monthsBehind(
  firstEmi: Date,
  to: Date,
  tenureMonths: number,
  paidCount: number,
): number {
  return Math.max(installmentsDue(firstEmi, to, tenureMonths) - paidCount, 0);
}

/** Installments left to collect over the life of the loan. Never negative. */
export function remainingInstallments(
  tenureMonths: number,
  paidCount: number,
): number {
  return Math.max(tenureMonths - paidCount, 0);
}

/**
 * When the next installment falls due, given how many have been paid.
 * Null once the whole tenure has been collected.
 */
export function nextDueDate(
  firstEmi: Date,
  paidCount: number,
  tenureMonths: number,
): Date | null {
  if (paidCount >= tenureMonths) return null;
  return addMonthsUTC(firstEmi, Math.max(paidCount, 0));
}

/** Map a months-behind count to its reminder color. */
export function categorize(behind: number): LoanColor {
  if (behind <= 0) return "green";
  if (behind <= 2) return "yellow";
  if (behind === 3) return "orange";
  return "red";
}

/**
 * The penalty to pre-fill on the installment form (client: "penalty should be
 * monthly ₹500"). One slab per month behind. Per-day loans get no suggestion —
 * that needs a due-date-to-payment-date span, which is the deferred auto-penalty
 * engine's job, so the employee types it as before.
 */
export function suggestedPenaltyPaise(
  behind: number,
  penaltyType: string | null | undefined,
  penaltyRatePaise: number | null | undefined,
): number {
  if (penaltyType !== "monthly_fixed") return 0;
  return Math.max(behind, 0) * Math.max(penaltyRatePaise ?? 0, 0);
}

/**
 * Convenience used by the customers list and the customer card: the reminder
 * colour for a loan, or null when there is no date to anchor the schedule.
 */
export function loanColor(opts: {
  purchaseDate: string | Date | null | undefined;
  firstEmiDate?: string | Date | null;
  tenureMonths: number;
  paidCount: number;
  today?: Date;
}): LoanColor | null {
  const firstEmi = resolveFirstEmi(opts.purchaseDate, opts.firstEmiDate);
  if (!firstEmi) return null;
  const to = opts.today ?? new Date();
  return categorize(
    monthsBehind(firstEmi, to, opts.tenureMonths, opts.paidCount),
  );
}
