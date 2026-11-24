import { jsPDF } from "jspdf";
import { calculatePerCurrencyBalances, getMemberShare } from "./balances";
import { sanitizeFilename } from "./exportPdf";

// A4 in points, matching the itinerary export.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_SPACE = 24;
const CELL_PAD = 4;

const INK = [30, 30, 35];
const MUTED = [110, 110, 120];
const RULE = [210, 210, 220];
const HEADER_FILL = [236, 236, 244];
const ZEBRA_FILL = [248, 248, 251];
const POSITIVE = [0, 128, 90];
const NEGATIVE = [200, 60, 50];

// Amounts are written as "SGD 1,234.50" rather than with symbols: jsPDF's built-in fonts can't
// draw many currency symbols (₹, ₩, ฿, ...), and the code is unambiguous (¥ is both JPY and CNY).
export function formatAmount(amount, currency) {
  const n = Math.abs(Number(amount) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${n}` : n;
}

const round2 = (n) => Math.round(n * 100) / 100;

function formatDay(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function describeSplit(expense, members, memberName) {
  const ids = expense.splitAmong || [];
  if (expense.splitType === "exact" && expense.splitDetails) {
    return ids.map((id) => `${memberName(id)} ${formatAmount(expense.splitDetails[id], "")}`).join(", ");
  }
  if (expense.splitType === "percentage" && expense.splitDetails) {
    return ids.map((id) => `${memberName(id)} ${round2(expense.splitDetails[id] || 0)}%`).join(", ");
  }
  if (members.length > 1 && ids.length === members.length) return "Equally, everyone";
  return `Equally, ${ids.map(memberName).join(", ")}`;
}

// Turns a trip into plain report data (no PDF calls), grouped per currency like the Balances tab.
// No exchange-rate conversion: the report records exactly what was entered, so it never depends
// on a live rate API and is reproducible.
export function buildTripReport(trip) {
  const members = trip.members || [];
  const expenses = trip.expenses || [];
  const names = {};
  members.forEach((m) => (names[m.id] = m.name));
  const memberName = (id) => names[id] || "Unknown";

  const perCurrency = calculatePerCurrencyBalances(expenses, members);
  const currencies = Object.keys(perCurrency).sort((a, b) => {
    // Trip's default currency first, then alphabetical.
    if (a === trip.defaultCurrency) return -1;
    if (b === trip.defaultCurrency) return 1;
    return a.localeCompare(b);
  });

  const sections = currencies.map((currency) => {
    const curExpenses = expenses.filter((e) => (e.currency || "USD") === currency);
    const { debts, total } = perCurrency[currency];

    const memberRows = members.map((m) => {
      const paid = curExpenses.filter((e) => e.paidBy === m.id).reduce((s, e) => s + e.amount, 0);
      const share = curExpenses.reduce((s, e) => s + getMemberShare(e, m.id), 0);
      return { name: m.name, paid: round2(paid), share: round2(share), net: round2(paid - share) };
    });

    const byCategory = {};
    curExpenses.forEach((e) => {
      const cat = e.category || "General";
      byCategory[cat] = byCategory[cat] || { amount: 0, count: 0 };
      byCategory[cat].amount += e.amount;
      byCategory[cat].count += 1;
    });
    const categoryRows = Object.entries(byCategory)
      .map(([category, { amount, count }]) => ({
        category,
        count,
        amount: round2(amount),
        percent: total ? Math.round((amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      currency,
      total: round2(total),
      count: curExpenses.length,
      memberRows,
      categoryRows,
      payments: debts.map((d) => ({ from: memberName(d.from), to: memberName(d.to), amount: d.amount })),
    };
  });

  const expenseRows = expenses.map((e, i) => ({
    number: i + 1,
    date: formatDay(e.createdAt),
    description: e.description || "",
    category: e.category || "General",
    paidBy: memberName(e.paidBy),
    amount: formatAmount(e.amount, e.currency || "USD"),
    split: describeSplit(e, members, memberName),
  }));

  const settlements = (trip.settlements || []).map((s) => ({
    from: memberName(s.from),
    to: memberName(s.to),
    amount: formatAmount(s.amount, s.currency),
  }));

  return {
    name: trip.name || "Untitled Trip",
    description: trip.description || "",
    members: members.map((m) => m.name),
    isSettled: !!trip.isSettled,
    settledAt: trip.settledAt ? formatDay(trip.settledAt) : null,
    createdAt: formatDay(trip.createdAt),
    expenseCount: expenses.length,
    sections,
    expenseRows,
    settlements,
  };
}

// Renders a trip's expenses to a downloadable PDF: per-currency summary (who paid, who owes),
// category breakdown, settle-up payments, and the full itemised expense list.
export function exportTripToPdf(trip) {
  const report = buildTripReport(trip);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  const ensureSpace = (needed) => {
    if (y + needed > PAGE_HEIGHT - MARGIN - FOOTER_SPACE) {
      doc.addPage();
      y = MARGIN;
      return true;
    }
    return false;
  };

  const setText = (size, style, color) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const write = (text, { size = 10, style = "normal", color = INK, gap = 4 } = {}) => {
    setText(size, style, color);
    const lines = doc.splitTextToSize(String(text), CONTENT_WIDTH);
    const lineHeight = size * 1.28;
    ensureSpace(lines.length * lineHeight + gap);
    lines.forEach((line, i) => doc.text(line, MARGIN, y + size + i * lineHeight));
    y += lines.length * lineHeight + gap;
  };

  const heading = (text) => {
    ensureSpace(60); // keep a heading with at least the start of its content
    write(text, { size: 13, style: "bold", gap: 4 });
    doc.setDrawColor(...RULE);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 8;
  };

  // A small bold label above a table; kept on the same page as the table's header + first row.
  const subheading = (text) => {
    ensureSpace(70);
    write(text, { size: 10, style: "bold", gap: 4 });
  };

  // columns: [{ label, width (fraction of content width), align: "left"|"right" }]
  // rows: arrays of cell strings, or { cells, color: [index -> rgb] } for coloured cells
  const table = (columns, rows, { size = 9 } = {}) => {
    const widths = columns.map((c) => c.width * CONTENT_WIDTH);
    const lineHeight = size * 1.25;

    const drawRow = (cells, { bold = false, fill = null, colors = {} } = {}) => {
      setText(size, bold ? "bold" : "normal", INK);
      const wrapped = cells.map((cell, i) => doc.splitTextToSize(String(cell ?? ""), widths[i] - CELL_PAD * 2));
      const height = Math.max(...wrapped.map((l) => l.length)) * lineHeight + CELL_PAD * 2;
      const pageBroke = ensureSpace(height);
      if (fill) {
        doc.setFillColor(...fill);
        doc.rect(MARGIN, y, CONTENT_WIDTH, height, "F");
      }
      let x = MARGIN;
      wrapped.forEach((lines, i) => {
        doc.setTextColor(...(colors[i] || INK));
        lines.forEach((line, li) => {
          const ty = y + CELL_PAD + size + li * lineHeight - 1.5;
          if (columns[i].align === "right") {
            doc.text(line, x + widths[i] - CELL_PAD, ty, { align: "right" });
          } else {
            doc.text(line, x + CELL_PAD, ty);
          }
        });
        x += widths[i];
      });
      y += height;
      return pageBroke;
    };

    const drawHeader = () => drawRow(columns.map((c) => c.label), { bold: true, fill: HEADER_FILL });
    ensureSpace((lineHeight + CELL_PAD * 2) * 2); // never leave a header alone at the bottom of a page
    drawHeader();
    rows.forEach((row, ri) => {
      const cells = Array.isArray(row) ? row : row.cells;
      const opts = { fill: ri % 2 === 1 ? ZEBRA_FILL : null, bold: !!row.bold, colors: row.colors || {} };
      // Measure first: if this row would start a new page, repeat the header there.
      setText(size, opts.bold ? "bold" : "normal", INK);
      const height =
        Math.max(...cells.map((c, i) => doc.splitTextToSize(String(c ?? ""), widths[i] - CELL_PAD * 2).length)) *
          lineHeight +
        CELL_PAD * 2;
      if (ensureSpace(height)) drawHeader();
      drawRow(cells, opts);
    });
    doc.setDrawColor(...RULE);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 14;
  };

  // --- Title block ---------------------------------------------------------
  write(report.name, { size: 20, style: "bold", gap: 4 });
  if (report.description) write(report.description, { size: 10, style: "italic", color: MUTED, gap: 4 });
  write(`Members: ${report.members.join(", ") || "—"}`, { size: 10, color: MUTED, gap: 2 });
  write(
    `${report.expenseCount} expense${report.expenseCount === 1 ? "" : "s"} · Created ${report.createdAt}` +
      (report.isSettled ? ` · Settled${report.settledAt ? ` ${report.settledAt}` : ""}` : " · Not yet settled"),
    { size: 10, color: MUTED, gap: 2 }
  );
  const generatedOn = new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  write(`Generated ${generatedOn}. Amounts are shown in the currency they were entered in (no conversion).`, {
    size: 8,
    color: MUTED,
    gap: 16,
  });

  if (report.expenseCount === 0) {
    write("No expenses recorded for this trip.", { size: 10, style: "italic", color: MUTED });
  }

  // --- Per-currency summary -------------------------------------------------
  report.sections.forEach((s) => {
    heading(`Summary — ${s.currency}   (total ${formatAmount(s.total, s.currency)}, ${s.count} expense${s.count === 1 ? "" : "s"})`);

    subheading("Who paid and who owes");
    table(
      [
        { label: "Member", width: 0.34 },
        { label: "Paid", width: 0.2, align: "right" },
        { label: "Share of costs", width: 0.2, align: "right" },
        { label: report.isSettled ? "Balance (before settling)" : "Balance", width: 0.26, align: "right" },
      ],
      [
        ...s.memberRows.map((m) => ({
          cells: [
            m.name,
            formatAmount(m.paid, ""),
            formatAmount(m.share, ""),
            m.net > 0.01
              ? `gets back ${formatAmount(m.net, "")}`
              : m.net < -0.01
              ? `owes ${formatAmount(m.net, "")}`
              : "settled up",
          ],
          colors: { 3: m.net > 0.01 ? POSITIVE : m.net < -0.01 ? NEGATIVE : MUTED },
        })),
        { cells: ["Total", formatAmount(s.total, ""), formatAmount(s.total, ""), ""], bold: true },
      ]
    );

    subheading("Spending by category");
    table(
      [
        { label: "Category", width: 0.4 },
        { label: "Expenses", width: 0.16, align: "right" },
        { label: "Amount", width: 0.26, align: "right" },
        { label: "% of total", width: 0.18, align: "right" },
      ],
      s.categoryRows.map((c) => [c.category, String(c.count), formatAmount(c.amount, ""), `${c.percent}%`])
    );

    if (!report.isSettled) {
      subheading("Suggested payments to settle up");
      if (s.payments.length === 0) {
        write("Everyone is settled up.", { size: 9.5, style: "italic", color: MUTED, gap: 14 });
      } else {
        table(
          [
            { label: "From", width: 0.35 },
            { label: "To", width: 0.35 },
            { label: "Amount", width: 0.3, align: "right" },
          ],
          s.payments.map((p) => [p.from, p.to, formatAmount(p.amount, s.currency)])
        );
      }
    }
  });

  if (report.isSettled && report.settlements.length > 0) {
    heading("Settlement payments");
    table(
      [
        { label: "From", width: 0.35 },
        { label: "To", width: 0.35 },
        { label: "Amount", width: 0.3, align: "right" },
      ],
      report.settlements.map((p) => [p.from, p.to, p.amount])
    );
  }

  // --- Itemised list --------------------------------------------------------
  if (report.expenseRows.length > 0) {
    heading("All expenses");
    table(
      [
        { label: "#", width: 0.05, align: "right" },
        { label: "Date", width: 0.12 },
        { label: "Description", width: 0.23 },
        { label: "Category", width: 0.12 },
        { label: "Paid by", width: 0.13 },
        { label: "Amount", width: 0.15, align: "right" },
        { label: "Split", width: 0.2 },
      ],
      report.expenseRows.map((e) => [String(e.number), e.date, e.description, e.category, e.paidBy, e.amount, e.split]),
      { size: 8.5 }
    );
  }

  // --- Footer ---------------------------------------------------------------
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    setText(8, "normal", MUTED);
    doc.text(`${report.name} · Expenses · Page ${p} of ${pageCount}`, MARGIN, PAGE_HEIGHT - 20);
  }

  doc.save(`${sanitizeFilename(report.name)}_expenses.pdf`);
}
