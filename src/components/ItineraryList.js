import React from "react";
import { useApp } from "../context/AppContext";
import { countStops, formatDate } from "../utils/itinerary";

export default function ItineraryList() {
  const { state, dispatch } = useApp();
  const { itineraries } = state;

  return (
    <div className="trip-list">
      <div className="page-header">
        <h1>My Itineraries</h1>
        <button
          className="btn btn-primary"
          onClick={() => dispatch({ type: "NAVIGATE", payload: { view: "createItinerary" } })}
        >
          + New Itinerary
        </button>
      </div>

      {itineraries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#128506;</div>
          <h2>No itineraries yet</h2>
          <p>Create an itinerary to plan your trip day by day.</p>
        </div>
      ) : (
        <div className="trip-cards">
          {itineraries.map((itinerary) => {
            const stops = countStops(itinerary);
            return (
              <div
                key={itinerary.id}
                className="trip-card"
                onClick={() =>
                  dispatch({
                    type: "NAVIGATE",
                    payload: { view: "itineraryDetail", itineraryId: itinerary.id },
                  })
                }
              >
                <div className="trip-card-header">
                  <h3>{itinerary.name}</h3>
                </div>
                {itinerary.description && <p className="trip-desc">{itinerary.description}</p>}
                <div className="trip-card-meta">
                  <span>{itinerary.days.length} days</span>
                  <span>
                    {stops} stop{stops === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="trip-card-date">
                  {formatDate(itinerary.startDate, { day: "numeric", month: "short" })} &ndash;{" "}
                  {formatDate(itinerary.endDate, { day: "numeric", month: "short", year: "numeric" })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
