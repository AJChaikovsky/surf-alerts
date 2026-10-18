
import { useEffect, useState } from "react";

import Dashboard from "./Dashboard";
import AlertHistory from "./components/AlertHistory";

import AuthPage, {
  type AuthenticatedUser,
} from "./components/AuthPage";

import "./auth.css";

type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

function App() {
  const [user, setUser] = useState<AuthenticatedUser | null>(
    null
  );

  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    "loading"
  );

  const [refreshKey, setRefreshKey] = useState(0);

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  // -------- CHECK EXISTING SESSION --------

  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "same-origin",
          signal: controller.signal,
        });

        if (response.ok) {
          const currentUser: AuthenticatedUser =
            await response.json();

          if (!controller.signal.aborted) {
            setUser(currentUser);
            setAuthStatus("authenticated");
          }

          return;
        }

        if (response.status === 401) {
          if (!controller.signal.aborted) {
            setUser(null);
            setAuthStatus("unauthenticated");
          }

          return;
        }

        throw new Error("Session check failed");
      } catch {
        if (!controller.signal.aborted) {
          setAuthStatus("error");
        }
      }
    }

    checkSession();

    return () => {
      controller.abort();
    };
  }, [refreshKey]);

  // -------- SUCCESSFUL LOGIN / REGISTRATION --------

  function handleAuthenticated(
    authenticatedUser: AuthenticatedUser
  ) {
    setUser(authenticatedUser);
    setAuthStatus("authenticated");
    setLogoutError("");
  }

  // -------- LOG OUT --------

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    setLogoutError("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      setUser(null);
      setAuthStatus("unauthenticated");
    } catch {
      setLogoutError(
        "Unable to log out. Please try again."
      );
    } finally {
      setLoggingOut(false);
    }
  }

  // -------- INITIAL LOADING SCREEN --------

  if (authStatus === "loading") {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-content">
          <span className="auth-loading-wave">🌊</span>
          <h2>Surf Alerts</h2>
          <p>Checking your session...</p>
        </div>
      </div>
    );
  }

  // -------- SESSION CHECK FAILED --------

  if (authStatus === "error") {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-content">
          <h2>Unable to connect</h2>

          <p>
            Make sure your FastAPI backend is running,
            then try again.
          </p>

          <button
            type="button"
            className="auth-retry-button"
            onClick={() => {
              setAuthStatus("loading");
              setRefreshKey((previous) => previous + 1);
            }}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // -------- NOT SIGNED IN --------

  if (authStatus === "unauthenticated" || !user) {
    return (
      <AuthPage
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  // -------- SIGNED-IN DASHBOARD --------

  return (
    <>
      <div className="session-toolbar">
        <div className="session-toolbar-content">
          <div className="session-user">
            <span
              className="session-indicator"
              aria-hidden="true"
            />

            <span className="session-email">
              {user.email}
            </span>
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "Logging out..." : "Log Out"}
          </button>
        </div>
      </div>

      {logoutError && (
        <p
          className="session-error"
          role="alert"
        >
          {logoutError}
        </p>
      )}

      {/* Existing surf dashboard */}
      <Dashboard />

      {/* History and notification tracking */}
      <AlertHistory />
    </>
  );
}

export default App;
