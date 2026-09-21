import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import ItineraryDates from "./ItineraryDates";
import ItineraryTimeline from "./ItineraryTimeline";
import { countOutside, formatDate, resizeItinerary } from "../utils/itinerary";

export default function ItineraryDetail() {
  const { state, dispatch } = useApp();
  const itinerary = state.itineraries.find((i) => i.id === state.currentItineraryId);
  const [editingDates, setEditingDates] = useState(false);

  const goToList = () => dispatch({ type: "NAVIGATE", payload: { view: "itineraryList" } });

  if (!itinerary) {
    return (
      <div>
        <p>Itinerary not found.</p>
        <button className="btn btn-back" onClick={goToList}>
          &larr; Back to Itineraries
        </button>
      </div>
    );
  }

  const save = (updated) => dispatch({ type: "SET_ITINERARY", payload: { itinerary: updated } });

  const handleDates = (start, end) => {
    const outside = countOutside(itinerary, start, end);
    if (
      outside > 0 &&
      !window.confirm(
        `${outside} stop${outside === 1 ? " falls" : "s fall"} outside the new dates and will be moved to the first or last day. Continue?`
      )
    ) {
      return;
    }
    save(resizeItinerary(itinerary, start, end));
    setEditingDates(false);
  };

  const handleDelete = () => {
    if (window.confirm(`Delete "${itinerary.name}"? This cannot be undone.`)) {
      dispatch({ type: "DELETE_ITINERARY", payload: { itineraryId: itinerary.id } });
    }
  };

  const range = `${formatDate(itinerary.startDate, { day: "numeric", month: "short" })} – ${formatDate(
    itinerary.endDate,
    { day: "numeric", month: "short", year: "numeric" }
  )}`;

  return (
    <div className="trip-detail">
      <div className="trip-detail-header">
        <button className="btn btn-back" onClick={goToList}>
          &larr; Back
        </button>
        <div className="trip-detail-title">
          <h1>{itinerary.name}</h1>
          {itinerary.description && <p className="trip-desc">{itinerary.description}</p>}
        </div>
        <button className="btn btn-danger-sm" onClick={handleDelete} title="Delete itinerary">
          Delete Itinerary
        </button>
      </div>

      <div className="itin-toolbar">
        <span className="itin-range">
          {range} &middot; {itinerary.days.length} days
        </span>
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditingDates((v) => !v)}>
          {editingDates ? "Close" : "Change dates"}
        </button>
      </div>

      {editingDates && (
        <ItineraryDates
          initialStart={itinerary.startDate}
          initialEnd={itinerary.endDate}
          submitLabel="Update dates"
          onSubmit={handleDates}
          onCancel={() => setEditingDates(false)}
        />
      )}

      <ItineraryTimeline itinerary={itinerary} onChange={save} />
    </div>
  );
}
