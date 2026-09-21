import { arrayMove } from "@dnd-kit/sortable";

export const MAX_ITINERARY_DAYS = 60;

export const ITEM_TYPES = [
  { value: "flight", label: "Flight", icon: "✈️", color: "#3b82f6" },
  { value: "stay", label: "Stay", icon: "🏨", color: "#8b5cf6" },
  { value: "transport", label: "Transport", icon: "🚆", color: "#0ea5e9" },
  { value: "sight", label: "Sight", icon: "🏛️", color: "#f59e0b" },
  { value: "food", label: "Food & drink", icon: "🍽️", color: "#ef4444" },
  { value: "other", label: "Other", icon: "📌", color: "#64748b" },
];

export function getItemType(value) {
  return ITEM_TYPES.find((t) => t.value === value) || ITEM_TYPES[ITEM_TYPES.length - 1];
}

// Dates are plain "YYYY-MM-DD" strings, parsed as local dates to avoid timezone shifts.
export function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDate(iso, options = { weekday: "short", day: "numeric", month: "short" }) {
  return parseDate(iso).toLocaleDateString("en-GB", options);
}

// Returns every date from start to end inclusive, or [] if the range is invalid.
export function getDateRange(start, end) {
  if (!start || !end || end < start) return [];
  const dates = [];
  const last = parseDate(end);
  for (let d = parseDate(start); d <= last; d.setDate(d.getDate() + 1)) {
    if (dates.length >= MAX_ITINERARY_DAYS) return [];
    dates.push(toIsoDate(d));
  }
  return dates;
}

const emptyDay = (date) => ({ id: date, city: "", items: [] });

export function createItinerary(startDate, endDate) {
  return { startDate, endDate, days: getDateRange(startDate, endDate).map(emptyDay) };
}

// Number of stops sitting on days that fall outside the given range.
export function countOutside(itinerary, startDate, endDate) {
  return itinerary.days
    .filter((d) => d.id < startDate || d.id > endDate)
    .reduce((n, d) => n + d.items.length, 0);
}

// Re-fits the itinerary to a new date range. Days with a matching date are kept as-is;
// stops from days that no longer exist move to the nearest remaining day so nothing is lost.
export function resizeItinerary(itinerary, startDate, endDate) {
  const dates = getDateRange(startDate, endDate);
  const existing = new Map(itinerary.days.map((d) => [d.id, d]));
  const days = dates.map((date) => existing.get(date) || emptyDay(date));
  if (days.length === 0) return itinerary;

  const before = [];
  const after = [];
  itinerary.days.forEach((d) => {
    if (d.id < startDate) before.push(...d.items);
    else if (d.id > endDate) after.push(...d.items);
  });
  days[0] = { ...days[0], items: [...before, ...days[0].items] };
  const last = days.length - 1;
  days[last] = { ...days[last], items: [...days[last].items, ...after] };

  return { ...itinerary, startDate, endDate, days };
}

export function countStops(itinerary) {
  return itinerary.days.reduce((n, d) => n + d.items.length, 0);
}

// A drag target id is either a day id (empty area of a day) or an item id.
export function findDayId(days, id) {
  if (days.some((d) => d.id === id)) return id;
  const day = days.find((d) => d.items.some((i) => i.id === id));
  return day ? day.id : undefined;
}

export function findItem(days, id) {
  for (const day of days) {
    const item = day.items.find((i) => i.id === id);
    if (item) return item;
  }
  return null;
}

// While dragging: moves the active item into the day being hovered.
// `isBelow` says whether the dragged card sits below the midpoint of the hovered card.
export function moveItemToDay(days, activeId, overId, isBelow) {
  const from = findDayId(days, activeId);
  const to = findDayId(days, overId);
  if (!from || !to || from === to) return days;

  const item = findItem(days, activeId);
  const target = days.find((d) => d.id === to);
  const overIndex = target.items.findIndex((i) => i.id === overId);
  const index = overIndex === -1 ? target.items.length : overIndex + (isBelow ? 1 : 0);

  return days.map((d) => {
    if (d.id === from) return { ...d, items: d.items.filter((i) => i.id !== activeId) };
    if (d.id === to) {
      return { ...d, items: [...d.items.slice(0, index), item, ...d.items.slice(index)] };
    }
    return d;
  });
}

// On drop: reorders the active item within its day, if it was dropped on another item of that day.
export function reorderWithinDay(days, activeId, overId) {
  const dayId = findDayId(days, activeId);
  if (!dayId || dayId !== findDayId(days, overId)) return days;

  const items = days.find((d) => d.id === dayId).items;
  const oldIndex = items.findIndex((i) => i.id === activeId);
  const newIndex = items.findIndex((i) => i.id === overId);
  if (newIndex === -1 || oldIndex === newIndex) return days;

  return days.map((d) => (d.id === dayId ? { ...d, items: arrayMove(d.items, oldIndex, newIndex) } : d));
}

// Adds a new item, or updates/moves an existing one, then returns the new days.
export function saveItem(days, { dayId, ...fields }, existing) {
  if (!existing) {
    return days.map((d) => (d.id === dayId ? { ...d, items: [...d.items, fields] } : d));
  }
  const updated = { ...existing, ...fields };
  const fromId = findDayId(days, existing.id);
  return days.map((d) => {
    if (d.id === fromId && d.id === dayId) {
      return { ...d, items: d.items.map((i) => (i.id === existing.id ? updated : i)) };
    }
    if (d.id === fromId) return { ...d, items: d.items.filter((i) => i.id !== existing.id) };
    if (d.id === dayId) return { ...d, items: [...d.items, updated] };
    return d;
  });
}

export function deleteItem(days, itemId) {
  return days.map((d) => ({ ...d, items: d.items.filter((i) => i.id !== itemId) }));
}
