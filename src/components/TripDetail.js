import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { calculatePerCurrencyBalances } from "../utils/balances";
import { formatMoney } from "../utils/currencies";
import AddExpense from "./AddExpense";
import BalanceSummary from "./BalanceSummary";
import SettleUp from "./SettleUp";
import SpendingSummary from "./SpendingSummary";

export default function TripDetail() {
  const { state, dispatch } = useApp();
  const trip = state.trips.find((t) => t.id === state.currentTripId);
  const [activeTab, setActiveTab] = useState("expenses");
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");

  if (!trip) {
    return (
      <div>
        <p>Trip not found.</p>
        <button
          className="btn btn-back"
          onClick={() => dispatch({ type: "NAVIGATE", payload: { view: "tripList" } })}
        >
          &larr; Back to Trips
        </button>
      </div>
    );
  }

  const memberMap = {};
  trip.members.forEach((m) => (memberMap[m.id] = m.name));

  const perCurrency = calculatePerCurrencyBalances(trip.expenses, trip.members);

  const handleAddMember = () => {
    const trimmed = newMemberName.trim();
    if (trimmed && !trip.members.some((m) => m.name === trimmed)) {
      dispatch({ type: "ADD_MEMBER", payload: { tripId: trip.id, memberName: trimmed } });
      setNewMemberName("");
      setShowAddMember(false);
    }
  };

  const handleDeleteExpense = (expenseId) => {
    if (window.confirm("Delete this expense?")) {
      dispatch({ type: "DELETE_EXPENSE", payload: { tripId: trip.id, expenseId } });
    }
  };

  const handleDeleteTrip = () => {
    if (window.confirm(`Delete "${trip.name}"? This cannot be undone.`)) {
      dispatch({ type: "DELETE_TRIP", payload: { tripId: trip.id } });
    }
  };

  return (
    <div className="trip-detail">
      <div className="trip-detail-header">
        <button
          className="btn btn-back"
          onClick={() => dispatch({ type: "NAVIGATE", payload: { view: "tripList" } })}
        >
          &larr; Back
        </button>
        <div className="trip-detail-title">
          <h1>
            {trip.name}
            {trip.isSettled && <span className="badge badge-settled">Settled</span>}
          </h1>
          {trip.description && <p className="trip-desc">{trip.description}</p>}
        </div>
        <button className="btn btn-danger-sm" onClick={handleDeleteTrip} title="Delete trip">
          Delete Trip
        </button>
      </div>

      {/* Members bar */}
      <div className="members-bar">
        <span className="members-label">Members:</span>
        {trip.members.map((m) => (
          <span key={m.id} className="member-chip">
            {m.name}
          </span>
        ))}
        {!trip.isSettled && (
          <>
            {showAddMember ? (
              <span className="add-member-inline">
                <input
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
                  placeholder="Name"
                  autoFocus
                />
                <button className="btn btn-sm" onClick={handleAddMember}>
                  Add
                </button>
                <button className="btn btn-sm" onClick={() => setShowAddMember(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="btn btn-sm btn-add-member" onClick={() => setShowAddMember(true)}>
                + Add
              </button>
            )}
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === "expenses" ? "active" : ""}`}
          onClick={() => setActiveTab("expenses")}
        >
          Expenses ({trip.expenses.length})
        </button>
        <button
          className={`tab ${activeTab === "spending" ? "active" : ""}`}
          onClick={() => setActiveTab("spending")}
        >
          Spending
        </button>
        <button
          className={`tab ${activeTab === "balances" ? "active" : ""}`}
          onClick={() => setActiveTab("balances")}
        >
          Balances
        </button>
        <button
          className={`tab ${activeTab === "settle" ? "active" : ""}`}
          onClick={() => setActiveTab("settle")}
        >
          Settle Up
        </button>
      </div>

      {/* Tab content */}
      <div className="tab-content">
        {activeTab === "expenses" && (
          <div className="expenses-tab">
            {!trip.isSettled && (
              <button
                className="btn btn-primary"
                onClick={() => setShowAddExpense(true)}
                style={{ marginBottom: "1rem" }}
              >
                + Add Expense
              </button>
            )}

            {showAddExpense && (
              <AddExpense
                trip={trip}
                onClose={() => setShowAddExpense(false)}
              />
            )}

            {editingExpense && (
              <AddExpense
                trip={trip}
                expense={editingExpense}
                onClose={() => setEditingExpense(null)}
              />
            )}

            {trip.expenses.length === 0 ? (
              <div className="empty-state small">
                <p>No expenses yet. Add your first expense to start tracking.</p>
              </div>
            ) : (
              <div className="expense-list">
                {[...trip.expenses].reverse().map((exp) => (
                  <div
                    key={exp.id}
                    className={`expense-card${!trip.isSettled ? " expense-card-editable" : ""}`}
                    onClick={() => !trip.isSettled && setEditingExpense(exp)}
                  >
                    <div className="expense-main">
                      <div className="expense-info">
                        <h4>
                          {exp.description}
                          {exp.category && (
                            <span className="expense-category">{exp.category}</span>
                          )}
                        </h4>
                        <p className="expense-meta">
                          Paid by <strong>{memberMap[exp.paidBy]}</strong> &middot; Split among{" "}
                          {exp.splitAmong.length === trip.members.length
                            ? "everyone"
                            : exp.splitAmong.map((id) => memberMap[id]).join(", ")}
                        </p>
                      </div>
                      <div className="expense-amount">
                        <span className="amount">{formatMoney(exp.amount, exp.currency)}</span>
                        <span className="currency-code">{exp.currency}</span>
                      </div>
                    </div>
                    {!trip.isSettled && (
                      <button
                        className="btn btn-danger-sm btn-delete-expense"
                        onClick={(e) => { e.stopPropagation(); handleDeleteExpense(exp.id); }}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "spending" && <SpendingSummary trip={trip} />}

        {activeTab === "balances" && (
          <BalanceSummary trip={trip} perCurrency={perCurrency} memberMap={memberMap} />
        )}

        {activeTab === "settle" && (
          <SettleUp trip={trip} perCurrency={perCurrency} memberMap={memberMap} />
        )}
      </div>
    </div>
  );
}
