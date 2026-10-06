import type { QueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import type { SessionInfo } from "@/lib/types";

export const sessionKey = ["auth", "me"];

export async function beginSession(qc: QueryClient) {
  await qc.invalidateQueries();
}

export async function endSession(qc: QueryClient) {
  try {
    await apiPost<SessionInfo>("/auth/logout");
  } finally {
    qc.clear();
    // Hard redirect to the lock screen: the server session is already revoked, and a full
    // reload guarantees all in-memory (react-query) state is wiped for the next volunteer.
    window.location.assign("/");
  }
}
