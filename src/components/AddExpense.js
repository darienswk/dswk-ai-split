import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { CURRENCIES } from "../utils/currencies";

const CATEGORIES = [
  "General",
  "Dining",
  "Transport",
  "Shopping",
  "Attractions",
];

const SPLIT_TYPES = [
  { value: "equal", label: "Equal" },
  { value: "exact", label: "Exact" },
  { value: "percentage", label: "%" },
];

function initSplitDetails(members, splitType, amount) {
  const details = {};
  if (members.length === 0) return details;
  if (splitType === "percentage") {
    const each = Math.floor(100 / members.length);
    const remainder = 100 - each * members.length;
    members.forEach((id, i) => {
      details[id] = i === 0 ? each + remainder : each;
    });
  } else if (splitType === "exact") {
    const parsed = parseFloat(amount) || 0;
    const each = members.length > 0 ? +(parsed / members.length).toFixed(2) : 0;
    const remainder = +(parsed - each * members.length).toFixed(2);
    members.forEach((id, i) => {
      details[id] = i === 0 ? +(each + remainder).toFixed(2) : each;
    });
  }
  return details;
}

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
  const [splitType, setSplitType] = useState(expense?.splitType || "equal");
  const [splitDetails, setSplitDetails] = useState(
    expense?.splitDetails ||
      initSplitDetails(
        expense?.splitAmong || trip.members.map((m) => m.id),
        expense?.splitType || "equal",
        expense ? String(expense.amount) : ""
      )
  );

  const toggleMember = (memberId) => {
    setSplitAmong((prev) => {
      const next = prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId];

      if (splitType !== "equal") {
        setSplitDetails(initSplitDetails(next, splitType, amount));
      }
      return next;
    });
  };

  const handleSplitTypeChange = (type) => {
    setSplitType(type);
    if (type !== "equal") {
      setSplitDetails(initSplitDetails(splitAmong, type, amount));
    }
  };

  const handleDetailChange = (memberId, value) => {
    setSplitDetails((prev) => ({
      ...prev,
      [memberId]: value === "" ? "" : parseFloat(value) || 0,
    }));
  };

  const parsedAmount = parseFloat(amount) || 0;

  // Validation for unequal splits
  const detailsTotal = splitAmong.reduce(
    (sum, id) => sum + (parseFloat(splitDetails[id]) || 0),
    0
  );
  const isExactValid = splitType !== "exact" || Math.abs(detailsTotal - parsedAmount) < 0.02;
  const isPercentValid = splitType !== "percentage" || Math.abs(detailsTotal - 100) < 0.1;
  const isSplitValid = isExactValid && isPercentValid;

  const getPerPersonDisplay = () => {
    if (splitAmong.length === 0 || !amount) return null;
    if (splitType === "equal") {
      return `${splitAmong.length} ${splitAmong.length === 1 ? "person" : "people"} \u00b7 ${(parsedAmount / splitAmong.length).toFixed(2)} each`;
    }
    if (splitType === "exact") {
      const diff = parsedAmount - detailsTotal;
      if (Math.abs(diff) < 0.02) return "Amounts add up correctly";
      return `${Math.abs(diff).toFixed(2)} ${diff > 0 ? "remaining" : "over"}`;
    }
    if (splitType === "percentage") {
      const diff = 100 - detailsTotal;
      if (Math.abs(diff) < 0.1) return "Percentages add up to 100%";
      return `${Math.abs(diff).toFixed(1)}% ${diff > 0 ? "remaining" : "over"}`;
    }
    return null;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (
      !description.trim() ||
      isNaN(parsedAmount) ||
      parsedAmount <= 0 ||
      splitAmong.length === 0 ||
      !isSplitValid
    )
      return;

    const expenseData = {
      description: description.trim(),
      amount: parsedAmount,
      currency,
      category,
      paidBy,
      splitAmong,
      splitType,
    };

    if (splitType !== "equal") {
      // Only store details for members in the split
      const filtered = {};
      splitAmong.forEach((id) => {
        filtered[id] = parseFloat(splitDetails[id]) || 0;
      });
      expenseData.splitDetails = filtered;
    }

    if (isEditing) {
      dispatch({
        type: "EDIT_EXPENSE",
        payload: {
          tripId: trip.id,
          expenseId: expense.id,
          updates: expenseData,
        },
      });
    } else {
      dispatch({
        type: "ADD_EXPENSE",
        payload: { tripId: trip.id, expense: expenseData },
      });
    }
    onClose();
  };

  const hintText = getPerPersonDisplay();
  const hintIsError =
    (splitType === "exact" && !isExactValid) ||
    (splitType === "percentage" && !isPercentValid);

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
            <div className="split-type-toggle">
              {SPLIT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`split-type-btn ${splitType === t.value ? "active" : ""}`}
                  onClick={() => handleSplitTypeChange(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="split-members-list">
              {trip.members.map((m) => {
                const isChecked = splitAmong.includes(m.id);
                return (
                  <div key={m.id} className="split-member-row">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleMember(m.id)}
                      />
                      {m.name}
                    </label>
                    {splitType !== "equal" && isChecked && (
                      <div className="split-detail-input">
                        <input
                          type="number"
                          value={splitDetails[m.id] ?? ""}
                          onChange={(e) => handleDetailChange(m.id, e.target.value)}
                          placeholder="0"
                          min="0"
                          step={splitType === "percentage" ? "1" : "0.01"}
                        />
                        <span className="split-detail-suffix">
                          {splitType === "percentage" ? "%" : currency}
                        </span>
                      </div>
                    )}
                    {splitType === "percentage" && isChecked && amount && (
                      <span className="split-detail-calc">
                        = {((parsedAmount * (parseFloat(splitDetails[m.id]) || 0)) / 100).toFixed(2)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {hintText && (
              <p className={`hint ${hintIsError ? "hint-error" : ""}`}>{hintText}</p>
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
                parsedAmount <= 0 ||
                splitAmong.length === 0 ||
                !isSplitValid
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
