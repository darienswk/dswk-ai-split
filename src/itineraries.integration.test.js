import React from "react";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import App from "./App";

// In-memory stand-in for Firestore that records every write. Names start with "mock" so
// jest allows the factories below to reference them.
const mockStore = new Map();
let mockWrites = [];

// uuid v14 is ESM-only, which this project's Jest setup can't parse.
let mockIdCounter = 0;
jest.mock("uuid", () => ({ v4: () => `id-${++mockIdCounter}` }));

jest.mock("./firebase", () => ({ auth: {}, db: {} }));

jest.mock("firebase/auth", () => ({
  onAuthStateChanged: (auth, cb) => {
    cb({ uid: "u1", displayName: "Test User", photoURL: null });
    return () => {};
  },
  signInWithPopup: () => Promise.resolve(),
  GoogleAuthProvider: function GoogleAuthProvider() {},
  signOut: () => Promise.resolve(),
}));

jest.mock("firebase/firestore", () => ({
  doc: (db, collection, id) => `${collection}/${id}`,
  getDoc: async (ref) => ({
    exists: () => mockStore.has(ref),
    data: () => JSON.parse(JSON.stringify(mockStore.get(ref))),
  }),
  setDoc: async (ref, data, options) => {
    // Firestore rejects `undefined` field values, so round-trip through JSON to catch them.
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    mockWrites.push({ ref, data: JSON.parse(JSON.stringify(data)), options });
    mockStore.set(ref, options?.merge ? { ...mockStore.get(ref), ...data } : data);
  },
}));

const itineraryWrites = () => mockWrites.filter((w) => "itineraries" in w.data);
const lastItineraries = () => itineraryWrites().at(-1).data.itineraries;

const openItineraries = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "My Itineraries" }));
};

const createItinerary = async ({ name, description = "", start, end }) => {
  fireEvent.click(await screen.findByRole("button", { name: "+ New Itinerary" }));
  const [nameInput, descInput] = screen.getAllByRole("textbox");
  fireEvent.change(nameInput, { target: { value: name } });
  if (description) fireEvent.change(descInput, { target: { value: description } });
  const [startInput, endInput] = document.querySelectorAll('input[type="date"]');
  fireEvent.change(startInput, { target: { value: start } });
  fireEvent.change(endInput, { target: { value: end } });
  fireEvent.click(screen.getByRole("button", { name: "Create Itinerary" }));
};

beforeEach(() => {
  mockStore.clear();
  mockWrites = [];
  window.confirm = () => true;
});

test("has a top-level My Itineraries section next to My Trips", async () => {
  render(<App />);
  expect(await screen.findByRole("heading", { name: "My Trips" })).toBeInTheDocument();

  await openItineraries();
  expect(screen.getByRole("heading", { name: "My Itineraries" })).toBeInTheDocument();
  expect(screen.getByText("No itineraries yet")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "My Trips" }));
  expect(screen.getByRole("heading", { name: "My Trips" })).toBeInTheDocument();
});

test("creating an itinerary saves it to users/{uid}.itineraries with the documented schema", async () => {
  render(<App />);
  await openItineraries();
  await createItinerary({ name: "UK Trip", description: "Winter", start: "2026-11-23", end: "2026-12-05" });

  // Lands on the detail view with the full 13-day timeline
  expect(await screen.findByRole("heading", { name: "UK Trip" })).toBeInTheDocument();
  expect(document.querySelectorAll(".itin-day")).toHaveLength(13);

  await waitFor(() => expect(itineraryWrites().length).toBeGreaterThan(0));
  const write = itineraryWrites().at(-1);
  expect(write.ref).toBe("users/u1");
  expect(write.options).toEqual({ merge: true });

  const [saved] = write.data.itineraries;
  expect(saved).toEqual({
    id: expect.any(String),
    name: "UK Trip",
    description: "Winter",
    startDate: "2026-11-23",
    endDate: "2026-12-05",
    createdAt: expect.any(String),
    days: expect.any(Array),
  });
  expect(saved.days).toHaveLength(13);
  expect(saved.days[0]).toEqual({ id: "2026-11-23", city: "", items: [] });
  expect(saved.days[12].id).toBe("2026-12-05");
});

