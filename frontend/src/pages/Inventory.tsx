import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Check, CircleDollarSign, MapPin, Maximize2, PackageSearch, Printer, ScanLine, Search, Sparkles, TrendingUp, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import BarcodeScanner from "@/components/BarcodeScanner";
import ImageLightbox from "@/components/ImageLightbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiDelete, apiGet } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { gbp, CATEGORIES, LOCATIONS, ALL_SIZES } from "@/lib/types";
import type { InventoryItem, InventoryStats } from "@/lib/types";
import { useSessionLocation } from "@/lib/sessionLocation";
import { resolveScannedCode } from "@/lib/scan";

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  testid,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent?: boolean;
  testid: string;
}) {
  return (
    <div
      data-testid={testid}
      className={`rounded-xl border p-5 ${accent ? "gold-ring border-gold/30 bg-gold/[0.06]" : "border-hairline bg-charcoal"}`}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`size-4 ${accent ? "text-gold" : ""}`} />
        <span className="text-[10px] uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className={`mt-3 font-mono text-3xl tabular-nums ${accent ? "text-gold" : "text-foreground"}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function Inventory() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("all");
  const [myBranchOnly, setMyBranchOnly] = useState(false);
  const [availability, setAvailability] = useState<"all" | "available" | "sold">("all");
  const [sort, setSort] = useState("newest");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [scanOpen, setScanOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<InventoryItem | null>(null);
  const [expandCard, setExpandCard] = useState<InventoryItem | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sessionLocation = useSessionLocation();

  const { data, isError } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => apiGet<InventoryItem[]>("/inventory"),
    retry: false,
  });
  const { data: stats } = useQuery({
    queryKey: ["inventory", "stats"],
    queryFn: () => apiGet<InventoryStats>("/inventory/stats"),
    retry: false,
  });

  // The list endpoint trims label/detail photos, so fetch the full item when its viewer opens.
  // Until it arrives, show the card's main photo so the viewer opens instantly.
  const { data: expandFull } = useQuery({
    queryKey: ["inventory", "full", expandCard?.id],
    queryFn: () => apiGet<InventoryItem>(`/inventory/${expandCard!.id}`),
    enabled: !!expandCard,
    retry: false,
  });
  const lightboxSource = expandFull ?? expandCard;
  const lightboxImages = lightboxSource
    ? [lightboxSource.item_image, lightboxSource.label_image, ...lightboxSource.extra_images].filter(
        (x): x is string => !!x,
      )
    : [];

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/inventory/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Item removed");
    },
    onError: () => toast.error("Could not remove item"),
  });

  const all = isError ? [] : (data ?? []);
  // Electrical items can't be tagged until they pass their PAT test, so they can't be bulk-printed.
  const patBlocked = (i: InventoryItem) => Boolean(i.is_electrical && !i.pat_passed);
  const toggleSelect = (item: InventoryItem) => {
    if (patBlocked(item)) {
      toast.error("Pass the PAT test before this electrical item can be tagged");
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const categories = CATEGORIES;
  // Size filter options: the full canonical clothing→shoe list, always available as a dropdown
  // (even before any sized items exist) so the ledger can be filtered by size at any time.
  const sizeOptions = ALL_SIZES;

  const items = all.filter((i) => {
    const matchesText = `${i.title} ${i.brand} ${i.category} ${i.sku}`
      .toLowerCase()
      .includes(q.toLowerCase());
    const matchesCategory = category === "all" || i.category === category;
    // "My branch only" overrides the location dropdown and pins results to the session branch.
    const activeLocation = myBranchOnly ? sessionLocation : location;
    const matchesLocation = activeLocation === "all" || i.location === activeLocation;
    const matchesAvailability =
      availability === "all" ||
      (availability === "sold" ? i.status === "sold" : i.status !== "sold");
    const matchesSize = sizeFilter === "all" || i.size === sizeFilter;
    return matchesText && matchesCategory && matchesLocation && matchesAvailability && matchesSize;
  });

  const sorted = [...items].sort((a, b) => {
    if (sort === "price-desc") return b.recommended_price - a.recommended_price;
    if (sort === "price-asc") return a.recommended_price - b.recommended_price;
    if (sort === "category")
      return a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
    return b.created_at.localeCompare(a.created_at); // newest first
  });

  const SORTS: { value: string; label: string }[] = [
    { value: "newest", label: "Newest first" },
    { value: "price-desc", label: "Price: high → low" },
    { value: "price-asc", label: "Price: low → high" },
    { value: "category", label: "Category (A–Z)" },
  ];
  const sortLabel = (v: string) => SORTS.find((s) => s.value === v)?.label ?? v;

  const AVAIL: { key: "all" | "available" | "sold"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "available", label: "Available" },
    { key: "sold", label: "Sold" },
  ];

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
        navigate(`/tag/${hit.id}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          toast.error("No item matches that barcode");
        } else {
          toast.error("Could not look that up");
        }
      }
    },
    [navigate],
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Shop ledger</p>
          <h1 className="display-title mt-3 text-2xl">Inventory</h1>
        </div>
        <Button
          variant="outline"
          className="border-gold/40 text-gold hover:bg-gold/10"
          data-testid="scan-button"
          onClick={() => setScanOpen(true)}
        >
          <ScanLine className="size-4" />
          Scan tag
        </Button>
        <Button
          variant="outline"
          data-testid="print-mode-toggle"
          aria-pressed={selectMode}
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          className={`bg-charcoal ${selectMode ? "border-gold/60 text-gold" : "text-muted-foreground"}`}
        >
          <Printer className="size-4" />
          {selectMode ? "Cancel selection" : "Print tags"}
        </Button>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search items…"
              data-testid="inventory-search"
              className="bg-charcoal pl-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full bg-charcoal sm:w-44" data-testid="category-filter">
              <SelectValue>{(v) => (v === "all" ? "All categories" : (v as string))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="category-option-all">
                All categories
              </SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c} data-testid={`category-option-${c}`}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            data-testid="my-branch-toggle"
            aria-pressed={myBranchOnly}
            onClick={() => setMyBranchOnly((v) => !v)}
            className={`bg-charcoal ${myBranchOnly ? "border-gold/60 text-gold" : "text-muted-foreground"}`}
          >
            <MapPin className="size-4" />
            {myBranchOnly ? `My branch: ${sessionLocation}` : "My branch only"}
          </Button>
          <Select value={location} onValueChange={setLocation} disabled={myBranchOnly}>
            <SelectTrigger
              className={`w-full bg-charcoal sm:w-44 ${myBranchOnly ? "opacity-50" : ""}`}
              data-testid="location-filter"
            >
              <SelectValue>{(v) => (v === "all" ? "All locations" : (v as string))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="location-option-all">
                All locations
              </SelectItem>
              {LOCATIONS.map((l) => (
                <SelectItem key={l} value={l} data-testid={`location-option-${l}`}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sizeFilter} onValueChange={setSizeFilter}>
            <SelectTrigger className="w-full bg-charcoal sm:w-36" data-testid="size-filter">
              <SelectValue>{(v) => (v === "all" ? "All sizes" : (v as string))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="size-option-all">
                All sizes
              </SelectItem>
              {sizeOptions.map((s) => (
                <SelectItem key={s} value={s} data-testid={`size-option-${s}`}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-full bg-charcoal sm:w-48" data-testid="sort-select">
              <SelectValue>{(v) => sortLabel(v as string)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value} data-testid={`sort-option-${s.value}`}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div
            className="flex rounded-md border border-hairline bg-charcoal p-1"
            data-testid="availability-filter"
          >
            {AVAIL.map((a) => (
              <button
                key={a.key}
                type="button"
                data-testid={`availability-${a.key}`}
                onClick={() => setAvailability(a.key)}
                className={`rounded px-3 py-1.5 text-xs transition-colors duration-200 ${
                  availability === a.key
                    ? "bg-gold/15 text-gold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="stats-grid">
        <StatCard
          label="Raised this week"
          value={gbp(stats?.week_raised ?? 0)}
          sub={`${stats?.week_sold_count ?? 0} sold since ${stats?.week_start ?? "Mon"}`}
          icon={TrendingUp}
          accent
          testid="stat-week-raised"
        />
        <StatCard
          label="All-time raised"
          value={gbp(stats?.all_time_raised ?? 0)}
          sub={`${stats?.sold_items ?? 0} items sold`}
          icon={CircleDollarSign}
          testid="stat-all-time"
        />
        <StatCard
          label="On the floor"
          value={String(stats?.available_items ?? 0)}
          sub="items available"
          icon={PackageSearch}
          testid="stat-available"
        />
        <StatCard
          label="Potential value"
          value={gbp(stats?.potential_value ?? 0)}
          sub="if all unsold items sell"
          icon={Sparkles}
          testid="stat-potential"
        />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="inventory-list">
        {sorted.map((item) => {
          const sold = item.status === "sold";
          const selected = selectedIds.has(item.id);
          const blocked = patBlocked(item);
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              data-testid={`inventory-item-${item.id}`}
              onClick={() => (selectMode ? toggleSelect(item) : navigate(`/tag/${item.id}`))}
              onKeyDown={(e) =>
                e.key === "Enter" && (selectMode ? toggleSelect(item) : navigate(`/tag/${item.id}`))
              }
              className={`group cursor-pointer overflow-hidden rounded-xl border bg-charcoal outline-none transition-colors duration-200 hover:border-gold/40 focus-visible:border-gold/60 ${
                selected ? "border-gold/70 ring-1 ring-gold/40" : "border-hairline"
              } ${selectMode && blocked ? "opacity-60" : ""}`}
            >
              <div className="relative h-36 overflow-hidden bg-obsidian">
                {item.item_image ? (
                  <img
                    src={item.item_image}
                    alt={item.title}
                    className={`size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${sold ? "opacity-45" : ""}`}
                  />
                ) : (
                  <div className="grid size-full place-items-center text-muted-foreground">
                    <PackageSearch className="size-6" />
                  </div>
                )}
                {(sold || (item.is_electrical && !item.pat_passed)) && (
                  <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
                    {sold && (
                      <span
                        className="rounded-full bg-gold px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-gold-ink"
                        data-testid={`sold-badge-${item.id}`}
                      >
                        Sold {gbp(item.sold_price ?? item.recommended_price)}
                      </span>
                    )}
                    {item.is_electrical && !item.pat_passed && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white"
                        data-testid={`pat-badge-${item.id}`}
                      >
                        <Zap className="size-3" />
                        PAT required
                      </span>
                    )}
                  </div>
                )}
                {selectMode && (
                  <span
                    data-testid={`select-${item.id}`}
                    className={`absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-md border-2 transition-colors duration-200 ${
                      selected
                        ? "border-gold bg-gold text-gold-ink"
                        : "border-white/70 bg-obsidian/70 text-transparent"
                    }`}
                  >
                    <Check className="size-4" />
                  </span>
                )}
                {!selectMode && item.item_image && (
                  <button
                    type="button"
                    data-testid={`enlarge-${item.id}`}
                    aria-label="Enlarge photos"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandCard(item);
                    }}
                    className="absolute right-2 top-2 grid size-8 place-items-center rounded-full border border-hairline/70 bg-obsidian/70 text-muted-foreground backdrop-blur transition-colors duration-200 hover:text-gold"
                  >
                    <Maximize2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {item.brand}
                </p>
                <h3 className="mt-1 truncate text-sm font-semibold">{item.title}</h3>
                {item.size && (
                  <p className="mt-1 text-[11px] text-gold/80" data-testid={`item-size-${item.id}`}>
                    Size {item.size}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-mono text-xl text-gold tabular-nums">
                    {gbp(item.recommended_price)}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {item.condition}
                  </Badge>
                </div>
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">SKU {item.sku}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-gold/80">Open item →</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    data-testid={`delete-${item.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(item);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectMode && (
        <div
          className="no-print fixed inset-x-0 bottom-16 z-30 px-4 sm:bottom-6"
          data-testid="print-selection-bar"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-charcoal/95 px-4 py-3 shadow-lg backdrop-blur-xl">
            <span className="text-sm text-foreground" data-testid="print-selected-count">
              {selectedIds.size} selected
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                data-testid="print-select-visible"
                onClick={() =>
                  setSelectedIds(
                    new Set(sorted.filter((i) => !patBlocked(i)).map((i) => i.id)),
                  )
                }
              >
                Select visible
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={selectedIds.size === 0}
                data-testid="print-clear"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
              <Button
                className="bg-gold text-gold-ink hover:bg-gold-dim"
                size="sm"
                disabled={selectedIds.size === 0}
                data-testid="print-selected-button"
                onClick={() =>
                  navigate(`/print-tags?ids=${[...selectedIds].join(",")}`)
                }
              >
                <Printer className="size-4" />
                Print {selectedIds.size} tag{selectedIds.size === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div
          className="mt-8 rounded-xl border border-hairline bg-charcoal p-10 text-center text-sm text-muted-foreground"
          data-testid="inventory-empty"
        >
          {all.length === 0
            ? "Nothing here yet. Appraise a donation to start the ledger."
            : "No items match these filters."}
        </div>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(v) => !v && setPendingDelete(null)}
      >
        <DialogContent className="border-hairline bg-charcoal" data-testid="delete-dialog">
          <DialogHeader>
            <DialogTitle className="display-title text-sm text-gold">Remove item?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground" data-testid="delete-dialog-text">
            This permanently deletes &ldquo;{pendingDelete?.title}&rdquo; and its photos. This
            cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" data-testid="delete-cancel" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              data-testid="delete-confirm"
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={handleScan}
      />

      <ImageLightbox
        open={!!expandCard}
        images={lightboxImages}
        onClose={() => setExpandCard(null)}
      />
    </div>
  );
}
