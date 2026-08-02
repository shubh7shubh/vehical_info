"use client";

import { useState } from "react";
import { addMonthsUTC, parseISODate, toISODate } from "@/lib/loan-status";
import { fieldClass, labelClass } from "@/components/form-styles";

/**
 * Purchase / loan date + first EMI date, wired together.
 *
 * Client request: "when the Loan Date or Sale Date is entered, the First EMI
 * Date should be generated automatically". It defaults to one month after
 * purchase — the schedule the system has always assumed — and keeps following
 * the purchase date until the branch types its own value, at which point it
 * stops moving. "Reset to auto" hands control back.
 */

function plusOneMonth(iso: string): string {
  if (!iso) return "";
  try {
    return toISODate(addMonthsUTC(parseISODate(iso), 1));
  } catch {
    return "";
  }
}

export function EmiDateFields({
  purchaseDefault,
  firstEmiDefault,
}: {
  purchaseDefault: string;
  firstEmiDefault?: string;
}) {
  const derived = plusOneMonth(purchaseDefault);
  const initialFirstEmi = firstEmiDefault || derived;

  const [purchase, setPurchase] = useState(purchaseDefault);
  const [firstEmi, setFirstEmi] = useState(initialFirstEmi);
  // An existing record whose first EMI isn't purchase + 1 month was set by hand.
  const [auto, setAuto] = useState(initialFirstEmi === derived);

  function onPurchaseChange(value: string) {
    setPurchase(value);
    if (auto) setFirstEmi(plusOneMonth(value));
  }

  function resetToAuto() {
    setAuto(true);
    setFirstEmi(plusOneMonth(purchase));
  }

  return (
    <>
      <div>
        <label htmlFor="purchase_date" className={labelClass}>
          Purchase / loan date *
        </label>
        <input
          id="purchase_date"
          name="purchase_date"
          type="date"
          required
          value={purchase}
          onChange={(e) => onPurchaseChange(e.target.value)}
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="first_emi_date" className={labelClass}>
          First EMI date *
        </label>
        <input
          id="first_emi_date"
          name="first_emi_date"
          type="date"
          required
          value={firstEmi}
          min={purchase || undefined}
          onChange={(e) => {
            setFirstEmi(e.target.value);
            setAuto(false);
          }}
          className={fieldClass}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {auto ? (
            "Filled automatically — one month after the purchase date."
          ) : (
            <>
              Set by hand.{" "}
              <button
                type="button"
                onClick={resetToAuto}
                className="font-medium text-accent underline"
              >
                Reset to automatic
              </button>
            </>
          )}
        </p>
      </div>
    </>
  );
}
