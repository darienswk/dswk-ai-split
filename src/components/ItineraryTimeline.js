import React, { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { v4 as uuidv4 } from "uuid";
import { deleteObject, ref } from "firebase/storage";
import { storage } from "../firebase";
import ItineraryDay from "./ItineraryDay";
import ItineraryItemForm from "./ItineraryItemForm";
import { ItineraryItemCard } from "./ItineraryItem";
import { deleteItem, findItem, formatDate, moveItemToDay, reorderWithinDay, saveItem } from "../utils/itinerary";

const deleteAttachments = (attachments) =>
  (attachments || []).forEach((a) =>
    deleteObject(ref(storage, a.path)).catch((err) => console.error("Failed to delete attachment:", err))
  );

export default function ItineraryTimeline({ itinerary, onChange }) {
  // While a drag is in progress the moves are kept locally in `draftDays` and only saved on drop,
  // so a single drag doesn't trigger a Firestore write for every day it passes over.
  const [draftDays, setDraftDays] = useState(null);
  const [activeItem, setActiveItem] = useState(null);
  const [form, setForm] = useState(null); // { dayId, item? }

  const days = draftDays || itinerary.days;
  const commit = (nextDays) => onChange({ ...itinerary, days: nextDays });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = ({ active }) => {
    setDraftDays(itinerary.days);
    setActiveItem(findItem(itinerary.days, active.id));
  };

  const handleDragOver = ({ active, over }) => {
    if (!over) return;
    const translated = active.rect.current.translated;
    const isBelow = !!translated && translated.top > over.rect.top + over.rect.height / 2;
    setDraftDays((prev) => moveItemToDay(prev || itinerary.days, active.id, over.id, isBelow));
  };

  const handleDragEnd = ({ active, over }) => {
    const current = draftDays || itinerary.days;
    const next = over ? reorderWithinDay(current, active.id, over.id) : current;
    setDraftDays(null);
    setActiveItem(null);
    if (next !== itinerary.days) commit(next);
  };

  const handleDragCancel = () => {
    setDraftDays(null);
    setActiveItem(null);
  };

  const handleSave = (values, existing) => {
    const id = existing ? existing.id : form.stopId;
    const nextDays = saveItem(itinerary.days, { ...values, id }, existing);
    commit(nextDays);
    setForm(null);
  };

  const handleDelete = (item) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    deleteAttachments(item.attachments);
    commit(deleteItem(itinerary.days, item.id));
  };

  const handleCityChange = (dayId, city) => {
    commit(itinerary.days.map((d) => (d.id === dayId ? { ...d, city } : d)));
  };

  const findDayOfItem = (item) => itinerary.days.find((d) => d.items.some((i) => i.id === item.id));

  const jumpTo = (dayId) =>
    document.getElementById(`itin-day-${dayId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div>
      <nav className="itin-nav" aria-label="Jump to day">
        {days.map((d) => (
          <button type="button" key={d.id} onClick={() => jumpTo(d.id)} title={formatDate(d.id)}>
            <small>{formatDate(d.id, { weekday: "short" })}</small>
            <strong>{parseInt(d.id.slice(8), 10)}</strong>
            {d.items.length > 0 && <i aria-label={`${d.items.length} stops`}>{d.items.length}</i>}
          </button>
        ))}
      </nav>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="itin-timeline">
          {days.map((day, i) => (
            <ItineraryDay
              key={day.id}
              day={day}
              index={i}
              onCityChange={handleCityChange}
              onAdd={(dayId) => setForm({ dayId, stopId: uuidv4() })}
              onEdit={(item) => setForm({ dayId: findDayOfItem(item)?.id, item, stopId: item.id })}
              onDelete={handleDelete}
            />
          ))}
        </div>
        <DragOverlay>
          {activeItem ? <ItineraryItemCard item={activeItem} className="is-overlay" /> : null}
        </DragOverlay>
      </DndContext>

      {form && (
        <ItineraryItemForm
          days={itinerary.days}
          dayId={form.dayId}
          item={form.item}
          itineraryId={itinerary.id}
          stopId={form.stopId}
          onSave={handleSave}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
