
import { useState, type FormEvent } from "react";

export type AuthenticatedUser = {
  id: number;
  email: string;
};

type AuthPageProps = {
  onAuthenticated: (user: AuthenticatedUser) => void;
};

type AuthMode = "login" | "register";

export default function AuthPage({
  onAuthenticated,
}: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isRegistering = mode === "register";

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setError("");
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");

    if (isRegistering && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (isRegistering && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (isRegistering && password.length > 128) {
      setError("Password must be 128 characters or fewer.");
      return;
    }

    setLoading(true);

    try {
      const endpoint = isRegistering
        ? "/api/auth/register"
        : "/api/auth/login";

      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error(
            "An account with this email already exists."
          );
        }

        if (response.status === 401) {
          throw new Error(
            "Incorrect email or password."
          );
        }

        if (response.status === 429) {
          throw new Error(
            "Too many attempts. Please wait a few minutes and try again."
          );
        }

        if (response.status === 422) {
          throw new Error(
            "Please check your email and password."
          );
        }

        throw new Error(
          "Unable to complete authentication. Please try again."
        );
      }

      const user: AuthenticatedUser = await response.json();

      onAuthenticated(user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-layout">

        {/* LEFT SIDE: BRANDING */}

        <section className="auth-hero">
          <div className="auth-brand">
            <span className="auth-brand-icon" aria-hidden="true">
              🌊
            </span>
            <span>Surf Alerts</span>
          </div>

          <div className="auth-hero-content">
            <span className="auth-eyebrow">
              YOUR PERSONAL SURF COMPANION
            </span>

            <h1>
              Spend less time checking forecasts.
              <br />
              <span>More time surfing.</span>
            </h1>

            <p>
              Track your favorite surf spots, set your
              ideal wave and wind conditions, and get
              notified when the forecast matches.
            </p>

            <div className="auth-feature-list">
              <div>
                <span aria-hidden="true">✓</span>
                Live marine and wind forecasts
              </div>

              <div>
                <span aria-hidden="true">✓</span>
                Personalized surf conditions
              </div>

              <div>
                <span aria-hidden="true">✓</span>
                Automated surf notifications
              </div>
            </div>
          </div>

          <p className="auth-hero-footer">
            Built for surfers who know what they're looking for.
          </p>
        </section>

        {/* RIGHT SIDE: AUTHENTICATION FORM */}

        <section className="auth-panel">
          <div className="auth-card">

            <div className="auth-mobile-brand">
              🌊 Surf Alerts
            </div>

            <h2>
              {isRegistering
                ? "Create your account"
                : "Welcome back"}
            </h2>

            <p className="auth-subtitle">
              {isRegistering
                ? "Sign up to start tracking your ideal surf conditions."
                : "Sign in to continue to your surf dashboard."}
            </p>

            <div
              className="auth-mode-switch"
              role="group"
              aria-label="Authentication mode"
            >
              <button
                type="button"
                className={
                  !isRegistering ? "selected" : ""
                }
                onClick={() => changeMode("login")}
                disabled={loading}
                aria-pressed={!isRegistering}
              >
                Log In
              </button>

              <button
                type="button"
                className={
                  isRegistering ? "selected" : ""
                }
                onClick={() => changeMode("register")}
                disabled={loading}
                aria-pressed={isRegistering}
              >
                Register
              </button>
            </div>

            <form
              className="auth-form"
              onSubmit={handleSubmit}
            >
              <div className="auth-field">
                <label htmlFor="auth-email">
                  Email address
                </label>

                <input
                  id="auth-email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  required
                  disabled={loading}
                />
              </div>

              <div className="auth-field">
                <label htmlFor="auth-password">
                  Password
                </label>

                <input
                  id="auth-password"
                  type="password"
                  placeholder="Enter your password"
                  autoComplete={
                    isRegistering
                      ? "new-password"
                      : "current-password"
                  }
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  minLength={isRegistering ? 8 : undefined}
                  maxLength={isRegistering ? 128 : undefined}
                  required
                  disabled={loading}
                />
              </div>

              {isRegistering && (
                <div className="auth-field">
                  <label htmlFor="auth-confirm">
                    Confirm password
                  </label>

                  <input
                    id="auth-confirm"
                    type="password"
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    required
                    disabled={loading}
                  />
                </div>
              )}

              {error && (
                <div
                  className="auth-error"
                  role="alert"
                >
                  <span aria-hidden="true">!</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                className="auth-submit"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? "Please wait..."
                  : isRegistering
                    ? "Create Account"
                    : "Log In"}
              </button>
            </form>

            <p className="auth-bottom-text">
              {isRegistering
                ? "Already have an account?"
                : "Don't have an account?"}
              {" "}

              <button
                type="button"
                className="auth-text-button"
                onClick={() =>
                  changeMode(
                    isRegistering ? "login" : "register"
                  )
                }
                disabled={loading}
              >
                {isRegistering ? "Log In" : "Register"}
              </button>
            </p>

            <p className="auth-disclaimer">
              This is a local development version of
              Surf Alerts.
            </p>

          </div>
        </section>

      </div>
    </div>
  );
}
