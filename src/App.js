import "./App.css";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppProvider, useApp } from "./context/AppContext";
import TripList from "./components/TripList";
import CreateTrip from "./components/CreateTrip";
import TripDetail from "./components/TripDetail";

function Router() {
  const { state } = useApp();

  switch (state.currentView) {
    case "createTrip":
      return <CreateTrip />;
    case "tripDetail":
      return <TripDetail />;
    default:
      return <TripList />;
  }
}

function LoginScreen({ signIn }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <span className="login-icon">&#9830;</span>
        <h1>SplitTrip</h1>
        <p>Split expenses with friends on your trips.</p>
        <button className="btn btn-primary btn-lg btn-google" onClick={signIn}>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { user, logOut } = useAuth();

  return (
    <AppProvider>
      <div className="app">
        <header className="app-header">
          <div className="app-logo" onClick={() => window.location.reload()}>
            <span className="logo-icon">&#9830;</span>
            <span>SplitTrip</span>
          </div>
          <div className="header-user">
            {user.photoURL && (
              <img src={user.photoURL} alt="" className="header-avatar" referrerPolicy="no-referrer" />
            )}
            <span className="header-name">{user.displayName}</span>
            <button className="btn btn-sm btn-secondary" onClick={logOut}>
              Sign Out
            </button>
          </div>
        </header>
        <main className="app-main">
          <Router />
        </main>
      </div>
    </AppProvider>
  );
}

function AppGate() {
  const { user, loading, signIn } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen signIn={signIn} />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}

export default App;
