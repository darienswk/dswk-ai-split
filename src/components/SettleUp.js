import React from "react";
import { useApp } from "../context/AppContext";
import { formatMoney } from "../utils/currencies";

export default function SettleUp({ trip, perCurrency, memberMap }) {
  const { dispatch } = useApp();
  const currencies = Object.keys(perCurrency);

  if (trip.expenses.length === 0) {
    return (
      <div className="empty-state small">
        <p>No expenses to settle.</p>
      </div>
    );
  }

  // Collect all debts across currencies
  const allDebts = [];
  currencies.forEach((currency) => {
    perCurrency[currency].debts.forEach((debt) => {
      allDebts.push({ ...debt, currency });
    });
  });

  const handleSettle = () => {
    if (window.confirm("Mark this trip as settled? You can reopen it later if needed.")) {
      dispatch({
        type: "SETTLE_TRIP",
        payload: { tripId: trip.id, settlements: allDebts },
      });
    }
  };

  const handleReopen = () => {
    if (window.confirm("Reopen this trip for more expenses?")) {
      dispatch({ type: "REOPEN_TRIP", payload: { tripId: trip.id } });
    }
  };

  if (trip.isSettled) {
    return (
      <div className="settle-up">
        <div className="settled-banner">
          <div className="settled-icon">&#10003;</div>
          <h2>Trip Settled</h2>
          <p>
            Settled on{" "}
            {trip.settledAt ? new Date(trip.settledAt).toLocaleDateString() : "unknown date"}
          </p>
        </div>

        {trip.settlements && trip.settlements.length > 0 && (
          <div className="settlement-records">
            <h3>Settlement Summary</h3>
            {trip.settlements.map((s, i) => (
              <div key={i} className="debt-row settled-row">
                <span className="debt-from">{memberMap[s.from]}</span>
                <span className="debt-arrow">&rarr;</span>
                <span className="debt-to">{memberMap[s.to]}</span>
                <span className="debt-amount">
                  {formatMoney(s.amount, s.currency)} {s.currency}
                </span>
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-secondary" onClick={handleReopen} style={{ marginTop: "1rem" }}>
          Reopen Trip
        </button>
      </div>
    );
  }

  return (
    <div className="settle-up">
      <h2>Settle Up</h2>
      <p className="settle-description">
        Below are the minimum payments needed to settle all debts.
      </p>

      {allDebts.length === 0 ? (
        <div className="all-settled">
          <div className="settled-icon">&#10003;</div>
          <p>Everyone is already even! No payments needed.</p>
        </div>
      ) : (
        <>
          <div className="settle-debts">
            {allDebts.map((debt, i) => (
              <div key={i} className="settle-debt-card">
                <div className="settle-debt-people">
                  <span className="settle-from">{memberMap[debt.from]}</span>
                  <span className="settle-arrow">pays</span>
                  <span className="settle-to">{memberMap[debt.to]}</span>
                </div>
                <div className="settle-debt-amount">
                  {formatMoney(debt.amount, debt.currency)}{" "}
                  <span className="currency-code">{debt.currency}</span>
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-primary btn-lg" onClick={handleSettle}>
            Mark as Settled
          </button>
        </>
      )}
    </div>
  );
}
