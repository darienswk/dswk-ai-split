import React from "react";
import { formatMoney } from "../utils/currencies";

export default function BalanceSummary({ trip, perCurrency, memberMap }) {
  const currencies = Object.keys(perCurrency);

  if (trip.expenses.length === 0) {
    return (
      <div className="empty-state small">
        <p>No expenses to show balances for.</p>
      </div>
    );
  }

  return (
    <div className="balance-summary">
      {currencies.map((currency) => {
        const { netBalances, debts, total } = perCurrency[currency];
        return (
          <div key={currency} className="currency-section">
            <h3 className="currency-title">
              {currency} <span className="total-tag">Total: {formatMoney(total, currency)}</span>
            </h3>

            {/* Individual balances */}
            <div className="balance-cards">
              {trip.members.map((member) => {
                const balance = netBalances[member.id] || 0;
                const rounded = Math.round(balance * 100) / 100;
                return (
                  <div
                    key={member.id}
                    className={`balance-card ${
                      rounded > 0.01 ? "positive" : rounded < -0.01 ? "negative" : "zero"
                    }`}
                  >
                    <span className="balance-name">{member.name}</span>
                    <span className="balance-amount">
                      {rounded > 0.01
                        ? `gets back ${formatMoney(rounded, currency)}`
                        : rounded < -0.01
                        ? `owes ${formatMoney(rounded, currency)}`
                        : "settled up"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Simplified debts */}
            {debts.length > 0 && (
              <div className="debts-section">
                <h4>Simplified Payments</h4>
                {debts.map((debt, i) => (
                  <div key={i} className="debt-row">
                    <span className="debt-from">{memberMap[debt.from]}</span>
                    <span className="debt-arrow">&rarr;</span>
                    <span className="debt-to">{memberMap[debt.to]}</span>
                    <span className="debt-amount">{formatMoney(debt.amount, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
