import { buildTripReport, describeSplit, exportTripToPdf, formatAmount } from "./exportTripPdf";

// Fake jsPDF that records the text drawn and the saved filename. Names start with "mock" so jest
// allows the factory below to reference them.
let mockCalls;
jest.mock("jspdf", () => {
  class FakeJsPDF {
    constructor() {
      mockCalls = { text: [], pages: 1, save: null };
    }
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setDrawColor() {}
    setFillColor() {}
    rect() {}
    line() {}
    splitTextToSize(text) {
      return [String(text)];
    }
    text(str) {
      mockCalls.text.push(str);
    }
    addPage() {
      mockCalls.pages += 1;
    }
    setPage() {}
    get internal() {
      return { getNumberOfPages: () => mockCalls.pages };
    }
    save(filename) {
      mockCalls.save = filename;
    }
  }
  return { jsPDF: FakeJsPDF };
});
// exportPdf.js (for sanitizeFilename) imports pdf-lib, which isn't needed here.
jest.mock("pdf-lib", () => ({}));

const members = [
  { id: "a", name: "Alice" },
  { id: "b", name: "Bob" },
  { id: "c", name: "Cara" },
];

const trip = {
  id: "t1",
  name: "Japan / Korea 2026",
  description: "Winter trip",
  defaultCurrency: "SGD",
  members,
  isSettled: false,
  settlements: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  expenses: [
    {
      id: "e1",
      description: "Hotel",
      amount: 300,
      currency: "SGD",
      category: "General",
      paidBy: "a",
      splitAmong: ["a", "b", "c"],
      splitType: "equal",
      createdAt: "2026-11-02T10:00:00.000Z",
    },
    {
      id: "e2",
      description: "Sushi",
      amount: 90,
      currency: "SGD",
      category: "Dining",
      paidBy: "b",
      splitAmong: ["a", "b"],
      splitType: "exact",
      splitDetails: { a: 60, b: 30 },
      createdAt: "2026-11-03T10:00:00.000Z",
    },
    {
      id: "e3",
      description: "Train",
      amount: 10000,
      currency: "JPY",
      category: "Transport",
      paidBy: "c",
      splitAmong: ["a", "c"],
      splitType: "percentage",
      splitDetails: { a: 25, c: 75 },
      createdAt: "2026-11-04T10:00:00.000Z",
    },
  ],
};

describe("formatAmount", () => {
  test("uses the currency code, thousands separators and 2 decimals", () => {
    expect(formatAmount(1234.5, "SGD")).toBe("SGD 1,234.50");
    expect(formatAmount(-12, "JPY")).toBe("JPY 12.00");
    expect(formatAmount(7, "")).toBe("7.00");
  });
});

describe("describeSplit", () => {
  const name = (id) => members.find((m) => m.id === id)?.name || "Unknown";
  test("equal split among everyone vs some", () => {
    expect(describeSplit({ splitAmong: ["a", "b", "c"], splitType: "equal" }, members, name)).toBe(
      "Equally, everyone"
    );
    expect(describeSplit({ splitAmong: ["a", "c"] }, members, name)).toBe("Equally, Alice, Cara");
  });
  test("exact and percentage splits list each person's part", () => {
    expect(describeSplit(trip.expenses[1], members, name)).toBe("Alice 60.00, Bob 30.00");
    expect(describeSplit(trip.expenses[2], members, name)).toBe("Alice 25%, Cara 75%");
  });
});

