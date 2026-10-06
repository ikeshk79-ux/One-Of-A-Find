import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  Filter,
  LayoutGrid,
  Package,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import SectionHeader from "@/components/common/SectionHeader";
import ConfidenceBadge from "@/components/common/ConfidenceBadge";
import LoadingCard from "@/components/common/LoadingCard";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";
import { gbp } from "@/lib/types";
import type { InventoryItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "available" | "sold" | "pat-pending";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!then) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  return `${weeks}w`;
}

export default function Finds() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const inventory = useQuery({
    queryKey: ["inventory"],
    queryFn: () => apiGet<InventoryItem[]>("/inventory"),
  });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const items = inventory.data ?? [];
    return items.filter((item) => {
      if (status === "available" && item.status !== "available") return false;
      if (status === "sold" && item.status !== "sold") return false;
      if (status === "pat-pending") {
        if (!item.is_electrical || item.pat_passed) return false;
      }
      if (!needle) return true;
      return (
        item.title.toLowerCase().includes(needle) ||
        item.brand.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle) ||
        item.sku.includes(needle)
      );
    });
  }, [inventory.data, query, status]);

  return (
    <div className="animate-rise space-y-6 pb-6">
      <SectionHeader
        eyebrow="Inventory"
        title="Your finds"
        description="Everything you've appraised, newest first. Tap a card to view the price tag or edit."
        action={
          <Link
            to="/inventory"
            data-testid="finds-full-inventory"
            className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 sm:inline-flex"
          >
            <LayoutGrid className="size-4" />
            Full inventory view
          </Link>
        }
        testid="finds-header"
      />

      {/* Search + filter row */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, brand, category or SKU"
            data-testid="finds-search"
            aria-label="Search finds"
            className="h-11 rounded-full pl-10 pr-10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              data-testid="finds-search-clear"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
          {(
            [
              { id: "all" as const, label: "All" },
              { id: "available" as const, label: "Available" },
              { id: "sold" as const, label: "Sold" },
              { id: "pat-pending" as const, label: "PAT pending" },
            ] satisfies readonly { id: StatusFilter; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={status === f.id}
              onClick={() => setStatus(f.id)}
              data-testid={`finds-filter-${f.id}`}
              className={cn(
                "touch-target rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
                status === f.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {f.label === "PAT pending" && <Filter className="mr-1 inline size-3" />}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {inventory.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <LoadingCard testid="finds-loading-1" />
          <LoadingCard testid="finds-loading-2" />
          <LoadingCard testid="finds-loading-3" />
        </div>
      ) : inventory.isError ? (
        <ErrorState
          title="We couldn't load your finds"
          description="Please check your connection and try again."
          action={
            <Button variant="outline" onClick={() => inventory.refetch()}>
              Retry
            </Button>
          }
          testid="finds-error"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={query || status !== "all" ? Search : Sparkles}
          title={query || status !== "all" ? "No matches" : "No finds yet"}
          description={
            query || status !== "all"
              ? "Try a different search or clear the filter."
              : "Scan your first item to start building your inventory."
          }
          action={
            query || status !== "all" ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                }}
                data-testid="finds-empty-reset"
              >
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => navigate("/scan")} data-testid="finds-empty-scan">
                <Camera className="size-4" /> Scan item
              </Button>
            )
          }
          testid="finds-empty"
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground" data-testid="finds-count">
            {filtered.length} {filtered.length === 1 ? "item" : "items"}
            {query && (
              <>
                {" "}
                for <strong className="text-foreground">"{query}"</strong>
              </>
            )}
          </p>
          <ul
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="finds-grid"
          >
            {filtered.map((item) => (
              <li key={item.id} className="animate-rise">
                <Link
                  to={`/tag/${item.id}`}
                  data-testid={`finds-card-${item.id}`}
                  className="card-elevated group flex h-full flex-col gap-3 rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted">
                    {item.item_image ? (
                      <img
                        src={item.item_image}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid size-full place-items-center text-muted-foreground">
                        <Package className="size-6" />
                      </div>
                    )}
                    {item.status === "sold" && (
                      <span
                        className="absolute left-2 top-2 rounded-full bg-foreground/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background"
                        data-testid={`finds-card-${item.id}-sold`}
                      >
                        Sold
                      </span>
                    )}
                    {item.is_electrical && !item.pat_passed && (
                      <span
                        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--terracotta)_90%,black)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
                        data-testid={`finds-card-${item.id}-pat`}
                      >
                        <AlertTriangle className="size-3" />
                        PAT
                      </span>
                    )}
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                    <p className="line-clamp-1 text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {item.brand} · {item.category}
                    </p>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <span className="font-mono text-lg font-extrabold tabular-nums text-foreground">
                        {gbp(item.recommended_price)}
                      </span>
                      <ConfidenceBadge confidence={item.confidence} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>SKU {item.sku.slice(-6)}</span>
                      <span>{timeAgo(item.created_at)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="sm:hidden">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/inventory")}
              data-testid="finds-full-inventory-mobile"
            >
              <LayoutGrid className="size-4" />
              Open full inventory view
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Use the full view to bulk-print tags, mark items sold or filter by location.
            </p>
          </div>
          <Badge variant="secondary" className="hidden" data-testid="finds-badge-anchor">
            {filtered.length}
          </Badge>
        </>
      )}
    </div>
  );
}
