import {
  calculateNetBalances,
  calculatePerCurrencyBalances,
  getMemberPaid,
  simplifyDebts,
} from "./balances";

const members = [
  { id: "a", name: "Alice" },
  { id: "b", name: "Bob" },
  { id: "c", name: "Cara" },
];

const dinner = { amount: 90, currency: "SGD", paidBy: "a", splitAmong: ["a", "b", "c"], splitType: "equal" };
const ownFares = {
  amount: 12,
  currency: "SGD",
  paidBy: null,
  paidByEach: true,
  splitAmong: ["a", "b"],
  splitType: "exact",
  splitDetails: { a: 5, b: 7 },
};

describe("getMemberPaid", () => {
  test("single payer paid the whole amount, everyone else nothing", () => {
    expect(getMemberPaid(dinner, "a")).toBe(90);
    expect(getMemberPaid(dinner, "b")).toBe(0);
  });

  test("when each paid their own share, each paid exactly their share", () => {
    expect(getMemberPaid(ownFares, "a")).toBe(5);
    expect(getMemberPaid(ownFares, "b")).toBe(7);
    expect(getMemberPaid(ownFares, "c")).toBe(0); // not in the split
    expect(getMemberPaid({ ...ownFares, splitType: "equal" }, "b")).toBe(6);
  });
});

describe("calculateNetBalances", () => {
  test("single payer is owed by the others", () => {
    expect(calculateNetBalances([dinner], members)).toEqual({ a: 60, b: -30, c: -30 });
  });

  test("an each-paid-own-share expense leaves everyone square", () => {
    expect(calculateNetBalances([ownFares], members)).toEqual({ a: 0, b: 0, c: 0 });
    expect(
      calculateNetBalances([{ ...ownFares, splitType: "percentage", splitDetails: { a: 30, b: 70 } }], members)
    ).toEqual({ a: 0, b: 0, c: 0 });
  });

  test("mixing both kinds only counts debts from the single-payer expenses", () => {
    const balances = calculateNetBalances([dinner, ownFares], members);
    expect(balances).toEqual({ a: 60, b: -30, c: -30 });
    expect(simplifyDebts(balances)).toEqual([
      { from: "b", to: "a", amount: 30 },
      { from: "c", to: "a", amount: 30 },
    ]);
  });

  test("a stale paidBy on an each-paid expense is ignored", () => {
    expect(calculateNetBalances([{ ...ownFares, paidBy: "c" }], members)).toEqual({ a: 0, b: 0, c: 0 });
  });
});

describe("calculatePerCurrencyBalances", () => {
  test("each-paid expenses still count towards the currency total", () => {
    const result = calculatePerCurrencyBalances([dinner, ownFares], members);
    expect(result.SGD.total).toBe(102);
    expect(result.SGD.debts).toHaveLength(2);
  });

  test("a trip of only each-paid expenses needs no settling", () => {
    const result = calculatePerCurrencyBalances([ownFares], members);
    expect(result.SGD.total).toBe(12);
    expect(result.SGD.debts).toEqual([]);
  });
});
