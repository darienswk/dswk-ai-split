import React, { useEffect, useState } from "react";
import { ITEM_TYPES, formatDate } from "../utils/itinerary";

// `item` is set when editing an existing stop; otherwise the form adds a new one to `dayId`.
export default function ItineraryItemForm({ days, dayId, item, onSave, onClose }) {
  const isEditing = !!item;
  const [title, setTitle] = useState(item?.title || "");
  const [type, setType] = useState(item?.type || "sight");
  const [time, setTime] = useState(item?.time || "");
  const [location, setLocation] = useState(item?.location || "");
  const [notes, setNotes] = useState(item?.notes || "");
  const [selectedDay, setSelectedDay] = useState(dayId);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(
      {
        dayId: selectedDay,
        title: title.trim(),
        type,
        time,
        location: location.trim(),
        notes: notes.trim(),
      },
      item
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? "Edit Stop" : "Add Stop"}</h2>
          <button className="btn btn-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Visit Edinburgh Castle"
              autoFocus
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group itin-date-field">
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {ITEM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group itin-date-field">
              <label>Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>Day</label>
            <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
              {days.map((d, i) => (
                <option key={d.id} value={d.id}>
                  Day {i + 1} &ndash; {formatDate(d.id)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Address or place name"
            />
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Booking ref, opening hours, tips..."
            />
          </div>

          <button type="submit" className="btn btn-primary btn-lg" disabled={!title.trim()}>
            {isEditing ? "Save Changes" : "Add Stop"}
          </button>
        </form>
      </div>
    </div>
  );
}
