/**
 * Loan reminder status and money math — the single source of truth for "how far
 * behind is this customer" and "what do they still owe".
 *
 * Mirrors the Postgres side exactly. Change the two together:
 *   `months_elapsed()` / `installments_due()`
 *     -> supabase/migrations/20260802120100_receipt_edit_rpcs.sql
 *   `installments_settled()` / `pending_month_no()` / `pending_month_shortfall()`
 *     -> supabase/migrations/20260812120100_penalty_ledger.sql
 *   the `loan_balances` view (every balance below)
 *     -> supabase/migrations/20260812120200_loan_balances_view.sql
 *
 * The schedule is anchored on the loan's **first EMI date**. When that is not
 * recorded (rows created before Phase 4.5) it falls back to
 * `purchase_date + 1 month`, which is exactly what the older purchase-anchored
 * math assumed — so no existing customer changes colour.
 *
 * Money is counted, not rows. Client feedback round 3 introduced partial EMIs, so
 * "installments paid" is `floor(collected / emi)`, never `payments.length`. For a
 * customer who has only ever paid whole EMIs the two are identical, which is why
 * the reminder buckets did not move when that shipped.
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

/* -------------------------------------------------------------------------- */
/* Money — mirrors the `loan_balances` view                                    */
/* -------------------------------------------------------------------------- */

/**
 * Installments fully covered by the money collected. Cash is applied to
 * installments in order, so this is integer division — two ₹2,500 receipts
 * against a ₹5,000 EMI are one settled installment, not two.
 *
 * Capped at the tenure so an overpayment can never read "Paid 13 of 12".
 */
export function installmentsSettled(
  emiPaise: number,
  collectedPaise: number,
  tenureMonths: number,
): number {
  if (emiPaise <= 0) return 0;
  return Math.min(
    Math.floor(Math.max(collectedPaise, 0) / emiPaise),
    tenureMonths,
  );
}

/**
 * The installment the next rupee lands on — "the EMI or month against which the
 * balance is pending". Null once the whole tenure is covered.
 */
export function pendingMonthNo(
  emiPaise: number,
  collectedPaise: number,
  tenureMonths: number,
): number | null {
  const settled = installmentsSettled(emiPaise, collectedPaise, tenureMonths);
  return settled >= tenureMonths ? null : settled + 1;
}

/**
 * How much more is needed to finish `pendingMonthNo` — the remaining EMI
 * balance. On an exact multiple this is a full EMI (nothing paid toward that
 * month yet); after a partial it is the remainder.
 */
export function pendingMonthShortfallPaise(
  emiPaise: number,
  collectedPaise: number,
  tenureMonths: number,
): number {
  if (emiPaise <= 0) return 0;
  if (installmentsSettled(emiPaise, collectedPaise, tenureMonths) >= tenureMonths) {
    return 0;
  }
  return emiPaise - (Math.max(collectedPaise, 0) % emiPaise);
}

/**
 * EMI money that is late right now: everything due by today, minus everything
 * collected. This is what "outstanding due" means at the counter.
 */
export function emiOverduePaise(
  emiPaise: number,
  installmentsDueCount: number,
  collectedPaise: number,
): number {
  return Math.max(installmentsDueCount * emiPaise - collectedPaise, 0);
}

/** EMI money left over the whole life of the loan. Never negative. */
export function emiRemainingPaise(
  emiPaise: number,
  tenureMonths: number,
  collectedPaise: number,
): number {
  return Math.max(tenureMonths * emiPaise - collectedPaise, 0);
}

/** Money collected beyond the entire loan — a customer credit. */
export function advancePaise(
  emiPaise: number,
  tenureMonths: number,
  collectedPaise: number,
): number {
  return Math.max(collectedPaise - tenureMonths * emiPaise, 0);
}

/** Penalty charged but not yet collected. Floored at 0 so a post-collection
 *  waiver cannot show a negative balance. */
export function penaltyBalancePaise(
  chargedPaise: number,
  collectedPaise: number,
): number {
  return Math.max(chargedPaise - collectedPaise, 0);
}

/**
 * How one cash receipt is divided. Penalty is cleared first, then the EMI, and
 * any surplus prepays future installments.
 *
 * The order lives here and nowhere else — flipping to EMI-first is a one-line
 * change. The trade-off is real and worth re-checking with the client: a
 * customer who hands over exactly one EMI while a penalty is outstanding leaves
 * the counter with that month still short, because ₹500 of it went to the
 * penalty. EMI-first would settle the month and leave the penalty owing instead.
 * Either way the same total is outstanding; only the column differs.
 */
export function splitReceipt(opts: {
  receivedPaise: number;
  emiPaise: number;
  emiOverduePaise: number;
  penaltyBalancePaise: number;
}): { towardsEmiPaise: number; towardsPenaltyPaise: number } {
  const received = Math.max(opts.receivedPaise, 0);
  const towardsPenalty = Math.min(
    received,
    Math.max(opts.penaltyBalancePaise, 0),
  );
  const towardsEmi = received - towardsPenalty;
  return { towardsEmiPaise: towardsEmi, towardsPenaltyPaise: towardsPenalty };
}

/* -------------------------------------------------------------------------- */
/* Foreclosure eligibility — mirrors calculate_foreclosure()                   */
/* -------------------------------------------------------------------------- */

/** Six whole months from the loan start date — the client's rule. */
export const FORECLOSURE_MIN_MONTHS = 6;

/** The date a loan becomes eligible for foreclosure. */
export function foreclosureEligibleFrom(startedAt: string | Date): Date {
  const start = asDate(startedAt);
  if (!start) throw new Error("A loan start date is required");
  return addMonthsUTC(start, FORECLOSURE_MIN_MONTHS);
}

/**
 * Whether a loan may be foreclosed yet. The server re-checks this in
 * `record_foreclosure` — a disabled button is a courtesy, never the control.
 */
export function isForeclosureEligible(
  startedAt: string | Date,
  today?: Date,
): boolean {
  const start = asDate(startedAt);
  if (!start) return false;
  return (
    monthsElapsed(start, today ?? new Date()) >= FORECLOSURE_MIN_MONTHS
  );
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
