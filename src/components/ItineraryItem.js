import React, { forwardRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getItemType } from "../utils/itinerary";

// Presentational card, shared by the sortable list item and the drag overlay.
export const ItineraryItemCard = forwardRef(function ItineraryItemCard(
  { item, onEdit, onDelete, handleProps, style, className = "" },
  ref
) {
  const type = getItemType(item.type);
  return (
    <li ref={ref} style={{ ...style, "--type-color": type.color }} className={`itin-item ${className}`}>
      <button type="button" className="itin-handle" aria-label={`Drag ${item.title}`} {...handleProps}>
        &#10303;
      </button>
      <div className="itin-time">{item.time || "—"}</div>
      <div className="itin-body">
        <div className="itin-title">
          <span aria-hidden="true">{type.icon}</span> {item.title}
        </div>
        {item.location && <div className="itin-meta">&#128205; {item.location}</div>}
        {item.notes && <div className="itin-notes">{item.notes}</div>}
      </div>
      {onEdit && (
        <div className="itin-actions">
          <button type="button" onClick={() => onEdit(item)} aria-label={`Edit ${item.title}`} title="Edit">
            &#9998;
          </button>
          <button
            type="button"
            className="itin-delete"
            onClick={() => onDelete(item)}
            aria-label={`Delete ${item.title}`}
            title="Delete"
          >
            &times;
          </button>
        </div>
      )}
    </li>
  );
});

export default function ItineraryItem({ item, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <ItineraryItemCard
      ref={setNodeRef}
      item={item}
      onEdit={onEdit}
      onDelete={onDelete}
      className={isDragging ? "is-placeholder" : ""}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      handleProps={{ ref: setActivatorNodeRef, ...attributes, ...listeners }}
    />
  );
}
