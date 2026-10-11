// Typed fetch layer over the FastAPI backend. Base is the relative "/api" prefix so the
// same code works in dev (Vite proxies /api → :8001) and behind a single origin in prod.
const BASE = "/api";

// Fields are declared, not constructor parameter properties: tsconfig sets
// erasableSyntaxOnly, which rejects `constructor(readonly status: number)`.
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type JsonBody = unknown;

// CSRF token source of truth, in order of preference:
//   1. sessionStorage ("ooaf_csrf") — populated by the auth router (/auth/login, /register, /me)
//      returning the token in the response body. Needed because embedded preview iframes may
//      partition the ooaf_csrf cookie out of document.cookie entirely (Chrome's third-party
//      cookie policy), while still sending it to the server on same-origin fetches.
//   2. document.cookie fallback — the classic double-submit path for a first-party context.
const CSRF_STORAGE_KEY = "ooaf_csrf";

export function setStoredCsrfToken(token: string | null | undefined): void {
  if (typeof sessionStorage === "undefined") return;
  if (token) sessionStorage.setItem(CSRF_STORAGE_KEY, token);
}

export function clearStoredCsrfToken(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(CSRF_STORAGE_KEY);
}

function readCookieToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )ooaf_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function csrfToken(): string | null {
  if (typeof sessionStorage !== "undefined") {
    const stored = sessionStorage.getItem(CSRF_STORAGE_KEY);
    if (stored) return stored;
  }
  return readCookieToken();
}

// Response shape of /auth/login, /auth/register and /auth/me — kept here (not re-exported from
// types.ts) so we only touch it when the auth router changes.
type AuthResponseLike = {
  csrf?: string | null;
};

function captureCsrfFromAuthResponse(path: string, data: unknown): void {
  // Only auth endpoints echo the token in the body. Other endpoints must not have their
  // responses sniffed for a `csrf` key.
  if (!path.startsWith("/auth/")) return;
  if (!data || typeof data !== "object") return;
  const csrf = (data as AuthResponseLike).csrf;
  if (typeof csrf === "string" && csrf.length > 0) {
    setStoredCsrfToken(csrf);
  }
}

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  // Auth rides the httpOnly session cookie automatically — never add auth headers here.
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const token = csrfToken();
    if (token) headers["X-CSRF-Token"] = token;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "same-origin",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // FastAPI reports request-validation failures as 422 with a {detail: [...]} body.
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json()) as T;
  captureCsrfFromAuthResponse(path, data);
  return data;
}

// The response type is yours to declare: nothing infers across the Python boundary, so a
// TS interface here mirrors the endpoint's Pydantic model by hand — keep the two in sync.
export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);
