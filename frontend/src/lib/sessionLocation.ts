import { useSyncExternalStore } from "react";
import { LOCATIONS } from "@/lib/types";

// The volunteer's shop branch for THIS session/device. Chosen at sign-on and changeable from the
// header; new listings default to it. Persisted in localStorage; a tiny store lets the header
// switcher and the appraisal form stay in sync without prop-drilling.
const KEY = "ooaf-location";
type Listener = () => void;
const listeners = new Set<Listener>();

function read(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v && (LOCATIONS as readonly string[]).includes(v)) return v;
  } catch (err) {
    if (import.meta.env.DEV) console.warn("session-location: unreadable store", err);
  }
  return LOCATIONS[0];
}

let current = read();

export function getSessionLocation(): string {
  return current;
}

export function setSessionLocation(loc: string): void {
  if (!(LOCATIONS as readonly string[]).includes(loc) || loc === current) return;
  current = loc;
  try {
    localStorage.setItem(KEY, loc);
  } catch (err) {
    // The in-memory store still updates, so the branch switch works for this session even if the
    // write fails (private mode / quota).
    if (import.meta.env.DEV) console.warn("session-location: could not persist", err);
  }
  listeners.forEach((l) => l());
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSessionLocation(): string {
  return useSyncExternalStore(subscribe, getSessionLocation, getSessionLocation);
}
