import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { CURRENCIES } from "../utils/currencies";

const CATEGORIES = [
  "General",
  "Dining",
  "Transport",
  "Shopping",
  "Attractions",
  "Accommodation",
  "Flights",
];

export default function AddExpense({ trip, onClose, expense }) {
  const { dispatch } = useApp();
  const isEditing = !!expense;

  const [description, setDescription] = useState(expense?.description || "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [currency, setCurrency] = useState(expense?.currency || trip.defaultCurrency);
  const [category, setCategory] = useState(expense?.category || "General");
  const [paidBy, setPaidBy] = useState(expense?.paidBy || trip.members[0]?.id || "");
  const [splitAmong, setSplitAmong] = useState(
    expense?.splitAmong || trip.members.map((m) => m.id)
  );

  const toggleMember = (memberId) => {
    setSplitAmong((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!description.trim() || isNaN(parsedAmount) || parsedAmount <= 0 || splitAmong.length === 0)
      return;

    if (isEditing) {
      dispatch({
        type: "EDIT_EXPENSE",
        payload: {
          tripId: trip.id,
          expenseId: expense.id,
          updates: {
            description: description.trim(),
            amount: parsedAmount,
            currency,
            category,
            paidBy,
            splitAmong,
          },
        },
      });
    } else {
      dispatch({
        type: "ADD_EXPENSE",
        payload: {
          tripId: trip.id,
          expense: {
            description: description.trim(),
            amount: parsedAmount,
            currency,
            category,
            paidBy,
            splitAmong,
          },
        },
      });
    }
    onClose();
  };

  const perPerson =
    splitAmong.length > 0 && amount ? (parseFloat(amount) / splitAmong.length).toFixed(2) : "0.00";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? "Edit Expense" : "Add Expense"}</h2>
          <button className="btn btn-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label>Description *</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Dinner at restaurant"
              autoFocus
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Amount *</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Paid by</label>
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {trip.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Split among</label>
            <div className="split-checkboxes">
              {trip.members.map((m) => (
                <label key={m.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={splitAmong.includes(m.id)}
                    onChange={() => toggleMember(m.id)}
                  />
                  {m.name}
                </label>
              ))}
            </div>
            {splitAmong.length > 0 && amount && (
              <p className="hint">
                {splitAmong.length} {splitAmong.length === 1 ? "person" : "people"} &middot;{" "}
                {perPerson} each
              </p>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                !description.trim() ||
                !amount ||
                parseFloat(amount) <= 0 ||
                splitAmong.length === 0
              }
            >
              {isEditing ? "Save Changes" : "Add Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
