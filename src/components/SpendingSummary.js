import React, { useState, useEffect } from "react";
import { formatMoney } from "../utils/currencies";

const CATEGORY_COLORS = {
  General: "#6c5ce7",
  Dining: "#e17055",
  Transport: "#00b894",
  Shopping: "#fdcb6e",
  Attractions: "#0984e3",
  Accommodation: "#e84393",
  Flights: "#00cec9",
};

function useExchangeRates(baseCurrency) {
  const [rates, setRates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchRates() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `https://api.frankfurter.app/latest?base=${baseCurrency}`
        );
        if (!res.ok) throw new Error("Failed to fetch rates");
        const data = await res.json();
        if (!cancelled) {
          // Add the base currency itself with rate 1
          setRates({ ...data.rates, [baseCurrency]: 1 });
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRates();
    return () => { cancelled = true; };
  }, [baseCurrency]);

  return { rates, loading, error };
}

function PieChart({ slices, size = 160 }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  if (slices.length === 0) {
    return (
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="var(--bg-input)" stroke="var(--border)" strokeWidth="1" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="var(--text-dim)" fontSize="12">
          No data
        </text>
      </svg>
    );
  }

  if (slices.length === 1) {
    return (
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill={slices[0].color} />
      </svg>
    );
  }

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  let cumulative = 0;
  const paths = [];

  slices.forEach((slice, i) => {
    const fraction = slice.value / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += fraction;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = fraction > 0.5 ? 1 : 0;

    paths.push(
      <path
        key={i}
        d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={slice.color}
      />
    );
  });

  return (
    <svg width={size} height={size}>
      {paths}
    </svg>
  );
}

function MemberSpending({ member, expenses, defaultCurrency, rates }) {
  const paidExpenses = expenses.filter((e) => e.paidBy === member.id);

  // Convert all to default currency
  const convertedExpenses = paidExpenses.map((e) => ({
    ...e,
    convertedAmount: convertToBase(e.amount, e.currency, rates),
  }));

  const totalSpend = convertedExpenses.reduce((sum, e) => sum + e.convertedAmount, 0);

  // Group by category
  const byCategory = {};
  convertedExpenses.forEach((e) => {
    const cat = e.category || "General";
    byCategory[cat] = (byCategory[cat] || 0) + e.convertedAmount;
  });

  const slices = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amount]) => ({
      label: cat,
      value: amount,
      color: CATEGORY_COLORS[cat] || "#6c5ce7",
    }));

  return (
    <div className="spending-member-card">
      <div className="spending-header">
        <h3>{member.name}</h3>
        <span className="spending-total">
          {formatMoney(totalSpend, defaultCurrency)} {defaultCurrency}
        </span>
      </div>
      {paidExpenses.length === 0 ? (
        <p className="spending-empty">No expenses paid</p>
      ) : (
        <div className="spending-body">
          <PieChart slices={slices} />
          <div className="spending-legend">
            {slices.map((s) => (
              <div key={s.label} className="legend-item">
                <span className="legend-dot" style={{ background: s.color }} />
                <span className="legend-label">{s.label}</span>
                <span className="legend-value">
                  {formatMoney(s.value, defaultCurrency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function convertToBase(amount, fromCurrency, rates) {
  if (!rates || !rates[fromCurrency]) return amount;
  return amount / rates[fromCurrency];
}

export default function SpendingSummary({ trip }) {
  const [selectedMember, setSelectedMember] = useState("all");
  const { rates, loading, error } = useExchangeRates(trip.defaultCurrency);

  const membersToShow =
    selectedMember === "all"
      ? trip.members
      : trip.members.filter((m) => m.id === selectedMember);

  if (trip.expenses.length === 0) {
    return (
      <div className="empty-state small">
        <p>No expenses to show spending for.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="empty-state small">
        <div className="loading-spinner" style={{ margin: "0 auto" }} />
        <p>Loading exchange rates...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state small">
        <p>Failed to load exchange rates. Showing raw amounts.</p>
      </div>
    );
  }

  return (
    <div className="spending-summary">
      <div className="spending-filter">
        <label>Show:</label>
        <select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)}>
          <option value="all">All Members</option>
          {trip.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <span className="spending-currency-note">
          All amounts in {trip.defaultCurrency}
        </span>
      </div>

      <div className="spending-grid">
        {membersToShow.map((m) => (
          <MemberSpending
            key={m.id}
            member={m}
            expenses={trip.expenses}
            defaultCurrency={trip.defaultCurrency}
            rates={rates}
          />
        ))}
      </div>
    </div>
  );
}
