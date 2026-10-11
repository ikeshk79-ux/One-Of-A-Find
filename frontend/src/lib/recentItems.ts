// Recently viewed inventory items — a tiny localStorage ring so the Finds quick-find box can
// offer "jump back to what you just had in your hand" before the volunteer types anything.
const KEY = "recent-items";
const MAX = 6;

export function getRecentItemIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecentItemId(id: string): void {
  if (!id) return;
  try {
    const next = [id, ...getRecentItemIds().filter((v) => v !== id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private-mode / quota failures are not worth surfacing — recents are a convenience only.
  }
}
