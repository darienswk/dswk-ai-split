import React, { createContext, useContext, useReducer, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";

const AppContext = createContext();

const STORAGE_KEY = "splitwise_app_data";

async function loadTrips(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      return snap.data().trips || [];
    }
  } catch (e) {
    console.error("Failed to load trips from Firestore:", e);
  }
  return [];
}

function saveTrips(uid, trips) {
  setDoc(doc(db, "users", uid), { trips }, { merge: true }).catch((e) =>
    console.error("Failed to save trips to Firestore:", e)
  );
}

function reducer(state, action) {
  switch (action.type) {
    case "LOAD_TRIPS": {
      return { ...state, trips: action.payload.trips, loading: false };
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
    currentView: "tripList",
    currentTripId: null,
    loading: true,
  });

  // Load trips from Firestore (with localStorage migration for existing users)
  useEffect(() => {
    if (!user) return;

    async function loadData() {
      const firestoreTrips = await loadTrips(user.uid);

      if (firestoreTrips.length > 0) {
        dispatch({ type: "LOAD_TRIPS", payload: { trips: firestoreTrips } });
        return;
      }

      // Migrate existing localStorage data on first login
      try {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed.trips && parsed.trips.length > 0) {
            await saveTrips(user.uid, parsed.trips);
            dispatch({ type: "LOAD_TRIPS", payload: { trips: parsed.trips } });
            localStorage.removeItem(STORAGE_KEY);
            return;
          }
        }
      } catch (e) {
        console.error("localStorage migration failed:", e);
      }

      dispatch({ type: "LOAD_TRIPS", payload: { trips: [] } });
    }

    loadData();
  }, [user]);

  // Save trips to Firestore whenever they change
  useEffect(() => {
    if (state.loading || !user) return;
    saveTrips(user.uid, state.trips);
  }, [state.trips, user, state.loading]);

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
