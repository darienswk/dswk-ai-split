import React, { useState } from "react";
import { MAX_ITINERARY_DAYS, getDateRange } from "../utils/itinerary";

// Start/end date inputs with a live day count and validation message.
export function DateRangeFields({ start, end, onStartChange, onEndChange }) {
  const dayCount = getDateRange(start, end).length;
  let error = "";
  if (start && end && end < start) error = "The end date must be on or after the start date.";
  else if (start && end && dayCount === 0) error = `An itinerary can cover at most ${MAX_ITINERARY_DAYS} days.`;

  return (
    <>
      <div className="form-row">
        <div className="form-group itin-date-field">
          <label>Start date *</label>
          <input type="date" value={start} onChange={(e) => onStartChange(e.target.value)} required />
        </div>
        <div className="form-group itin-date-field">
          <label>End date *</label>
          <input
            type="date"
            value={end}
            min={start || undefined}
            onChange={(e) => onEndChange(e.target.value)}
            required
          />
        </div>
      </div>
      {error && <p className="hint itin-error">{error}</p>}
      {dayCount > 0 && (
        <p className="hint">
          {dayCount} day{dayCount === 1 ? "" : "s"}
        </p>
      )}
    </>
  );
}

// Standalone form for changing the dates of an existing itinerary.
export default function ItineraryDates({ initialStart, initialEnd, submitLabel, onSubmit, onCancel }) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const valid = getDateRange(start, end).length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (valid) onSubmit(start, end);
  };

  return (
    <form onSubmit={handleSubmit} className="form itin-dates-form">
      <DateRangeFields start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
      <div className="itin-form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!valid}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
