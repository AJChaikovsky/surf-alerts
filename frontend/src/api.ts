// The backend sets a readable csrf_token cookie at login.
// State-changing requests must echo it in this header.
const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "X-CSRF-Token";

function readCookie(name: string): string {
  const prefix = `${name}=`;

  const match = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(prefix));

  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

export function csrfHeaders(): Record<string, string> {
  return { [CSRF_HEADER_NAME]: readCookie(CSRF_COOKIE_NAME) };
}
