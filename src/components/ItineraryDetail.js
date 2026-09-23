import React, { useState } from "react";
import { deleteObject, ref } from "firebase/storage";
import { storage } from "../firebase";
import { useApp } from "../context/AppContext";
import ItineraryDates from "./ItineraryDates";
import ItineraryTimeline from "./ItineraryTimeline";
import { countOutside, formatDate, getAllAttachments, resizeItinerary } from "../utils/itinerary";

export default function ItineraryDetail() {
  const { state, dispatch } = useApp();
  const itinerary = state.itineraries.find((i) => i.id === state.currentItineraryId);
  const [editingDates, setEditingDates] = useState(false);
  const [exporting, setExporting] = useState(false);

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
    if (!window.confirm(`Delete "${itinerary.name}"? This cannot be undone.`)) return;
    getAllAttachments(itinerary).forEach((a) =>
      deleteObject(ref(storage, a.path)).catch((err) => console.error("Failed to delete attachment:", err))
    );
    dispatch({ type: "DELETE_ITINERARY", payload: { itineraryId: itinerary.id } });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // Loaded on demand: jsPDF + pdf-lib are a meaningful chunk of weight that most visitors
      // (using this app for expense splitting, not exporting itineraries) never need to download.
      const { exportItineraryToPdf } = await import("../utils/exportPdf");
      await exportItineraryToPdf(itinerary);
    } catch (err) {
      console.error("Failed to export itinerary to PDF:", err);
      window.alert("Sorry, the PDF export failed. Please try again.");
    } finally {
      setExporting(false);
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
        <div className="itin-toolbar-actions">
          <button type="button" className="btn btn-sm btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting…" : "Export PDF"}
          </button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditingDates((v) => !v)}>
            {editingDates ? "Close" : "Change dates"}
          </button>
        </div>
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
