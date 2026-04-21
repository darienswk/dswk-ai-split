import React from "react";
import { useApp } from "../context/AppContext";
import { getCurrencySymbol } from "../utils/currencies";

export default function TripList() {
  const { state, dispatch } = useApp();
  const { trips } = state;

  return (
    <div className="trip-list">
      <div className="page-header">
        <h1>My Trips</h1>
        <button
          className="btn btn-primary"
          onClick={() => dispatch({ type: "NAVIGATE", payload: { view: "createTrip" } })}
        >
          + New Trip
        </button>
      </div>

      {trips.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#9992;</div>
          <h2>No trips yet</h2>
          <p>Create your first trip to start splitting expenses with friends.</p>
        </div>
      ) : (
        <div className="trip-cards">
          {trips.map((trip) => {
            const totalExpenses = trip.expenses.reduce((sum, e) => sum + e.amount, 0);
            return (
              <div
                key={trip.id}
                className={`trip-card ${trip.isSettled ? "settled" : ""}`}
                onClick={() =>
                  dispatch({
                    type: "NAVIGATE",
                    payload: { view: "tripDetail", tripId: trip.id },
                  })
                }
              >
                <div className="trip-card-header">
                  <h3>{trip.name}</h3>
                  {trip.isSettled && <span className="badge badge-settled">Settled</span>}
                </div>
                {trip.description && <p className="trip-desc">{trip.description}</p>}
                <div className="trip-card-meta">
                  <span>{trip.members.length} members</span>
                  <span>{trip.expenses.length} expenses</span>
                  <span>
                    {getCurrencySymbol(trip.defaultCurrency)}
                    {totalExpenses.toFixed(2)} total
                  </span>
                </div>
                <div className="trip-card-date">
                  {new Date(trip.createdAt).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
