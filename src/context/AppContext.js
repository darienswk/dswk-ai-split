import React, { createContext, useContext, useReducer, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { createItinerary } from "../utils/itinerary";

const AppContext = createContext();

const STORAGE_KEY = "splitwise_app_data";

async function loadUserData(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const data = snap.data();
      return { trips: data.trips || [], itineraries: data.itineraries || [] };
    }
  } catch (e) {
    console.error("Failed to load data from Firestore:", e);
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
      };
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
  });

  // Load trips and itineraries from Firestore (with localStorage migration for existing users)
  useEffect(() => {
    if (!user) return;

    async function loadData() {
      const { trips: firestoreTrips, itineraries } = await loadUserData(user.uid);

      if (firestoreTrips.length > 0) {
        dispatch({ type: "LOAD_DATA", payload: { trips: firestoreTrips, itineraries } });
        return;
      }

      // Migrate existing localStorage data on first login
      try {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed.trips && parsed.trips.length > 0) {
            await saveTrips(user.uid, parsed.trips);
            dispatch({ type: "LOAD_DATA", payload: { trips: parsed.trips, itineraries } });
            localStorage.removeItem(STORAGE_KEY);
            return;
          }
        }
      } catch (e) {
        console.error("localStorage migration failed:", e);
      }

      dispatch({ type: "LOAD_DATA", payload: { trips: [], itineraries } });
    }

    loadData();
  }, [user]);

  // Save trips to Firestore whenever they change
  useEffect(() => {
    if (state.loading || !user) return;
    saveTrips(user.uid, state.trips);
  }, [state.trips, user, state.loading]);

  // Save itineraries to Firestore whenever they change
  useEffect(() => {
    if (state.loading || !user) return;
    saveItineraries(user.uid, state.itineraries);
  }, [state.itineraries, user, state.loading]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {state.loading ? (
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>Loading your trips...</p>
        </div>
      ) : (
        children
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
