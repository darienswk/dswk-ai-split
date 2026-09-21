import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { DateRangeFields } from "./ItineraryDates";
import { getDateRange } from "../utils/itinerary";

export default function CreateItinerary() {
  const { dispatch } = useApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const valid = name.trim() && getDateRange(startDate, endDate).length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!valid) return;
    dispatch({
      type: "CREATE_ITINERARY",
      payload: { name: name.trim(), description: description.trim(), startDate, endDate },
    });
  };

  return (
    <div className="create-trip">
      <button
        className="btn btn-back"
        onClick={() => dispatch({ type: "NAVIGATE", payload: { view: "itineraryList" } })}
      >
        &larr; Back
      </button>
      <h1>Create New Itinerary</h1>

      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>Itinerary Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., UK Trip 2026"
            required
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>

        <DateRangeFields
          start={startDate}
          end={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
        />

        <button type="submit" className="btn btn-primary btn-lg" disabled={!valid}>
          Create Itinerary
        </button>
      </form>
    </div>
  );
}
