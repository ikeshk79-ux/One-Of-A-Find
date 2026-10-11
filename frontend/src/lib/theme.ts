// Colour-scheme switcher. Default is Forest Thrift Vision light; `system` follows the device's
// `prefers-color-scheme` live. Legacy `theme-obsidian` and `theme-sunroom` are kept so no
// previous theme choice becomes unreachable.
export type ThemeName = "system" | "forest-light" | "forest-dark" | "obsidian" | "sunroom";

const KEY = "ooaf-theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

const PREFERS_DARK = (): boolean =>
  typeof window !== "undefined" && window.matchMedia?.(MEDIA_QUERY).matches === true;

export function getTheme(): ThemeName {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
  if (
    saved === "system" ||
    saved === "forest-light" ||
    saved === "forest-dark" ||
    saved === "obsidian" ||
    saved === "sunroom"
  ) {
    return saved;
  }
  // First-ever load: honour the OS preference but let the user override via the picker.
  return PREFERS_DARK() ? "forest-dark" : "forest-light";
}

// Resolve "system" into the concrete scheme to apply right now.
function resolve(theme: ThemeName): Exclude<ThemeName, "system"> {
  if (theme !== "system") return theme;
  return PREFERS_DARK() ? "forest-dark" : "forest-light";
}

export function applyTheme(theme: ThemeName): void {
  const el = document.documentElement;
  el.classList.remove("theme-sunroom", "theme-obsidian", "dark");
  const concrete = resolve(theme);
  if (concrete === "obsidian") {
    el.classList.add("theme-obsidian", "dark");
  } else if (concrete === "sunroom") {
    el.classList.add("theme-sunroom");
  } else if (concrete === "forest-dark") {
    el.classList.add("dark");
  }
  // forest-light: no extra classes — the :root tokens are already the default.
}

// Hold a single system-preference listener; swap it when the saved theme changes so we only
// react to OS changes while the user has `system` selected.
let systemCleanup: (() => void) | null = null;

function attachSystemListener(theme: ThemeName): void {
  if (systemCleanup) {
    systemCleanup();
    systemCleanup = null;
  }
  if (theme !== "system" || typeof window === "undefined" || !window.matchMedia) return;
  const mq = window.matchMedia(MEDIA_QUERY);
  const handler = () => applyTheme("system");
  mq.addEventListener("change", handler);
  systemCleanup = () => mq.removeEventListener("change", handler);
}

export function setTheme(theme: ThemeName): void {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
  attachSystemListener(theme);
}

// Call once at startup (before render) to avoid a flash of the wrong theme and start the
// prefers-color-scheme listener if the saved theme is `system`.
export function initTheme(): void {
  const theme = getTheme();
  applyTheme(theme);
  attachSystemListener(theme);
}
