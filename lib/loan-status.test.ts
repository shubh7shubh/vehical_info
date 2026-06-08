import { describe, it, expect } from "vitest";
import {
  parseISODate,
  monthsElapsed,
  expectedInstallments,
  monthsBehind,
  categorize,
  loanColor,
} from "./loan-status";

const d = parseISODate;

describe("monthsElapsed", () => {
  it("is 0 on the purchase day", () => {
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
  it("never goes negative for a future purchase date", () => {
    expect(monthsElapsed(d("2026-06-01"), d("2026-01-01"))).toBe(0);
  });
});

describe("expectedInstallments", () => {
  it("caps at the loan tenure", () => {
    // 30 months elapsed but a 24-month loan -> only 24 ever expected.
    expect(expectedInstallments(d("2024-01-15"), d("2026-07-15"), 24)).toBe(24);
  });
  it("tracks elapsed months before the cap", () => {
    expect(expectedInstallments(d("2026-01-15"), d("2026-04-15"), 24)).toBe(3);
  });
});

describe("monthsBehind", () => {
  it("is 0 when paid keeps up with the schedule", () => {
    expect(monthsBehind(d("2026-01-15"), d("2026-04-15"), 24, 3)).toBe(0);
  });
  it("is the shortfall when behind", () => {
    expect(monthsBehind(d("2026-01-15"), d("2026-04-15"), 24, 1)).toBe(2);
  });
  it("never goes negative when over-paid", () => {
    expect(monthsBehind(d("2026-01-15"), d("2026-02-15"), 24, 5)).toBe(0);
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
});
