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
  suggestedPenaltyPaise,
  loanColor,
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

describe("suggestedPenaltyPaise (monthly fixed Rs 500)", () => {
  it("charges one slab per month behind", () => {
    expect(suggestedPenaltyPaise(0, "monthly_fixed", 50000)).toBe(0);
    expect(suggestedPenaltyPaise(1, "monthly_fixed", 50000)).toBe(50000);
    expect(suggestedPenaltyPaise(3, "monthly_fixed", 50000)).toBe(150000);
  });
  it("suggests nothing for per-day loans (needs the auto-penalty engine)", () => {
    expect(suggestedPenaltyPaise(3, "per_day", 5000)).toBe(0);
  });
  it("is safe with missing config", () => {
    expect(suggestedPenaltyPaise(3, null, null)).toBe(0);
    expect(suggestedPenaltyPaise(-2, "monthly_fixed", 50000)).toBe(0);
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
