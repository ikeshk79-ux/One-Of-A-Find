import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Package, ScanLine, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import BarcodeScanner from "@/components/BarcodeScanner";
import TillSellDialog from "@/components/common/TillSellDialog";
import { ApiError } from "@/lib/api";
import { getRecentItemIds } from "@/lib/recentItems";
import { resolveScannedCode } from "@/lib/scan";
import { gbp } from "@/lib/types";
import type { InventoryItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_SUGGESTIONS = 6;

export function matchesQuery(item: InventoryItem, needle: string): boolean {
  if (!needle) return true;
  return (
    item.title.toLowerCase().includes(needle) ||
    item.brand.toLowerCase().includes(needle) ||
    item.category.toLowerCase().includes(needle) ||
    item.sku.toLowerCase().includes(needle)
  );
}

/** Search box with a typeahead dropdown (tap a suggestion to open its price tag), a
 * recently-viewed list when empty, and a scan button for till mode — scanning a tag's
 * barcode/QR opens a one-tap "mark sold" dialog at the tag price. */
export default function QuickFind({
  query,
  onQueryChange,
  items,
  testidPrefix = "finds",
}: {
  query: string;
  onQueryChange: (next: string) => void;
  items: InventoryItem[];
  /** Namespaces the data-testids so the same box can live on more than one page. */
  testidPrefix?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [scanOpen, setScanOpen] = useState(false);
  // Till mode: a successful scan opens the one-tap sell dialog rather than the tag page.
  const [tillItemId, setTillItemId] = useState<string | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>(() => getRecentItemIds());
  const inputRef = useRef<HTMLInputElement>(null);

  // Recents are written by the tag page, so refresh them whenever the dropdown opens.
  useEffect(() => {
    if (open) setRecentIds(getRecentItemIds());
  }, [open]);

  const needle = query.trim().toLowerCase();

  const suggestions = useMemo(() => {
    if (!needle) {
      const byId = new Map(items.map((i) => [i.id, i]));
      return recentIds
        .map((id) => byId.get(id))
        .filter((i): i is InventoryItem => Boolean(i))
        .slice(0, 4);
    }
    // Prefix hits on title/brand first — typing "nike" should surface Nike items above an
    // item whose description merely mentions it.
    const hits = items.filter((i) => matchesQuery(i, needle));
    const starts = (i: InventoryItem) =>
      i.title.toLowerCase().startsWith(needle) || i.brand.toLowerCase().startsWith(needle);
    return [...hits.filter(starts), ...hits.filter((i) => !starts(i))].slice(0, MAX_SUGGESTIONS);
  }, [items, needle, recentIds]);

  const showRecents = !needle && suggestions.length > 0;
  const listOpen = open && suggestions.length > 0;

  const go = useCallback(
    (item: InventoryItem) => {
      setOpen(false);
      setActive(-1);
      inputRef.current?.blur();
      navigate(`/tag/${item.id}`);
    },
    [navigate],
  );

  const handleScan = useCallback(
    async (raw: string) => {
      try {
        const hit = await resolveScannedCode(raw);
        if (!hit) {
          toast.error("No item matches that barcode");
          return;
        }
        setScanOpen(false);
        if (hit.title) toast.success(`Found: ${hit.title}`);
        setTillItemId(hit.id);
      } catch (err) {
        toast.error(
          err instanceof ApiError && err.status === 404
            ? "No item matches that barcode"
            : "Could not look that up",
        );
      }
    },
    [],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!listOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      const pick = suggestions[active] ?? suggestions[0];
      if (pick) {
        e.preventDefault();
        go(pick);
      }
    }
  };

  return (
    <div
      className="relative flex-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search by title, brand, category or SKU"
        data-testid={`${testidPrefix}-search`}
        aria-label="Search finds"
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={`${testidPrefix}-quick-find-suggestions`}
        aria-autocomplete="list"
        autoComplete="off"
        className="h-11 rounded-full pl-10 pr-20"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {query && (
          <button
            type="button"
            onClick={() => {
              onQueryChange("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            data-testid={`${testidPrefix}-search-clear`}
          >
            <X className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          aria-label="Scan a price tag to sell at the till"
          title="Scan to sell"
          className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          data-testid={`${testidPrefix}-scan-button`}
        >
          <ScanLine className="size-4" />
        </button>
      </div>

      {listOpen && (
        <ul
          id={`${testidPrefix}-quick-find-suggestions`}
          role="listbox"
          data-testid={`${testidPrefix}-suggestions`}
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 origin-top overflow-y-auto rounded-2xl border border-border bg-card p-1.5 shadow-2xl animate-rise"
        >
          {showRecents && (
            <li
              className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              data-testid={`${testidPrefix}-suggestions-recent-label`}
            >
              <Clock className="size-3" /> Recently opened
            </li>
          )}
          {suggestions.map((item, index) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                // Prevent the tap from blurring the input (iOS/Safari does not focus buttons on
                // tap, so without this the wrapper's blur handler would close the dropdown
                // before the click reaches us and the volunteer's tap is lost).
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => go(item)}
                data-testid={`${testidPrefix}-suggestion-${item.id}`}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                  index === active ? "bg-primary/10" : "hover:bg-muted",
                )}
              >
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                  {item.item_image ? (
                    <img src={item.item_image} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <Package className="size-4 text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {item.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.brand} · SKU {item.sku.slice(-6)}
                  </span>
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                  {gbp(item.recommended_price)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={handleScan} />
      <TillSellDialog
        itemId={tillItemId}
        open={tillItemId !== null}
        onClose={() => setTillItemId(null)}
      />
    </div>
  );
}
