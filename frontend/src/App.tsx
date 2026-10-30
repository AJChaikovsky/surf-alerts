
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import Dashboard from "./Dashboard";
import AlertHistory from "./components/AlertHistory";
import LocalBreaks from "./components/LocalBreaks";
import SideNav, { type Page } from "./components/SideNav";
import LoadErrorBoundary from "./components/LoadErrorBoundary";
import ThemeToggle from "./components/ThemeToggle";
import { apiFetch, SESSION_EXPIRED_EVENT } from "./api";
import { blurSwapIn, installPointerEffects } from "./motion";

// The map library is large, so it downloads only when the Map page opens.
const SpotMap = lazy(() => import("./components/SpotMap"));

import AuthPage, {
  type AuthenticatedUser,
} from "./components/AuthPage";

import "./auth.css";

type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

const PAGES: Page[] = ["spots", "map", "breaks", "alerts", "history"];

// Read the current page from the URL, e.g. #/alerts or
// #/alerts?spot=5 (query parameters are read by the page itself).
function pageFromHash(): Page {
  const page = window.location.hash.replace("#/", "").split("?")[0];

  return PAGES.find((known) => known === page) ?? "spots";
}

function App() {
  const [page, setPage] = useState<Page>(pageFromHash);

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

  const contentRef = useRef<HTMLDivElement | null>(null);

  // -------- POINTER EFFECTS (card tilt, magnetic buttons) --------

  useEffect(() => installPointerEffects(), []);

  // -------- PAGE TRANSITION --------
  // Blur swap on one stage: the new page sharpens in; the toolbar and side
  // menu stay put.

  useLayoutEffect(() => {
    blurSwapIn(contentRef.current, page !== "map");
  }, [page, authStatus]);

  // -------- FOLLOW SIDE MENU LINKS --------

  useEffect(() => {
    function handleHashChange() {
      setPage(pageFromHash());
    }

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  // -------- SESSION ENDED WHILE THE PAGE WAS OPEN --------
  // e.g. logged out in another tab; any 401 from apiFetch lands here.

  useEffect(() => {
    function handleSessionExpired() {
      setUser(null);
      setAuthStatus("unauthenticated");
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

    return () => {
      window.removeEventListener(
        SESSION_EXPIRED_EVENT,
        handleSessionExpired
      );
    };
  }, []);

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
      const response = await apiFetch("/api/auth/logout", {
        method: "POST",
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
          <span className="auth-loading-mark">~/surf-alerts</span>
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
          <a className="session-wordmark" href="#/spots">
            ~/surf-alerts
          </a>

          <div className="session-right">
            <div className="session-user">
              <span
                className="session-indicator"
                aria-hidden="true"
              />

              <span className="session-email">
                {user.email}
              </span>
            </div>

            <ThemeToggle />

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
      </div>

      {logoutError && (
        <p
          className="session-error"
          role="alert"
        >
          {logoutError}
        </p>
      )}

      <div className="app-layout">
        <SideNav current={page} />

        <div className="app-content" ref={contentRef}>
          {/* Spots and alerts share one Dashboard instance,
              so switching between them keeps its state. */}
          {page === "history" ? (
            <div className="history-page">
              <AlertHistory />
            </div>
          ) : page === "breaks" ? (
            <LocalBreaks />
          ) : page === "map" ? (
            <LoadErrorBoundary what="the map">
              <Suspense
                fallback={
                  <main className="dashboard">
                    <p className="page-subtitle">Loading map...</p>
                  </main>
                }
              >
                <SpotMap />
              </Suspense>
            </LoadErrorBoundary>
          ) : (
            <Dashboard view={page} />
          )}
        </div>
      </div>
    </>
  );
}

export default App;