describe("buildTripReport", () => {
  test("groups by currency (default first) with paid, share and balance per member", () => {
    const report = buildTripReport(trip);
    expect(report.sections.map((s) => s.currency)).toEqual(["SGD", "JPY"]);

    const sgd = report.sections[0];
    expect(sgd.total).toBe(390);
    expect(sgd.count).toBe(2);
    expect(sgd.memberRows).toEqual([
      { name: "Alice", paid: 300, share: 160, net: 140 },
      { name: "Bob", paid: 90, share: 130, net: -40 },
      { name: "Cara", paid: 0, share: 100, net: -100 },
    ]);
    // Balances always sum to zero within a currency.
    expect(sgd.memberRows.reduce((s, m) => s + m.net, 0)).toBeCloseTo(0);
    expect(sgd.categoryRows).toEqual([
      { category: "General", count: 1, amount: 300, percent: 77 },
      { category: "Dining", count: 1, amount: 90, percent: 23 },
    ]);
    expect(sgd.payments).toEqual(
      expect.arrayContaining([
        { from: "Cara", to: "Alice", amount: 100 },
        { from: "Bob", to: "Alice", amount: 40 },
      ])
    );

    const jpy = report.sections[1];
    expect(jpy.memberRows.find((m) => m.name === "Alice")).toEqual({
      name: "Alice",
      paid: 0,
      share: 2500,
      net: -2500,
    });
    expect(jpy.payments).toEqual([{ from: "Alice", to: "Cara", amount: 2500 }]);
  });

  test("lists every expense in order with readable fields", () => {
    const rows = buildTripReport(trip).expenseRows;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      number: 1,
      date: "2 Nov 2026",
      description: "Hotel",
      category: "General",
      paidBy: "Alice",
      amount: "SGD 300.00",
      split: "Equally, everyone",
    });
    expect(rows[2].amount).toBe("JPY 10,000.00");
  });

  test("tolerates missing fields and members that no longer exist", () => {
    const report = buildTripReport({
      name: "",
      members: [{ id: "a", name: "Alice" }],
      expenses: [{ id: "x", description: "Taxi", amount: 20, paidBy: "gone", splitAmong: ["a"] }],
    });
    expect(report.name).toBe("Untitled Trip");
    expect(report.sections[0].currency).toBe("USD");
    expect(report.expenseRows[0]).toMatchObject({ paidBy: "Unknown", category: "General", date: "—" });
  });

  test("includes recorded settlements for a settled trip", () => {
    const report = buildTripReport({
      ...trip,
      isSettled: true,
      settledAt: "2026-11-20T00:00:00.000Z",
      settlements: [{ from: "c", to: "a", amount: 100, currency: "SGD" }],
    });
    expect(report.isSettled).toBe(true);
    expect(report.settledAt).toBe("20 Nov 2026");
    expect(report.settlements).toEqual([{ from: "Cara", to: "Alice", amount: "SGD 100.00" }]);
  });
});

describe("exportTripToPdf", () => {
  test("draws the summary, payments and every expense, and saves with a safe filename", () => {
    exportTripToPdf(trip);
    const text = mockCalls.text.join("\n");

    expect(mockCalls.save).toBe("Japan_Korea_2026_expenses.pdf");
    expect(text).toContain("Japan / Korea 2026");
    expect(text).toContain("Members: Alice, Bob, Cara");
    expect(text).toMatch(/Summary — SGD .*total SGD 390\.00, 2 expenses/);
    expect(text).toMatch(/Summary — JPY .*total JPY 10,000\.00, 1 expense\)/);
    expect(text).toContain("gets back 140.00");
    expect(text).toContain("owes 100.00");
    expect(text).toContain("Suggested payments to settle up");
    ["Hotel", "Sushi", "Train", "SGD 300.00", "Alice 60.00, Bob 30.00", "Alice 25%, Cara 75%"].forEach((s) =>
      expect(mockCalls.text).toContain(s)
    );
    expect(text).toMatch(/Japan \/ Korea 2026 · Expenses · Page 1 of \d+/);
  });

  test("a settled trip shows the settlement payments instead of suggestions", () => {
    exportTripToPdf({ ...trip, isSettled: true, settlements: [{ from: "c", to: "a", amount: 100, currency: "SGD" }] });
    const text = mockCalls.text.join("\n");
    expect(text).toContain("Settlement payments");
    expect(text).not.toContain("Suggested payments to settle up");
    expect(text).toContain("Balance (before settling)");
  });

  test("a trip with no expenses still exports", () => {
    exportTripToPdf({ ...trip, expenses: [] });
    expect(mockCalls.text).toContain("No expenses recorded for this trip.");
    expect(mockCalls.save).toBe("Japan_Korea_2026_expenses.pdf");
  });
});
