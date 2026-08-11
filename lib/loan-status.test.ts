import { describe, it, expect } from "vitest";
import {
  parseISODate,
  toISODate,
  addMonthsUTC,
  monthsElapsed,
  resolveFirstEmi,
  installmentsDue,
  monthsBehind,
  remainingInstallments,
  nextDueDate,
  categorize,
  loanColor,
  installmentsSettled,
  pendingMonthNo,
  pendingMonthShortfallPaise,
  emiOverduePaise,
  emiRemainingPaise,
  advancePaise,
  penaltyBalancePaise,
  splitReceipt,
} from "./loan-status";

const d = parseISODate;

describe("monthsElapsed", () => {
  it("is 0 on the anchor day", () => {
    expect(monthsElapsed(d("2026-01-15"), d("2026-01-15"))).toBe(0);
  });
  it("completes a month only on the same day-of-month", () => {
    expect(monthsElapsed(d("2026-01-15"), d("2026-02-14"))).toBe(0);
    expect(monthsElapsed(d("2026-01-15"), d("2026-02-15"))).toBe(1);
    expect(monthsElapsed(d("2026-01-15"), d("2026-02-16"))).toBe(1);
  });
  it("counts multiple months and crosses year boundaries", () => {
    expect(monthsElapsed(d("2026-01-15"), d("2026-04-15"))).toBe(3);
    expect(monthsElapsed(d("2025-11-10"), d("2026-02-10"))).toBe(3);
  });
  it("never goes negative for a future anchor date", () => {
    expect(monthsElapsed(d("2026-06-01"), d("2026-01-01"))).toBe(0);
  });
});

