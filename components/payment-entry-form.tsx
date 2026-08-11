"use client";

import { useState } from "react";
import { fieldClass, labelClass } from "@/components/form-styles";
import { SubmitButton } from "@/components/submit-button";
import {
  installmentsSettled,
  pendingMonthNo,
  pendingMonthShortfallPaise,
  penaltyBalancePaise as penaltyBalanceOf,
  splitReceipt,
} from "@/lib/loan-status";
import { formatINR } from "@/lib/utils";

/**
 * The instalment entry form.
 *
 * Client feedback round 3, recordings 11, 13 and 14: the customer often hands
 * over less than the EMI, or pays only part of the penalty. The employee types
 * the cash actually received into one box; the split across EMI and penalty is
 * proposed automatically and stays editable, and the panel underneath shows
 * exactly what the customer will still owe when they walk out — the same numbers
 * that print on the receipt.
 *
 * The split order (penalty first, then EMI) lives in `splitReceipt` in
 * lib/loan-status.ts, not here.
 *
 * Rupees in the inputs, paise everywhere else. The two split boxes post as
 * `installment` and `penalty`, which is what the server action already expects.
 */

const toPaise = (rupees: string) => Math.round((Number(rupees) || 0) * 100);
const toRupees = (paise: number) => String(Math.round(paise / 100));

