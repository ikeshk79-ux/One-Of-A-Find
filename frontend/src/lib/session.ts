import type { QueryClient } from "@tanstack/react-query";
import { apiPost, clearStoredCsrfToken } from "@/lib/api";
import type { SessionInfo } from "@/lib/types";

export const sessionKey = ["auth", "me"];

export async function beginSession(qc: QueryClient) {
  await qc.invalidateQueries();
}

export async function endSession(qc: QueryClient) {
  try {
    await apiPost<SessionInfo>("/auth/logout");
  } finally {
    // Drop the sessionStorage CSRF fallback so the next volunteer can't inherit it, then
    // clear react-query cache and hard-reload to the lock screen (server session is already revoked).
    clearStoredCsrfToken();
    qc.clear();
    window.location.assign("/");
  }
}
