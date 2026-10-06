// Colour-scheme switcher: "obsidian" (default dark) or "sunroom" (cream/sage/mustard light).
// The choice is applied as a class on <html> and persisted in localStorage so it survives reloads.
export type ThemeName = "obsidian" | "sunroom";

const KEY = "ooaf-theme";

export function getTheme(): ThemeName {
  return localStorage.getItem(KEY) === "sunroom" ? "sunroom" : "obsidian";
}

export function applyTheme(theme: ThemeName): void {
  const el = document.documentElement;
  const sunroom = theme === "sunroom";
  el.classList.toggle("theme-sunroom", sunroom);
  // Sonner and any `dark:` variants key off the `dark` class, so it must come off in the light theme.
  el.classList.toggle("dark", !sunroom);
}

export function setTheme(theme: ThemeName): void {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

// Call once at startup (before render) to avoid a flash of the wrong theme.
export function initTheme(): void {
  applyTheme(getTheme());
}
