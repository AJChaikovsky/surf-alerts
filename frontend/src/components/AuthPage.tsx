import { useLayoutEffect, useRef, useState, type FormEvent } from "react";

import { animate, gsap, revealName, riseIn } from "../motion";
import FlowField from "./FlowField";
import { SplitText } from "./Motion";
import RollingWord from "./RollingWord";
import ThemeToggle from "./ThemeToggle";

// Breaks the headline rolls through.
const HEADLINE_SPOTS = [
  "El Porto",
  "Trestles",
  "Rincon",
  "Malibu",
  "Swami's",
  "The Wedge",
  "Black's",
];

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

  const heroRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);

  // Entrance: the name letter by letter, the headline blurring in, then
  // the details and the form (HyperFrames: overlap, don't run in sequence).
  useLayoutEffect(() => {
    const hero = heroRef.current;

    if (!hero) return;

    revealName(hero.querySelectorAll(".auth-name .split-char"));

    if (animate) {
      gsap.fromTo(
        hero.querySelector("h1"),
        { opacity: 0, filter: "blur(8px)" },
        { opacity: 1, filter: "blur(0px)", duration: 0.6, delay: 0.25, ease: "expo.out", clearProps: "filter" }
      );
      gsap.fromTo(
        hero.querySelectorAll(".auth-tagline, .auth-features li"),
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.06, delay: 0.45, ease: "expo.out", clearProps: "transform" }
      );
    }

    riseIn(cardRef.current, 0.35);
  }, []);

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

    if (isRegistering && password.length < 10) {
      setError("Password must be at least 10 characters.");
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
          // Password rules come back as a readable message.
          const data = await response.json().catch(() => null);

          throw new Error(
            typeof data?.detail === "string"
              ? data.detail
              : "Please check your email and password."
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
      <FlowField className="auth-canvas" />

      <div className="auth-top">
        <span className="auth-wordmark">~/surf-alerts</span>
        <ThemeToggle />
      </div>

      <div className="auth-layout">

        {/* HERO */}

        <div className="auth-hero" ref={heroRef}>
          <span className="auth-name">
            <SplitText text="Surf Alerts" mode="chars" />
          </span>

          <h1>
            Tell me when
            <br />
            <RollingWord words={HEADLINE_SPOTS} />
            <br />
            is firing.
          </h1>

          <p className="auth-tagline">
            Pick your breaks, set the wave height, swell period, and wind
            you want, and get an email when the forecast lines up.
          </p>

          <ul className="auth-features">
            <li>Live marine and wind forecasts for 17 SoCal breaks</li>
            <li>Alerts checked every 30 minutes</li>
            <li>One email per alert per day, never spam</li>
          </ul>
        </div>

        {/* FORM */}

        <section className="auth-card" ref={cardRef}>
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
                  minLength={isRegistering ? 10 : undefined}
                  maxLength={isRegistering ? 128 : undefined}
                  required
                  disabled={loading}
                />
              </div>

              {isRegistering && (
                <p className="auth-hint">
                  At least 10 characters. A short phrase works well.
                </p>
              )}

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
                className="auth-submit magnetic"
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
              Forecasts are modeled estimates. Always check
              conditions at the beach.
            </p>
        </section>

      </div>
    </div>
  );
}
