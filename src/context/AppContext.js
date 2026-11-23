import React, { createContext, useContext, useReducer, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { createItinerary } from "../utils/itinerary";

const AppContext = createContext();

const STORAGE_KEY = "splitwise_app_data";

// Throws if the read fails. Callers must NOT treat a failed read as "this user has no data":
// the save effects below write whatever is in state, so an empty fallback here would overwrite
// the user's real trips and itineraries in Firestore with empty arrays.
async function loadUserData(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    const data = snap.data();
    return { trips: data.trips || [], itineraries: data.itineraries || [] };
  }
  return { trips: [], itineraries: [] };
}

function saveTrips(uid, trips) {
  setDoc(doc(db, "users", uid), { trips }, { merge: true }).catch((e) =>
    console.error("Failed to save trips to Firestore:", e)
  );
}

// Itineraries live in their own field on the same user document, and are written separately
// from trips so editing one doesn't rewrite the other.
function saveItineraries(uid, itineraries) {
  setDoc(doc(db, "users", uid), { itineraries }, { merge: true }).catch((e) =>
    console.error("Failed to save itineraries to Firestore:", e)
  );
}

function reducer(state, action) {
  switch (action.type) {
    case "LOAD_DATA": {
      return {
        ...state,
        trips: action.payload.trips,
        itineraries: action.payload.itineraries,
        loading: false,
        loadError: null,
      };
    }

    // The initial read failed. Stay in the loading state (so nothing is ever saved) and surface
    // the error so the user can retry.
    case "LOAD_FAILED": {
      return { ...state, loading: true, loadError: action.payload.message };
    }

    case "RETRY_LOAD": {
      return { ...state, loadError: null, loadAttempt: state.loadAttempt + 1 };
    }

    case "CREATE_TRIP": {
      const trip = {
        id: uuidv4(),
        name: action.payload.name,
        description: action.payload.description,
        defaultCurrency: action.payload.defaultCurrency || "USD",
        members: action.payload.members.map((name) => ({
          id: uuidv4(),
          name: name.trim(),
        })),
        expenses: [],
        settlements: [],
        isSettled: false,
        createdAt: new Date().toISOString(),
      };
      return {
        ...state,
        trips: [...state.trips, trip],
        currentTripId: trip.id,
        currentView: "tripDetail",
      };
    }

    case "ADD_EXPENSE": {
      const { tripId, expense } = action.payload;
      return {
        ...state,
        trips: state.trips.map((t) =>
          t.id === tripId
            ? {
                ...t,
                expenses: [
                  ...t.expenses,
                  { ...expense, id: uuidv4(), createdAt: new Date().toISOString() },
                ],
              }
            : t
        ),
      };
    }

    case "EDIT_EXPENSE": {
      const { tripId: editTripId, expenseId: editExpenseId, updates } = action.payload;
      return {
        ...state,
        trips: state.trips.map((t) =>
          t.id === editTripId
            ? {
                ...t,
                expenses: t.expenses.map((e) =>
                  e.id === editExpenseId ? { ...e, ...updates } : e
                ),
              }
            : t
        ),
      };
    }

    case "DELETE_EXPENSE": {
      const { tripId: tid, expenseId } = action.payload;
      return {
        ...state,
        trips: state.trips.map((t) =>
          t.id === tid
            ? { ...t, expenses: t.expenses.filter((e) => e.id !== expenseId) }
            : t
        ),
      };
    }

    case "ADD_MEMBER": {
      const { tripId: addTripId, memberName } = action.payload;
      return {
        ...state,
        trips: state.trips.map((t) =>
          t.id === addTripId
            ? {
                ...t,
                members: [...t.members, { id: uuidv4(), name: memberName.trim() }],
              }
            : t
        ),
      };
    }

    case "CREATE_ITINERARY": {
      const { name, description, startDate, endDate } = action.payload;
      const itinerary = {
        id: uuidv4(),
        name,
        description,
        ...createItinerary(startDate, endDate),
        createdAt: new Date().toISOString(),
      };
      return {
        ...state,
        itineraries: [...state.itineraries, itinerary],
        currentItineraryId: itinerary.id,
        currentView: "itineraryDetail",
      };
    }

    case "SET_ITINERARY": {
      const { itinerary } = action.payload;
      return {
        ...state,
        itineraries: state.itineraries.map((i) => (i.id === itinerary.id ? itinerary : i)),
      };
    }

    case "DELETE_ITINERARY": {
      return {
        ...state,
        itineraries: state.itineraries.filter((i) => i.id !== action.payload.itineraryId),
        currentView: "itineraryList",
        currentItineraryId: null,
      };
    }

    case "SETTLE_TRIP": {
      const { tripId: settleTripId, settlements } = action.payload;
      return {
        ...state,
        trips: state.trips.map((t) =>
          t.id === settleTripId
            ? { ...t, isSettled: true, settlements, settledAt: new Date().toISOString() }
            : t
        ),
      };
    }

    case "REOPEN_TRIP": {
      return {
        ...state,
        trips: state.trips.map((t) =>
          t.id === action.payload.tripId
            ? { ...t, isSettled: false, settlements: [], settledAt: null }
            : t
        ),
      };
    }

    case "DELETE_TRIP": {
      const remaining = state.trips.filter((t) => t.id !== action.payload.tripId);
      return {
        ...state,
        trips: remaining,
        currentView: "tripList",
        currentTripId: null,
      };
    }

    case "NAVIGATE": {
      return {
        ...state,
        currentView: action.payload.view,
        currentTripId: action.payload.tripId || state.currentTripId,
        currentItineraryId: action.payload.itineraryId || state.currentItineraryId,
      };
    }

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, {
    trips: [],
    itineraries: [],
    currentView: "tripList",
    currentTripId: null,
    currentItineraryId: null,
    loading: true,
    loadError: null,
    loadAttempt: 0,
  });

  // The arrays most recently loaded from / saved to Firestore. The save effects skip a write when
  // state still holds exactly these arrays, so simply loading data never writes it back.
  const savedTrips = useRef(null);
  const savedItineraries = useRef(null);

  // Load trips and itineraries from Firestore (with localStorage migration for existing users)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadData() {
      let firestoreTrips, itineraries;
      try {
        ({ trips: firestoreTrips, itineraries } = await loadUserData(user.uid));
      } catch (e) {
        console.error("Failed to load data from Firestore:", e);
        if (!cancelled) {
          dispatch({ type: "LOAD_FAILED", payload: { message: e?.message || String(e) } });
        }
        return;
      }
      if (cancelled) return;

      const load = (trips) => {
        savedTrips.current = trips;
        savedItineraries.current = itineraries;
        dispatch({ type: "LOAD_DATA", payload: { trips, itineraries } });
      };

      if (firestoreTrips.length > 0) {
        load(firestoreTrips);
        return;
      }

      // Migrate existing localStorage data on first login
      try {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed.trips && parsed.trips.length > 0) {
            saveTrips(user.uid, parsed.trips);
            load(parsed.trips);
            localStorage.removeItem(STORAGE_KEY);
            return;
          }
        }
      } catch (e) {
        console.error("localStorage migration failed:", e);
      }

      load(firestoreTrips);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [user, state.loadAttempt]);

  // Save trips to Firestore whenever they change (never before a successful load).
  useEffect(() => {
    if (state.loading || !user) return;
    if (state.trips === savedTrips.current) return;
    savedTrips.current = state.trips;
    saveTrips(user.uid, state.trips);
  }, [state.trips, user, state.loading]);

  // Save itineraries to Firestore whenever they change (never before a successful load).
  useEffect(() => {
    if (state.loading || !user) return;
    if (state.itineraries === savedItineraries.current) return;
    savedItineraries.current = state.itineraries;
    saveItineraries(user.uid, state.itineraries);
  }, [state.itineraries, user, state.loading]);

  let content = children;
  if (state.loadError) {
    content = (
      <div className="loading-screen">
        <p>Couldn't load your trips. Your saved data has not been changed.</p>
        <p className="load-error-detail">{state.loadError}</p>
        <button className="btn btn-primary" onClick={() => dispatch({ type: "RETRY_LOAD" })}>
          Retry
        </button>
      </div>
    );
  } else if (state.loading) {
    content = (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading your trips...</p>
      </div>
    );
  }

  return <AppContext.Provider value={{ state, dispatch }}>{content}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
