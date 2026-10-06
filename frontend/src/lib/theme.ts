// Colour-scheme switcher. Default is the Forest Thrift Vision light theme (no class on <html>);
// `dark` renders its dark variant. Legacy `theme-obsidian` and `theme-sunroom` are kept so no
// previous theme choice becomes unreachable.
export type ThemeName = "forest-light" | "forest-dark" | "obsidian" | "sunroom";

const KEY = "ooaf-theme";

const PREFERS_DARK = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export function getTheme(): ThemeName {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
  if (
    saved === "forest-light" ||
    saved === "forest-dark" ||
    saved === "obsidian" ||
    saved === "sunroom"
  ) {
    return saved;
  }
  // Honour the OS preference on first load.
  return PREFERS_DARK() ? "forest-dark" : "forest-light";
}

export function applyTheme(theme: ThemeName): void {
  const el = document.documentElement;
  // Reset legacy theme classes first so switching is clean.
  el.classList.remove("theme-sunroom", "theme-obsidian", "dark");
  if (theme === "obsidian") {
    // Legacy dark cinematic theme: uses the shadcn `dark` convention plus a scheme class.
    el.classList.add("theme-obsidian", "dark");
  } else if (theme === "sunroom") {
    el.classList.add("theme-sunroom");
  } else if (theme === "forest-dark") {
    el.classList.add("dark");
  }
  // forest-light: no extra classes — the :root tokens are already the default.
}

export function setTheme(theme: ThemeName): void {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

// Call once at startup (before render) to avoid a flash of the wrong theme.
export function initTheme(): void {
  applyTheme(getTheme());
}