describe("addMonthsUTC", () => {
  it("keeps the day of month", () => {
    expect(toISODate(addMonthsUTC(d("2026-01-15"), 1))).toBe("2026-02-15");
    expect(toISODate(addMonthsUTC(d("2026-01-15"), 12))).toBe("2027-01-15");
  });
  it("clamps to the end of a shorter month, like Postgres", () => {
    expect(toISODate(addMonthsUTC(d("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toISODate(addMonthsUTC(d("2026-03-31"), 1))).toBe("2026-04-30");
  });
  it("handles a leap February", () => {
    expect(toISODate(addMonthsUTC(d("2028-01-31"), 1))).toBe("2028-02-29");
  });
});

describe("resolveFirstEmi", () => {
  it("defaults to one month after purchase", () => {
    expect(toISODate(resolveFirstEmi("2026-01-15")!)).toBe("2026-02-15");
  });
  it("prefers an explicitly recorded first-EMI date", () => {
    expect(toISODate(resolveFirstEmi("2026-01-15", "2026-03-01")!)).toBe(
      "2026-03-01",
    );
  });
  it("is null when neither date is known", () => {
    expect(resolveFirstEmi(null)).toBeNull();
    expect(resolveFirstEmi(null, null)).toBeNull();
  });
});

describe("installmentsDue", () => {
  it("is 0 before the first EMI falls due", () => {
    expect(installmentsDue(d("2026-02-15"), d("2026-02-14"), 24)).toBe(0);
  });
  it("is 1 on the first EMI date itself", () => {
    expect(installmentsDue(d("2026-02-15"), d("2026-02-15"), 24)).toBe(1);
  });
  it("tracks elapsed months before the cap", () => {
    // First EMI 15 Feb, today 15 Apr -> instalments 1, 2 and 3 have fallen due.
    expect(installmentsDue(d("2026-02-15"), d("2026-04-15"), 24)).toBe(3);
  });
  it("caps at the loan tenure", () => {
    expect(installmentsDue(d("2024-02-15"), d("2026-07-15"), 24)).toBe(24);
  });
});

describe("monthsBehind", () => {
  it("is 0 when paid keeps up with the schedule", () => {
    expect(monthsBehind(d("2026-02-15"), d("2026-04-15"), 24, 3)).toBe(0);
  });
  it("is the shortfall when behind", () => {
    expect(monthsBehind(d("2026-02-15"), d("2026-04-15"), 24, 1)).toBe(2);
  });
  it("never goes negative when over-paid", () => {
    expect(monthsBehind(d("2026-02-15"), d("2026-02-15"), 24, 5)).toBe(0);
  });
  it("is 0 while the first EMI is still in the future", () => {
    expect(monthsBehind(d("2026-07-01"), d("2026-06-15"), 24, 0)).toBe(0);
  });
});

describe("remainingInstallments", () => {
  it("is tenure minus paid", () => {
    expect(remainingInstallments(12, 2)).toBe(10);
    expect(remainingInstallments(12, 0)).toBe(12);
  });
  it("never goes negative", () => {
    expect(remainingInstallments(12, 15)).toBe(0);
  });
});

describe("nextDueDate", () => {
  it("is the first EMI date when nothing is paid", () => {
    expect(toISODate(nextDueDate(d("2026-02-15"), 0, 12)!)).toBe("2026-02-15");
  });
  it("advances one month per installment paid", () => {
    expect(toISODate(nextDueDate(d("2026-02-15"), 2, 12)!)).toBe("2026-04-15");
  });
  it("is null once the tenure is fully collected", () => {
    expect(nextDueDate(d("2026-02-15"), 12, 12)).toBeNull();
  });
});

describe("categorize (0->green, 1..2->yellow, 3->orange, >3->red)", () => {
  it("maps each band", () => {
    expect(categorize(0)).toBe("green");
    expect(categorize(1)).toBe("yellow");
    expect(categorize(2)).toBe("yellow");
    expect(categorize(3)).toBe("orange");
    expect(categorize(4)).toBe("red");
    expect(categorize(12)).toBe("red");
  });
});

/* -------------------------------------------------------------------------- */
/* Client feedback round 3 — partial payments                                  */
/* -------------------------------------------------------------------------- */

const EMI = 500000; // Rs 5,000
const TENURE = 12;

describe("installmentsSettled", () => {
  it("counts whole EMIs covered by the money collected", () => {
    expect(installmentsSettled(EMI, 0, TENURE)).toBe(0);
    expect(installmentsSettled(EMI, EMI, TENURE)).toBe(1);
    expect(installmentsSettled(EMI, 3 * EMI, TENURE)).toBe(3);
  });
  it("floors — two half payments are one instalment, not two", () => {
    expect(installmentsSettled(EMI, EMI / 2, TENURE)).toBe(0);
    expect(installmentsSettled(EMI, EMI + EMI / 2, TENURE)).toBe(1);
  });
  it("is one short of settled when a rupee is missing", () => {
    expect(installmentsSettled(EMI, 2 * EMI - 100, TENURE)).toBe(1);
  });
  it("caps at the tenure so an overpayment never reads 'Paid 13 of 12'", () => {
    expect(installmentsSettled(EMI, 50 * EMI, TENURE)).toBe(TENURE);
  });
  it("is safe when the EMI is missing or zero", () => {
    expect(installmentsSettled(0, 100000, TENURE)).toBe(0);
  });

  // The regression that matters: for anyone who has only ever paid whole EMIs,
  // settled === the old row count, so nobody changed reminder bucket on deploy.
  it("matches the old payment-row count for whole-EMI payers", () => {
    const firstEmi = d("2026-01-15");
    const today = d("2026-06-15");
    for (let paid = 0; paid <= TENURE; paid++) {
      expect(installmentsSettled(EMI, paid * EMI, TENURE)).toBe(paid);
      expect(monthsBehind(firstEmi, today, TENURE, installmentsSettled(EMI, paid * EMI, TENURE)))
        .toBe(monthsBehind(firstEmi, today, TENURE, paid));
    }
  });
});

describe("pendingMonthNo / pendingMonthShortfallPaise", () => {
  it("points at the instalment the next rupee lands on", () => {
    expect(pendingMonthNo(EMI, 0, TENURE)).toBe(1);
    expect(pendingMonthNo(EMI, 2 * EMI, TENURE)).toBe(3);
    expect(pendingMonthNo(EMI, 2 * EMI + 100, TENURE)).toBe(3);
  });
  it("is null once the whole tenure is covered", () => {
    expect(pendingMonthNo(EMI, TENURE * EMI, TENURE)).toBeNull();
    expect(pendingMonthNo(EMI, 99 * EMI, TENURE)).toBeNull();
  });
  it("asks for a full EMI when nothing has been put toward that month", () => {
    expect(pendingMonthShortfallPaise(EMI, 0, TENURE)).toBe(EMI);
    expect(pendingMonthShortfallPaise(EMI, 2 * EMI, TENURE)).toBe(EMI);
  });
  it("asks only for the remainder after a partial", () => {
    expect(pendingMonthShortfallPaise(EMI, 300000, TENURE)).toBe(200000);
    expect(pendingMonthShortfallPaise(EMI, EMI + 300000, TENURE)).toBe(200000);
  });
  it("is 0 once the loan is complete", () => {
    expect(pendingMonthShortfallPaise(EMI, TENURE * EMI, TENURE)).toBe(0);
  });
});

describe("emiOverduePaise / emiRemainingPaise / advancePaise", () => {
  it("overdue is everything due by today minus everything collected", () => {
    expect(emiOverduePaise(EMI, 5, 2 * EMI)).toBe(3 * EMI);
    expect(emiOverduePaise(EMI, 5, 2 * EMI + 300000)).toBe(3 * EMI - 300000);
  });
  it("never goes negative when the customer is ahead", () => {
    expect(emiOverduePaise(EMI, 2, 5 * EMI)).toBe(0);
    expect(emiRemainingPaise(EMI, TENURE, 99 * EMI)).toBe(0);
  });
  it("remaining is the whole-life balance", () => {
    expect(emiRemainingPaise(EMI, TENURE, 2 * EMI)).toBe(10 * EMI);
  });
  it("surfaces an overpayment as an advance", () => {
    expect(advancePaise(EMI, TENURE, TENURE * EMI + 250000)).toBe(250000);
    expect(advancePaise(EMI, TENURE, 2 * EMI)).toBe(0);
  });
});

describe("penaltyBalancePaise", () => {
  it("is charged minus collected", () => {
    expect(penaltyBalancePaise(150000, 50000)).toBe(100000);
  });
  it("floors at 0 so a post-collection waiver never shows negative", () => {
    expect(penaltyBalancePaise(50000, 150000)).toBe(0);
  });
});

describe("splitReceipt (penalty first, then instalment)", () => {
  const base = { emiPaise: EMI, emiOverduePaise: EMI, penaltyBalancePaise: 50000 };
  it("clears the penalty before the instalment", () => {
    expect(splitReceipt({ ...base, receivedPaise: 300000 })).toEqual({
      towardsPenaltyPaise: 50000,
      towardsEmiPaise: 250000,
    });
  });
  it("puts everything on the penalty when that is all the money covers", () => {
    expect(splitReceipt({ ...base, receivedPaise: 30000 })).toEqual({
      towardsPenaltyPaise: 30000,
      towardsEmiPaise: 0,
    });
  });
  it("puts everything on the instalment when no penalty is owed", () => {
    expect(
      splitReceipt({ ...base, penaltyBalancePaise: 0, receivedPaise: EMI }),
    ).toEqual({ towardsPenaltyPaise: 0, towardsEmiPaise: EMI });
  });
  it("lets a surplus prepay future instalments", () => {
    expect(splitReceipt({ ...base, receivedPaise: 3 * EMI })).toEqual({
      towardsPenaltyPaise: 50000,
      towardsEmiPaise: 3 * EMI - 50000,
    });
  });
  it("is safe with nothing received", () => {
    expect(splitReceipt({ ...base, receivedPaise: 0 })).toEqual({
      towardsPenaltyPaise: 0,
      towardsEmiPaise: 0,
    });
  });
});

describe("loanColor (end-to-end scenarios)", () => {
  const today = d("2026-06-15");
  it("brand-new account this month with no payment is green (nothing due yet)", () => {
    expect(
      loanColor({ purchaseDate: "2026-06-15", tenureMonths: 24, paidCount: 0, today }),
    ).toBe("green");
  });
  it("5 months in, paid 2 -> 3 behind -> orange", () => {
    expect(
      loanColor({ purchaseDate: "2026-01-15", tenureMonths: 24, paidCount: 2, today }),
    ).toBe("orange");
  });
  it("never paid, 5 months in -> 5 behind -> red", () => {
    expect(
      loanColor({ purchaseDate: "2026-01-15", tenureMonths: 24, paidCount: 0, today }),
    ).toBe("red");
  });
  it("1 month behind -> yellow", () => {
    expect(
      loanColor({ purchaseDate: "2026-04-15", tenureMonths: 24, paidCount: 1, today }),
    ).toBe("yellow");
  });
  it("a part-paid month still counts as behind, not settled", () => {
    // 5 instalments due; Rs 5,000 EMI; the customer has handed over Rs 22,500,
    // so four months are settled and the fifth is Rs 2,500 short -> 1 behind.
    const settled = installmentsSettled(EMI, 4 * EMI + 250000, 24);
    expect(settled).toBe(4);
    expect(
      loanColor({
        purchaseDate: "2026-01-15",
        tenureMonths: 24,
        paidCount: settled,
        today,
      }),
    ).toBe("yellow");
  });
  it("returns null without a purchase date", () => {
    expect(
      loanColor({ purchaseDate: null, tenureMonths: 24, paidCount: 0, today }),
    ).toBeNull();
  });
  it("honours a first-EMI date pushed out beyond the default", () => {
    // Purchase 15 Jan would default to a 15 Feb first EMI (5 due by 15 Jun),
    // but the branch gave this customer until 15 May -> only 2 due.
    expect(
      loanColor({
        purchaseDate: "2026-01-15",
        firstEmiDate: "2026-05-15",
        tenureMonths: 24,
        paidCount: 0,
        today,
      }),
    ).toBe("yellow");
  });
  it("works from a first-EMI date alone, with no purchase date", () => {
    expect(
      loanColor({
        purchaseDate: null,
        firstEmiDate: "2026-02-15",
        tenureMonths: 24,
        paidCount: 0,
        today,
      }),
    ).toBe("red");
  });
});
