// The backend sets a readable csrf_token cookie at login.
// State-changing requests must echo it in this header.
const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "X-CSRF-Token";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// App listens for this and shows the login page.
export const SESSION_EXPIRED_EVENT = "surf-alerts:session-expired";

function readCookie(name: string): string {
  const prefix = `${name}=`;

  const match = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(prefix));

  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

// fetch for signed-in pages: adds the CSRF header to state-changing
// requests, and treats 401 as "session ended" (logged out in another
// tab, revoked, or expired).
export async function apiFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);

  if (UNSAFE_METHODS.has(method)) {
    headers.set(CSRF_HEADER_NAME, readCookie(CSRF_COOKIE_NAME));
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers,
  });

  if (response.status === 401) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }

  return response;
}