test("adding a stop persists it under its day; trips and itineraries are written separately", async () => {
  render(<App />);
  await openItineraries();
  await createItinerary({ name: "UK Trip", start: "2026-11-23", end: "2026-11-25" });
  await screen.findByRole("heading", { name: "UK Trip" });

  const day2 = document.getElementById("itin-day-2026-11-24");
  fireEvent.click(within(day2).getByRole("button", { name: "+ Add" }));
  const modal = document.querySelector(".modal");
  fireEvent.change(within(modal).getByPlaceholderText(/Edinburgh Castle/), { target: { value: "Tower of London" } });
  fireEvent.change(modal.querySelector('input[type="time"]'), { target: { value: "10:30" } });
  fireEvent.change(within(modal).getByPlaceholderText(/Address or place/), { target: { value: "Tower Hill" } });
  fireEvent.click(within(modal).getByRole("button", { name: "Add Stop" }));

  await waitFor(() => expect(lastItineraries()[0].days[1].items).toHaveLength(1));
  expect(lastItineraries()[0].days[1].items[0]).toEqual({
    id: expect.any(String),
    title: "Tower of London",
    type: "sight",
    time: "10:30",
    location: "Tower Hill",
    notes: "",
  });
  expect(lastItineraries()[0].days[0].items).toEqual([]);

  // Each write touches exactly one field, so editing an itinerary never rewrites trips.
  mockWrites.forEach((w) => expect(Object.keys(w.data)).toHaveLength(1));
});

test("loads saved itineraries (with or without trips) and lists them", async () => {
  const saved = {
    id: "it-1",
    name: "Scotland",
    description: "",
    startDate: "2026-12-01",
    endDate: "2026-12-03",
    createdAt: "2026-09-21T00:00:00.000Z",
    days: ["2026-12-01", "2026-12-02", "2026-12-03"].map((id, i) => ({
      id,
      city: i === 0 ? "Edinburgh" : "",
      items: i === 0 ? [{ id: "s1", title: "Castle", type: "sight", time: "", location: "", notes: "" }] : [],
    })),
  };
  mockStore.set("users/u1", { trips: [], itineraries: [saved] });

  render(<App />);
  await openItineraries();
  expect(await screen.findByText("Scotland")).toBeInTheDocument();
  expect(screen.getByText("3 days")).toBeInTheDocument();
  expect(screen.getByText("1 stop")).toBeInTheDocument();

  fireEvent.click(screen.getByText("Scotland"));
  expect(await screen.findByDisplayValue("Edinburgh")).toBeInTheDocument();
  expect(screen.getByText(/Castle/)).toBeInTheDocument();
});

test("old user documents without an itineraries field still load", async () => {
  mockStore.set("users/u1", { trips: [] });
  render(<App />);
  await openItineraries();
  expect(await screen.findByText("No itineraries yet")).toBeInTheDocument();
});

test("changing dates keeps id/name and moves stops from removed days; delete removes it from Firestore", async () => {
  render(<App />);
  await openItineraries();
  await createItinerary({ name: "UK Trip", start: "2026-11-23", end: "2026-11-25" });
  await screen.findByRole("heading", { name: "UK Trip" });

  const day1 = document.getElementById("itin-day-2026-11-23");
  fireEvent.click(within(day1).getByRole("button", { name: "+ Add" }));
  fireEvent.change(within(document.querySelector(".modal")).getByPlaceholderText(/Edinburgh Castle/), {
    target: { value: "Arrive" },
  });
  fireEvent.click(within(document.querySelector(".modal")).getByRole("button", { name: "Add Stop" }));
  await waitFor(() => expect(lastItineraries()[0].days[0].items).toHaveLength(1));
  const originalId = lastItineraries()[0].id;

  fireEvent.click(screen.getByRole("button", { name: "Change dates" }));
  const [start, end] = document.querySelectorAll(".itin-dates-form input[type='date']");
  fireEvent.change(start, { target: { value: "2026-11-24" } });
  fireEvent.change(end, { target: { value: "2026-11-25" } });
  fireEvent.click(screen.getByRole("button", { name: "Update dates" }));

  await waitFor(() => expect(lastItineraries()[0].days).toHaveLength(2));
  const [updated] = lastItineraries();
  expect(updated).toMatchObject({ id: originalId, name: "UK Trip", startDate: "2026-11-24", endDate: "2026-11-25" });
  expect(updated.days[0].items.map((i) => i.title)).toEqual(["Arrive"]);

  fireEvent.click(screen.getByRole("button", { name: "Delete Itinerary" }));
  expect(await screen.findByText("No itineraries yet")).toBeInTheDocument();
  await waitFor(() => expect(lastItineraries()).toEqual([]));
});
