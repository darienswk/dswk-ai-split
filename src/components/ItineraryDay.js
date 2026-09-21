import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import ItineraryItem from "./ItineraryItem";
import { formatDate } from "../utils/itinerary";

export default function ItineraryDay({ day, index, onCityChange, onAdd, onEdit, onDelete }) {
  // The list itself is droppable so stops can be dropped into an empty day.
  const { setNodeRef, isOver } = useDroppable({ id: day.id });

  const commitCity = (e) => {
    const value = e.target.value.trim();
    if (value !== day.city) onCityChange(day.id, value);
  };

  return (
    <section className="itin-day" id={`itin-day-${day.id}`}>
      <div className="itin-rail">
        <div className="itin-dot" />
      </div>
      <div className="itin-day-main">
        <header className="itin-day-header">
          <div className="itin-day-date">
            <span className="itin-day-num">Day {index + 1}</span>
            <h3>{formatDate(day.id)}</h3>
          </div>
          {/* Uncontrolled + saved on blur, so typing doesn't trigger a save per keystroke. */}
          <input
            key={day.city}
            className="itin-city"
            defaultValue={day.city}
            placeholder="Add city / base..."
            aria-label={`City for day ${index + 1}`}
            onBlur={commitCity}
            onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
          />
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => onAdd(day.id)}>
            + Add
          </button>
        </header>

        <SortableContext items={day.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul ref={setNodeRef} className={`itin-list${isOver ? " is-over" : ""}`}>
            {day.items.map((item) => (
              <ItineraryItem key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} />
            ))}
            {day.items.length === 0 && (
              <li className="itin-empty">Nothing planned &ndash; drop a stop here or add one</li>
            )}
          </ul>
        </SortableContext>
      </div>
    </section>
  );
}
