import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, Loader2, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import type { PricingRules, SessionInfo, Shop } from "@/lib/types";

/** Pull the backend's `{detail: "..."}` out of an ApiError so volunteers see "3 items still
 * reference this shop…" instead of the fetch wrapper's generic "request failed with 409". */
function detailOf(e: Error): string {
  if (e instanceof ApiError) {
    const d = (e.body as { detail?: unknown } | null)?.detail;
    if (typeof d === "string") return d;
  }
  return e.message;
}
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ZONE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "unmapped", label: "Not yet mapped" },
  { value: "1", label: "Zone 1" },
  { value: "2", label: "Zone 2" },
  { value: "3", label: "Zone 3" },
  { value: "4", label: "Zone 4" },
  { value: "5", label: "Zone 5" },
  { value: "6", label: "Zone 6" },
  { value: "outside", label: "Outside mapped zones" },
];

function zoneLabel(shop: Shop): string {
  if (shop.outside_zones) return "Outside zones";
  if (shop.zone === null) return "Unmapped";
  return `Zone ${shop.zone}`;
}

export default function Admin() {
  const navigate = useNavigate();
  const session = useQuery<SessionInfo>({
    queryKey: ["session"],
    queryFn: () => apiGet<SessionInfo>("/auth/me"),
    staleTime: 30_000,
  });

  // Redirect non-master users to the home page — the shop/rules controls are master-only.
  useEffect(() => {
    if (session.data && session.data.authenticated === false) {
      navigate("/", { replace: true });
    } else if (session.data && session.data.is_master === false) {
      toast.error("Admin area is restricted to the master account");
      navigate("/more", { replace: true });
    }
  }, [session.data, navigate]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-6 pb-24">
      <header className="flex items-center gap-3">
        <Link
          to="/more"
          className="grid size-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          data-testid="admin-back"
          aria-label="Back to more"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            Admin
          </p>
          <h1 className="display-title text-2xl text-foreground">Shops & pricing</h1>
          <p className="text-xs text-muted-foreground">
            Master-only controls for shops, TfL zones and the zone-adjustment rules.
          </p>
        </div>
      </header>

      <ShopsSection />
      <RulesSection />
      <AuditSection />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Shops section — list + add + edit + disable/enable
// -----------------------------------------------------------------------------
function ShopsSection() {
  const qc = useQueryClient();
  const shops = useQuery<Shop[]>({
    queryKey: ["shops", { includeDisabled: true }],
    queryFn: () => apiGet<Shop[]>("/shops?include_disabled=1"),
  });
  const [editing, setEditing] = useState<Shop | null>(null);
  const [adding, setAdding] = useState(false);

  const needsReview = useMemo(
    () => (shops.data ?? []).filter((s) => s.needs_zone_review && !s.disabled),
    [shops.data],
  );

  return (
    <section className="space-y-3" data-testid="admin-shops">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-foreground">Shops</h2>
          <p className="text-xs text-muted-foreground">
            Verified Octavia Foundation branches. Edit zones here to update charity-price adjustments.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setAdding(true)}
          data-testid="admin-shops-add"
          className="gap-2"
        >
          <Plus className="size-4" />
          Add shop
        </Button>
      </div>

      {needsReview.length > 0 && (
        <div
          className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
          data-testid="admin-shops-review-banner"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">{needsReview.length} shop{needsReview.length === 1 ? "" : "s"} need{needsReview.length === 1 ? "s" : ""} zone review</p>
            <p className="opacity-80">
              Nearest station straddles a TfL fare boundary — confirm the correct zone below.
            </p>
          </div>
        </div>
      )}

      {shops.isLoading ? (
        <div className="flex items-center justify-center p-6 text-muted-foreground" data-testid="admin-shops-loading">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {(shops.data ?? []).map((shop) => (
            <li
              key={shop.id}
              className={cn("flex items-center gap-3 px-3 py-3", shop.disabled && "opacity-60")}
              data-testid={`admin-shop-${shop.id}`}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
                <Store className="size-5 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {shop.name}
                  </span>
                  {shop.disabled && (
                    <span className="rounded-full border border-border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Disabled
                    </span>
                  )}
                  {shop.needs_zone_review && !shop.disabled && (
                    <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      Review
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[shop.address, shop.postcode].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {zoneLabel(shop)}
                  {shop.nearest_station ? ` · ${shop.nearest_station}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(shop)}
                className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                data-testid={`admin-shop-edit-${shop.id}`}
                aria-label={`Edit ${shop.name}`}
              >
                <Pencil className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ShopEditDialog
        shop={editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["shops"] })}
        allShops={shops.data ?? []}
      />
      <ShopEditDialog
        shop={null}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["shops"] })}
        allShops={shops.data ?? []}
      />
    </section>
  );
}

function ShopEditDialog({
  shop,
  open,
  onClose,
  onSaved,
  allShops,
}: {
  shop: Shop | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  allShops: Shop[];
}) {
  const isNew = shop === null;
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [station, setStation] = useState("");
  const [zoneValue, setZoneValue] = useState("unmapped");
  const [needsReview, setNeedsReview] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setName(shop?.name ?? "");
    setAddress(shop?.address ?? "");
    setPostcode(shop?.postcode ?? "");
    setStation(shop?.nearest_station ?? "");
    setZoneValue(
      shop
        ? shop.outside_zones
          ? "outside"
          : shop.zone === null
            ? "unmapped"
            : String(shop.zone)
        : "unmapped",
    );
    setNeedsReview(shop?.needs_zone_review ?? false);
    setMergeTarget("");
  }, [open, shop]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        address: address.trim(),
        postcode: postcode.trim(),
        nearest_station: station.trim(),
        needs_zone_review: needsReview,
      };
      if (zoneValue === "unmapped") {
        payload.zone = null;
        payload.outside_zones = false;
      } else if (zoneValue === "outside") {
        payload.zone = null;
        payload.outside_zones = true;
      } else {
        payload.zone = Number(zoneValue);
        payload.outside_zones = false;
      }
      if (isNew) return apiPost<Shop>("/shops", payload);
      return apiPatch<Shop>(`/shops/${shop!.id}`, payload);
    },
    onSuccess: () => {
      toast.success(isNew ? "Shop added" : "Shop updated");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(detailOf(e) || "Save failed"),
  });

  const disable = useMutation({
    mutationFn: async () => apiDelete<Shop>(`/shops/${shop!.id}`),
    onSuccess: () => {
      toast.success("Shop disabled");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(detailOf(e) || "Disable failed"),
  });

  const reEnable = useMutation({
    mutationFn: async () => apiPatch<Shop>(`/shops/${shop!.id}`, { disabled: false }),
    onSuccess: () => {
      toast.success("Shop re-enabled");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(detailOf(e) || "Re-enable failed"),
  });

  const remove = useMutation({
    // Hard-delete via ?mode=remove. If a merge target was picked, the backend reassigns every
    // linked inventory + ledger row to the target shop first; otherwise it refuses with 409
    // when any item still points at this shop so the admin can disable or merge instead.
    mutationFn: async () => {
      const qs = mergeTarget ? `?mode=remove&reassign_to=${mergeTarget}` : "?mode=remove";
      return apiDelete<Shop>(`/shops/${shop!.id}${qs}`);
    },
    onSuccess: () => {
      toast.success(mergeTarget ? "Shop merged & deleted" : "Shop deleted");
      onSaved();
      onClose();
    },
    onError: (e: Error) => {
      // Surface the backend's reason (e.g. "3 items still reference this shop — merge into
      // another branch, reassign them, or disable this shop instead") instead of the generic
      // "request failed with 409" the fetch wrapper falls back to.
      toast.error(detailOf(e) || "Delete failed");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent data-testid="admin-shop-dialog">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add shop" : `Edit ${shop?.name ?? ""}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="shop-name">Name</Label>
            <Input
              id="shop-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="admin-shop-name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="shop-address">Address</Label>
            <Input
              id="shop-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 303 Kings Road, London"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="shop-postcode">Postcode</Label>
              <Input
                id="shop-postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="SW3 5EP"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shop-station">Nearest station</Label>
              <Input
                id="shop-station"
                value={station}
                onChange={(e) => setStation(e.target.value)}
                placeholder="Sloane Square"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>TfL zone</Label>
            <Select value={zoneValue} onValueChange={setZoneValue}>
              <SelectTrigger data-testid="admin-shop-zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={needsReview}
              onChange={(e) => setNeedsReview(e.target.checked)}
              className="mt-0.5"
              data-testid="admin-shop-needs-review"
            />
            <span>
              <strong className="font-semibold">Flag for zone review</strong> — tick when the
              nearest station is on a fare boundary and the zone needs confirming.
            </span>
          </label>
        </div>
        {!isNew && !shop?.disabled && (
          <div
            className="space-y-1 rounded-xl border border-dashed border-border/70 bg-muted/40 p-3"
            data-testid="admin-shop-merge-row"
          >
            <Label htmlFor="shop-merge-into" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Merge into another branch (optional)
            </Label>
            <Select value={mergeTarget || "none"} onValueChange={(v) => setMergeTarget(v === "none" ? "" : v)}>
              <SelectTrigger
                id="shop-merge-into"
                className="h-10 rounded-lg bg-background"
                data-testid="admin-shop-merge-target"
              >
                <SelectValue placeholder="Keep as its own branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keep as its own branch</SelectItem>
                {allShops
                  .filter((s) => s.id !== shop?.id && !s.disabled)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id} data-testid={`admin-shop-merge-option-${s.id}`}>
                      {s.name}
                      {s.zone != null ? ` · Zone ${s.zone}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              If this shop is a duplicate, pick the branch to merge it into — every item and
              pricing-ledger row will move to that branch and this shop will be removed.
            </p>
          </div>
        )}
        <DialogFooter className="flex-row flex-wrap items-center justify-between gap-2">
          {!isNew &&
            (shop?.disabled ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reEnable.mutate()}
                disabled={reEnable.isPending}
              >
                <Check className="size-4" />
                Re-enable
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => disable.mutate()}
                  disabled={disable.isPending}
                  data-testid="admin-shop-disable"
                >
                  Disable
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    const target = allShops.find((s) => s.id === mergeTarget);
                    const confirmMsg = target
                      ? `Merge "${shop?.name}" into "${target.name}" and delete it? Every linked item will move to ${target.name}.`
                      : `Permanently delete "${shop?.name}"? This cannot be undone.`;
                    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;
                    remove.mutate();
                  }}
                  disabled={remove.isPending}
                  data-testid="admin-shop-delete"
                >
                  <Trash2 className="size-4" />
                  {mergeTarget ? "Merge & delete" : "Delete"}
                </Button>
              </div>
            ))}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || !name.trim()}
              data-testid="admin-shop-save"
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Pricing audit section — master dashboard over db.pricing_ledger with CSV export
// -----------------------------------------------------------------------------
interface LedgerRow {
  id: string;
  created_at: string;
  item_id: string;
  item_title: string;
  item_sku: string;
  item_status: string;
  shop_name: string | null;
  zone: number | string | null;
  base_price: number;
  adjustment_percent: number;
  final_price: number;
  rule_version: number;
  actor: string;
  reason: string;
}

function fmtGbp(n: number): string {
  return `£${n.toFixed(0)}`;
}

function AuditSection() {
  const rows = useQuery<LedgerRow[]>({
    queryKey: ["pricing", "audit"],
    queryFn: () => apiGet<LedgerRow[]>("/pricing/audit?limit=100"),
  });

  const downloadCsv = async () => {
    try {
      // apiGet forces JSON parsing — hit fetch directly so the browser can save the CSV body.
      // apiGet forces JSON parsing — hit fetch directly so the browser can save the CSV body.
      // GET requests skip CSRF server-side (the middleware only enforces it on state-changing
      // verbs), so we don't need to attach a token here. The earlier code read the token from
      // the wrong sessionStorage key ("csrfToken" vs the real "ooaf_csrf"), which silently sent
      // an empty header — harmless on this GET endpoint, but a trap if the route ever moves.
      const res = await fetch("/api/pricing/audit.csv", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`CSV download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pricing-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "CSV download failed");
    }
  };

  return (
    <section className="space-y-3" data-testid="admin-audit">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-foreground">Pricing audit</h2>
          <p className="text-xs text-muted-foreground">
            Each saved valuation records the base price, the zone adjustment and the final price,
            tied to the pricing-rule version it used. Newest first.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={downloadCsv}
          data-testid="admin-audit-csv"
          className="gap-2"
        >
          Export CSV
        </Button>
      </div>

      {rows.isLoading ? (
        <div className="flex items-center justify-center p-6 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (rows.data ?? []).length === 0 ? (
        <div
          className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground"
          data-testid="admin-audit-empty"
        >
          No pricing ledger entries yet. New items filed to a shop with a mapped zone will show
          up here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="admin-audit-table">
              <thead className="bg-muted/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">When</th>
                  <th className="whitespace-nowrap px-3 py-2">Item</th>
                  <th className="whitespace-nowrap px-3 py-2">Shop</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center">Zone</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Base</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center">Adj</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Final</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center">v</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(rows.data ?? []).map((r) => (
                  <tr key={r.id} data-testid={`admin-audit-row-${r.id}`}>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </td>
                    <td className="min-w-0 px-3 py-2">
                      <span className="block max-w-[180px] truncate font-medium text-foreground">
                        {r.item_title || <span className="text-muted-foreground">—</span>}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {r.item_sku ? `SKU ${r.item_sku.slice(-6)}` : ""}
                        {r.reason ? ` · ${r.reason}` : ""}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {r.shop_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center">
                      {r.zone === null || r.zone === undefined
                        ? "—"
                        : typeof r.zone === "number"
                          ? `Z${r.zone}`
                          : r.zone}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">
                      {fmtGbp(r.base_price)}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-2 text-center font-mono tabular-nums",
                        r.adjustment_percent < 0 && "text-destructive",
                        r.adjustment_percent > 0 && "text-primary",
                      )}
                    >
                      {r.adjustment_percent > 0 ? "+" : ""}
                      {r.adjustment_percent}%
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums font-semibold text-foreground">
                      {fmtGbp(r.final_price)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center text-muted-foreground">
                      v{r.rule_version}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

const RULE_KEYS: readonly { key: string; label: string }[] = [
  { key: "1", label: "Zone 1" },
  { key: "2", label: "Zone 2" },
  { key: "3", label: "Zone 3" },
  { key: "4", label: "Zone 4" },
  { key: "5", label: "Zone 5" },
  { key: "6", label: "Zone 6" },
  { key: "outside", label: "Outside mapped zones" },
];

function RulesSection() {
  const qc = useQueryClient();
  const rules = useQuery<PricingRules>({
    queryKey: ["shops", "pricing-rules"],
    queryFn: () => apiGet<PricingRules>("/shops/pricing-rules"),
  });
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (rules.data) {
      const d: Record<string, string> = {};
      for (const { key } of RULE_KEYS) {
        d[key] = String(rules.data.adjustments[key] ?? 0);
      }
      setDraft(d);
    }
  }, [rules.data]);

  const save = useMutation({
    mutationFn: async () => {
      const adjustments: Record<string, number> = {};
      for (const { key } of RULE_KEYS) {
        const n = Number.parseFloat(draft[key] ?? "0");
        if (!Number.isFinite(n)) throw new Error(`"${key}" is not a number`);
        if (n < -100 || n > 100)
          throw new Error(`"${key}" must be between -100 and 100`);
        adjustments[key] = n;
      }
      return apiPut<PricingRules>("/shops/pricing-rules", { adjustments });
    },
    onSuccess: (next) => {
      toast.success(`Rules saved · version ${next.version}`);
      void qc.invalidateQueries({ queryKey: ["shops"] });
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  return (
    <section className="space-y-3" data-testid="admin-rules">
      <div>
        <h2 className="font-serif text-lg text-foreground">Pricing rules</h2>
        <p className="text-xs text-muted-foreground">
          Percentage applied to the charity base price when the item is filed to a shop in that
          zone. Negative = discount. Saved rules are versioned — every item records the version
          it was priced with.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-3">
        <ul className="space-y-2" data-testid="admin-rules-list">
          {RULE_KEYS.map(({ key, label }) => (
            <li key={key} className="flex items-center justify-between gap-3">
              <Label htmlFor={`rule-${key}`} className="min-w-0 flex-1 text-sm">
                {label}
              </Label>
              <div className="relative">
                <Input
                  id={`rule-${key}`}
                  type="number"
                  step="0.5"
                  value={draft[key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  className="w-24 pr-7 text-right font-mono"
                  data-testid={`admin-rule-${key}`}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-[11px] text-muted-foreground">
            Current version: <span className="font-mono">v{rules.data?.version ?? "—"}</span>
            {rules.data?.updated_by ? ` · by ${rules.data.updated_by}` : ""}
          </p>
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending || rules.isLoading}
            data-testid="admin-rules-save"
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Save rules
          </Button>
        </div>
      </div>
    </section>
  );
}