export function PaymentEntryForm({
  action,
  customerId,
  emiPaise,
  tenureMonths,
  emiCollectedPaise,
  emiOverduePaise,
  penaltyChargedPaise,
  penaltyCollectedPaise,
  today,
  penaltyOnly = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  customerId: string;
  emiPaise: number;
  tenureMonths: number;
  emiCollectedPaise: number;
  emiOverduePaise: number;
  penaltyChargedPaise: number;
  penaltyCollectedPaise: number;
  today: string;
  /** Renders the smaller "Pay penalty only" variant (recording 13). */
  penaltyOnly?: boolean;
}) {
  const penaltyBalance = penaltyBalanceOf(
    penaltyChargedPaise,
    penaltyCollectedPaise,
  );

  // What the branch would normally collect: everything overdue plus the penalty.
  // Falls back to one EMI when the customer is up to date and paying early.
  const suggestedPaise = penaltyOnly
    ? penaltyBalance
    : (emiOverduePaise > 0 ? emiOverduePaise : emiPaise) + penaltyBalance;

  const [received, setReceived] = useState(toRupees(suggestedPaise));
  const initialSplit = splitReceipt({
    receivedPaise: suggestedPaise,
    emiPaise,
    emiOverduePaise,
    penaltyBalancePaise: penaltyBalance,
  });
  const [towardsEmi, setTowardsEmi] = useState(
    penaltyOnly ? "0" : toRupees(initialSplit.towardsEmiPaise),
  );
  const [towardsPenalty, setTowardsPenalty] = useState(
    penaltyOnly
      ? toRupees(penaltyBalance)
      : toRupees(initialSplit.towardsPenaltyPaise),
  );
  const [manual, setManual] = useState(penaltyOnly);

  function onReceivedChange(value: string) {
    setReceived(value);
    if (manual) return;
    const split = splitReceipt({
      receivedPaise: toPaise(value),
      emiPaise,
      emiOverduePaise,
      penaltyBalancePaise: penaltyBalance,
    });
    setTowardsEmi(toRupees(split.towardsEmiPaise));
    setTowardsPenalty(toRupees(split.towardsPenaltyPaise));
  }

  /** Editing one side rebalances the other so the two always sum to what was
   *  handed over — the operator is splitting a known amount, not inventing one. */
  function onSplitChange(side: "emi" | "penalty", value: string) {
    setManual(true);
    const total = toPaise(received);
    const thisSide = Math.min(Math.max(toPaise(value), 0), total);
    const other = Math.max(total - thisSide, 0);
    if (side === "emi") {
      setTowardsEmi(value);
      setTowardsPenalty(toRupees(other));
    } else {
      setTowardsPenalty(value);
      setTowardsEmi(toRupees(other));
    }
  }

  function resetToAuto() {
    setManual(false);
    const split = splitReceipt({
      receivedPaise: toPaise(received),
      emiPaise,
      emiOverduePaise,
      penaltyBalancePaise: penaltyBalance,
    });
    setTowardsEmi(toRupees(split.towardsEmiPaise));
    setTowardsPenalty(toRupees(split.towardsPenaltyPaise));
  }

  // ---- the live "after this payment" preview -------------------------------
  const emiPaid = toPaise(towardsEmi);
  const penaltyPaid = toPaise(towardsPenalty);
  const collectedAfter = emiCollectedPaise + emiPaid;

  const settledAfter = installmentsSettled(emiPaise, collectedAfter, tenureMonths);
  const monthAfter = pendingMonthNo(emiPaise, collectedAfter, tenureMonths);
  const monthShortfallAfter = pendingMonthShortfallPaise(
    emiPaise,
    collectedAfter,
    tenureMonths,
  );
  const penaltyBalanceAfter = Math.max(penaltyBalance - penaltyPaid, 0);
  const emiRemainingAfter = Math.max(
    tenureMonths * emiPaise - collectedAfter,
    0,
  );
  const loanBalanceAfter = emiRemainingAfter + penaltyBalanceAfter;
  const nothingEntered = emiPaid + penaltyPaid <= 0;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="customer_id" value={customerId} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor={`received-${customerId}`} className={labelClass}>
            Amount received (₹) *
          </label>
          <input
            id={`received-${customerId}`}
            type="number"
            min={0}
            step="1"
            required
            value={received}
            onChange={(e) => onReceivedChange(e.target.value)}
            inputMode="numeric"
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={`paid_at-${customerId}`} className={labelClass}>
            Date *
          </label>
          <input
            id={`paid_at-${customerId}`}
            name="paid_at"
            type="date"
            required
            defaultValue={today}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={`mode-${customerId}`} className={labelClass}>
            Mode
          </label>
          <select
            id={`mode-${customerId}`}
            name="mode"
            defaultValue="cash"
            className={fieldClass}
          >
            <option value="cash">Cash</option>
            <option value="online">Online</option>
          </select>
        </div>

        <div>
          <label htmlFor={`receipt_no-${customerId}`} className={labelClass}>
            Book no.
          </label>
          <input
            id={`receipt_no-${customerId}`}
            name="receipt_no"
            placeholder="From the book"
            className={fieldClass}
          />
        </div>
      </div>

      {/* The split. Pre-filled, always editable. */}
      <div className="rounded-xl border border-border bg-surface-muted p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            How it is applied
          </span>
          <span className="text-xs text-muted-foreground">
            {manual ? (
              <>
                Split by hand.{" "}
                <button
                  type="button"
                  onClick={resetToAuto}
                  className="font-medium text-accent underline"
                >
                  Reset to automatic
                </button>
              </>
            ) : (
              "Penalty is cleared first, then the instalment."
            )}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor={`penalty-${customerId}`} className={labelClass}>
              Towards penalty (₹)
            </label>
            <input
              id={`penalty-${customerId}`}
              name="penalty"
              type="number"
              min={0}
              step="1"
              value={towardsPenalty}
              onChange={(e) => onSplitChange("penalty", e.target.value)}
              inputMode="numeric"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`installment-${customerId}`} className={labelClass}>
              Towards instalment (₹)
            </label>
            <input
              id={`installment-${customerId}`}
              name="installment"
              type="number"
              min={0}
              step="1"
              value={towardsEmi}
              onChange={(e) => onSplitChange("emi", e.target.value)}
              inputMode="numeric"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`month_no-${customerId}`} className={labelClass}>
              Month #
            </label>
            <input
              id={`month_no-${customerId}`}
              name="month_no"
              type="number"
              min={1}
              max={tenureMonths}
              defaultValue={
                pendingMonthNo(emiPaise, emiCollectedPaise, tenureMonths) ??
                undefined
              }
              inputMode="numeric"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`remark-${customerId}`} className={labelClass}>
              Remark
            </label>
            <input
              id={`remark-${customerId}`}
              name="remark"
              placeholder="Optional note"
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      {/* Recording 11: "the system should automatically calculate and display…" */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-border bg-surface p-3 text-sm sm:grid-cols-4">
        <Preview
          label="Instalments settled"
          value={`${settledAfter} of ${tenureMonths}`}
        />
        <Preview
          label={monthAfter ? `Balance on EMI #${monthAfter}` : "Loan complete"}
          value={monthAfter ? formatINR(monthShortfallAfter) : "—"}
        />
        <Preview label="Penalty balance" value={formatINR(penaltyBalanceAfter)} />
        <Preview
          label="Total outstanding"
          value={formatINR(loanBalanceAfter)}
          strong
        />
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="signature"
            className="h-4 w-4 rounded border-border"
          />
          Signature taken
        </label>
        <SubmitButton
          pendingLabel="Recording…"
          disabled={nothingEntered}
          className="min-h-10 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-70"
        >
          {penaltyOnly ? "Record penalty payment" : "Record instalment"}
        </SubmitButton>
        {nothingEntered ? (
          <span className="text-xs text-muted-foreground">
            Enter an amount towards the instalment, the penalty, or both.
          </span>
        ) : null}
      </div>
    </form>
  );
}

function Preview({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`tabular-nums ${strong ? "text-base font-bold" : "font-medium"}`}
      >
        {value}
      </dd>
    </div>
  );
}
