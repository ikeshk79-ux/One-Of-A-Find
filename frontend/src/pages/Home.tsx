import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Camera, Compass, Heart, Sparkles, TrendingUp } from "lucide-react";
import SectionHeader from "@/components/common/SectionHeader";
import QuickFind from "@/components/common/QuickFind";
import ValueDisplay from "@/components/common/ValueDisplay";
import ConfidenceBadge from "@/components/common/ConfidenceBadge";
import LoadingCard from "@/components/common/LoadingCard";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { sessionKey } from "@/lib/session";
import { gbp } from "@/lib/types";
import type { InventoryItem, InventoryStats, SessionInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!then) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export default function Home() {
  const navigate = useNavigate();
  const [findQuery, setFindQuery] = useState("");
  const { data: session } = useQuery({
    queryKey: sessionKey,
    queryFn: () => apiGet<SessionInfo>("/auth/me"),
    retry: false,
  });
  const inventory = useQuery({
    queryKey: ["inventory"],
    queryFn: () => apiGet<InventoryItem[]>("/inventory"),
  });
  const stats = useQuery({
    queryKey: ["inventory", "stats"],
    queryFn: () => apiGet<InventoryStats>("/inventory/stats"),
  });

  const recent = inventory.data?.slice(0, 5) ?? [];
  const firstName = session?.username?.split(/[ .]/)[0] ?? null;

  return (
    <div className="animate-rise space-y-8 pb-6">
      {/* Hero */}
      <section className="space-y-3">
        <p className="display-title text-[10px] text-muted-foreground" data-testid="home-greeting">
          {firstName ? `Hello, ${firstName}` : "Welcome back"}
        </p>
        <h1 className="heading-title text-3xl text-foreground sm:text-4xl" data-testid="home-hero-title">
          What have you found today?
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground sm:text-base">
          Take a photo of an item and let our AI investigate what it is and what it could be worth.
        </p>
      </section>

      {/* Quick find — look an item up (or scan its tag) the moment the app opens */}
      <section className="space-y-2" data-testid="home-quick-find">
        <div className="flex">
          <QuickFind
            query={findQuery}
            onQueryChange={setFindQuery}
            items={inventory.data ?? []}
            testidPrefix="home-find"
          />
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          Search your finds by title, brand or SKU — or tap the scan icon to read a price tag.
        </p>
      </section>

      {/* Scan card — the primary action */}
      <button
        type="button"
        onClick={() => navigate("/scan")}
        data-testid="home-scan-card"
        className={cn(
          "group relative flex w-full flex-col items-start gap-4 overflow-hidden rounded-3xl border p-6 text-left transition-all duration-200",
          "border-primary/20 bg-primary text-primary-foreground",
          "hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 active:scale-[0.99]",
        )}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-primary-foreground/10 blur-2xl"
        />
        <span className="grid size-14 place-items-center rounded-2xl bg-primary-foreground/10 ring-1 ring-primary-foreground/20">
          <Camera className="size-7" />
        </span>
        <div className="relative">
          <p className="display-title text-[11px] text-primary-foreground/70">Appraise</p>
          <h2 className="heading-title mt-1 text-2xl sm:text-3xl">Scan an item</h2>
          <p className="mt-1 text-sm text-primary-foreground/80">
            Take a photo and we'll identify it, price it and spin up a listing — in seconds.
          </p>
        </div>
        <span className="relative mt-auto inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-4 py-2 text-sm font-semibold ring-1 ring-primary-foreground/20 transition-transform group-hover:translate-x-1">
          Open camera <ArrowRight className="size-4" />
        </span>
      </button>

      {/* Weekly tiles */}
      <section className="grid gap-3 sm:grid-cols-2" data-testid="home-stats">
        <ValueDisplay
          label="Raised this week"
          value={gbp(stats.data?.week_raised ?? 0)}
          caption={
            stats.data
              ? `${stats.data.week_sold_count} ${stats.data.week_sold_count === 1 ? "item" : "items"} sold since Monday`
              : "Loading…"
          }
          tone="forest"
          testid="home-tile-week"
        />
        <ValueDisplay
          label="Potential value in stock"
          value={gbp(stats.data?.potential_value ?? 0)}
          caption={
            stats.data
              ? `${stats.data.available_items} items available · ${stats.data.sold_items} sold all-time`
              : "Loading…"
          }
          tone="sage"
          testid="home-tile-potential"
        />
      </section>

      {/* Recent finds */}
      <section className="space-y-4">
        <SectionHeader
          eyebrow="Lately"
          title="Recent finds"
          description="The five most-recent items appraised across the shop."
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/finds")}
              data-testid="home-view-all-finds"
            >
              View all <ArrowRight className="size-4" />
            </Button>
          }
          testid="home-recent-header"
        />
        {inventory.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <LoadingCard testid="home-recent-loading-1" />
            <LoadingCard testid="home-recent-loading-2" />
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No finds yet"
            description="Scan your first item to see it appear here."
            action={
              <Button onClick={() => navigate("/scan")} data-testid="home-empty-scan">
                <Camera className="size-4" /> Scan item
              </Button>
            }
            testid="home-recent-empty"
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="home-recent-list">
            {recent.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/tag/${item.id}`}
                  data-testid={`home-recent-card-${item.id}`}
                  className="card-elevated group flex items-center gap-4 rounded-2xl p-3 transition-all hover:-translate-y-0.5"
                >
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {item.item_image ? (
                      <img
                        src={item.item_image}
                        alt=""
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid size-full place-items-center text-muted-foreground">
                        <Camera className="size-5" />
                      </div>
                    )}
                    {item.status === "sold" && (
                      <span className="absolute inset-0 grid place-items-center bg-foreground/60 text-[10px] font-semibold uppercase tracking-wider text-background">
                        Sold
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.brand} · {item.category}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                        {gbp(item.recommended_price)}
                      </span>
                      <ConfidenceBadge confidence={item.confidence} />
                    </div>
                  </div>
                  <div className="hidden shrink-0 text-right text-[11px] text-muted-foreground sm:block">
                    {timeAgo(item.created_at)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Secondary CTAs */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/finds"
          data-testid="home-cta-finds"
          className="card-elevated group flex items-center gap-3 rounded-2xl p-4 transition-all hover:-translate-y-0.5"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-secondary text-secondary-foreground">
            <Compass className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Browse finds</p>
            <p className="text-xs text-muted-foreground">Every item in your inventory</p>
          </div>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
        </Link>
        <Link
          to="/more"
          data-testid="home-cta-more"
          className="card-elevated group flex items-center gap-3 rounded-2xl p-4 transition-all hover:-translate-y-0.5"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--terracotta)_18%,transparent)] text-[color:var(--terracotta-deep)]">
            <Heart className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Shop & settings</p>
            <p className="text-xs text-muted-foreground">Branch, theme, help & more</p>
          </div>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
        </Link>
      </section>

      {/* Weekly aggregate footer — kept lightweight; full chart lives in future dashboard */}
      {stats.data && stats.data.all_time_raised > 0 && (
        <section
          className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-4 text-sm text-muted-foreground"
          data-testid="home-alltime"
        >
          <TrendingUp className="size-4 text-primary" />
          <span>
            All-time raised:{" "}
            <span className="font-mono font-bold tabular-nums text-foreground">
              {gbp(stats.data.all_time_raised)}
            </span>
          </span>
        </section>
      )}
    </div>
  );
}
