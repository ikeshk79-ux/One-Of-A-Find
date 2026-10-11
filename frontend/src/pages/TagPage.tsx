import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Copy, Loader2, Maximize2, Pencil, Plus, Printer, RotateCcw, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import PriceTag from "@/components/PriceTag";
import ImageLightbox from "@/components/ImageLightbox";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { pushRecentItemId } from "@/lib/recentItems";
import { gbp, BLURB_TONES, CATEGORIES, LOCATIONS, CONDITION_OPTIONS, sizeOptionsFor, adjustedCharityPrice, charityGuidePrice } from "@/lib/types";
import type { InventoryItem } from "@/lib/types";

export default function TagPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [sellOpen, setSellOpen] = useState(false);
  const [soldPrice, setSoldPrice] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<string>(CATEGORIES[0]);
  const [editLocation, setEditLocation] = useState<string>(LOCATIONS[0]);
  const [editTitle, setEditTitle] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editSize, setEditSize] = useState("");
  const [editCondition, setEditCondition] = useState<string>("Good");
  // Snapshot the item's saved condition at dialog-open time so the "Re-price from X condition"
  // button only appears once the volunteer has actually changed the grade.
  const [initialEditCondition, setInitialEditCondition] = useState<string>("Good");
  const [editPriceSource, setEditPriceSource] = useState<string>("charity");
  const [editGiftAid, setEditGiftAid] = useState("");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [pendingTone, setPendingTone] = useState<string | null>(null);

  const { data, isError, isPending } = useQuery({
    queryKey: ["inventory", id],
    queryFn: () => apiGet<InventoryItem>(`/inventory/${id}`),
    enabled: Boolean(id),
    retry: false,
  });

  // Feed the Finds quick-find "recently opened" list.
  useEffect(() => {
    if (data?.id) pushRecentItemId(data.id);
  }, [data?.id]);

  const sell = useMutation({
    mutationFn: (body: { sold: boolean; sold_price: number | null }) =>
      apiPatch<InventoryItem>(`/inventory/${id}/sell`, body),
    onSuccess: async (item) => {
      qc.setQueryData(["inventory", id], item);
      await qc.invalidateQueries({ queryKey: ["inventory"] });
      setSellOpen(false);
      toast.success(item.status === "sold" ? "Marked as sold" : "Back on the floor");
    },
    onError: () => toast.error("Could not update item"),
  });

  const edit = useMutation({
    mutationFn: (body: {
      category: string;
      location: string;
      title: string;
      recommended_price: number;
      size: string;
      condition: string;
      price_source: string;
      giftaid_ref: string;
    }) => apiPatch<InventoryItem>(`/inventory/${id}`, body),
    onSuccess: async (item) => {
      qc.setQueryData(["inventory", id], item);
      await qc.invalidateQueries({ queryKey: ["inventory"] });
      setEditOpen(false);
      toast.success("Item details updated");
    },
    onError: () => toast.error("Could not update details"),
  });

  const redraft = useMutation({
    mutationFn: (tone: string) =>
      apiPost<InventoryItem>(`/inventory/${id}/blurb`, { tone }),
    onMutate: (tone) => setPendingTone(tone),
    onSuccess: async (item) => {
      qc.setQueryData(["inventory", id], item);
      await qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Resale listing redrafted");
    },
    onError: () => toast.error("Could not redraft the listing"),
    onSettled: () => setPendingTone(null),
  });

  const patToggle = useMutation({
    mutationFn: (pat_passed: boolean) =>
      apiPatch<InventoryItem>(`/inventory/${id}`, { pat_passed }),
    onSuccess: async (item) => {
      qc.setQueryData(["inventory", id], item);
      await qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(item.pat_passed ? "PAT test marked as passed" : "PAT status cleared");
    },
    onError: () => toast.error("Could not update PAT status"),
  });

  const copyBlurb = async () => {
    if (!data?.resale_blurb) return;
    try {
      await navigator.clipboard.writeText(data.resale_blurb);
      toast.success("Listing copied to clipboard");
    } catch {
      toast.error("Couldn't copy — select the text and copy manually");
    }
  };

  const sold = data?.status === "sold";
  const blockedByPat = Boolean(data?.is_electrical && !data?.pat_passed);
  const editSizeOpts = sizeOptionsFor(editCategory);
  const gallery = data
    ? [
        data.item_image,
        data.label_image,
        ...(data.extra_images ?? []),
      ].filter((s): s is string => Boolean(s))
    : [];

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Item detail</p>
          <h1 className="display-title mt-3 text-2xl">Price tag &amp; record</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/"
            data-testid="appraise-another-button"
            className={`${buttonVariants()} bg-gold text-gold-ink hover:bg-gold-dim`}
          >
            <Plus className="size-4" />
            Appraise another item
          </Link>
          <Link to="/inventory" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="size-4" />
            Inventory
          </Link>
          {data &&
            (sold ? (
              <Button
                variant="outline"
                data-testid="unsell-button"
                onClick={() => sell.mutate({ sold: false, sold_price: null })}
              >
                <RotateCcw className="size-4" />
                Return to floor
              </Button>
            ) : (
              <Button
                variant="secondary"
                data-testid="mark-sold-button"
                onClick={() => {
                  setSoldPrice(String(data.recommended_price));
                  setSellOpen(true);
                }}
              >
                <BadgeCheck className="size-4" />
                Mark sold
              </Button>
            ))}
          {data && (
            <Button
              variant="outline"
              data-testid="edit-details-button"
              onClick={() => {
                setEditCategory(
                  (CATEGORIES as readonly string[]).includes(data.category)
                    ? data.category
                    : CATEGORIES[0],
                );
                setEditLocation(
                  data.location && (LOCATIONS as readonly string[]).includes(data.location)
                    ? data.location
                    : LOCATIONS[0],
                );
                setEditTitle(data.title);
                setEditPrice(String(data.recommended_price));
                setEditPriceSource(data.price_source ?? "charity");
                setEditSize(data.size ?? "");
                setEditCondition(
                  (CONDITION_OPTIONS as readonly string[]).includes(data.condition)
                    ? data.condition
                    : "Good",
                );
                setInitialEditCondition(
                  (CONDITION_OPTIONS as readonly string[]).includes(data.condition)
                    ? data.condition
                    : "Good",
                );
                setEditGiftAid((data.giftaid_ref ?? "").replace(/\D/g, ""));
                setEditOpen(true);
              }}
            >
              <Pencil className="size-4" />
              Edit details
            </Button>
          )}
          <Button
            className="bg-gold text-gold-ink hover:bg-gold-dim"
            data-testid="print-tag-button"
            disabled={!data || blockedByPat}
            title={blockedByPat ? "Pass the PAT test before printing this electrical item's tag" : undefined}
            onClick={() => window.print()}
          >
            <Printer className="size-4" />
            Print tag
          </Button>
        </div>
      </div>

      <div className="mt-10">
        {isPending && <div className="mx-auto h-64 w-[340px] rounded-lg bg-charcoal animate-sweep" />}
        {isError && (
          <p className="text-sm text-muted-foreground" data-testid="tag-error">
            Could not load this item.
          </p>
        )}
        {data && (
          <div className="grid gap-10 lg:grid-cols-[340px_1fr]">
            {blockedByPat ? (
              <div
                className="no-print mx-auto grid h-64 w-[340px] place-items-center rounded-lg border border-dashed border-red-500/40 bg-red-500/[0.04] p-6 text-center"
                data-testid="tag-locked"
              >
                <div>
                  <ShieldAlert className="mx-auto size-7 text-red-400" />
                  <p className="mt-3 text-sm font-medium text-foreground">Tag locked</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pass the PAT test to unlock and print this electrical item's tag.
                  </p>
                </div>
              </div>
            ) : (
              <PriceTag item={data} />
            )}
            <div className="no-print space-y-6">
              {data.is_electrical && (
                <div
                  data-testid="pat-banner"
                  className={`gold-ring rounded-xl border p-5 ${
                    blockedByPat
                      ? "border-red-500/40 bg-red-500/[0.06]"
                      : "border-gold/30 bg-gold/[0.06]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="display-title text-[11px] text-gold">Electrical item</p>
                      <p className="mt-1 text-sm text-muted-foreground" data-testid="pat-status-text">
                        {blockedByPat
                          ? "PAT test required — the price tag can't be printed until this item passes its safety test."
                          : "PAT test passed — safe to tag and sell."}
                      </p>
                    </div>
                    {blockedByPat ? (
                      <ShieldAlert className="size-6 shrink-0 text-red-400" />
                    ) : (
                      <ShieldCheck className="size-6 shrink-0 text-gold" />
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(data.pat_passed)}
                    data-testid="pat-passed-toggle"
                    disabled={patToggle.isPending}
                    onClick={() => patToggle.mutate(!data.pat_passed)}
                    className="mt-4 flex w-full items-center gap-3 rounded-lg border border-hairline bg-obsidian/60 p-3 text-left transition-colors duration-200 hover:border-gold/40 disabled:opacity-60"
                  >
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors duration-200 ${
                        data.pat_passed ? "border-gold bg-gold text-gold-ink" : "border-muted-foreground/50"
                      }`}
                    >
                      {data.pat_passed && <BadgeCheck className="size-3.5" />}
                    </span>
                    <span className="text-sm font-medium text-foreground">PAT test passed</span>
                  </button>
                </div>
              )}

              {sold && (
                <div
                  className="gold-ring flex items-center justify-between rounded-xl border border-gold/30 bg-gold/[0.06] p-5"
                  data-testid="sold-banner"
                >
                  <div>
                    <p className="display-title text-[11px] text-gold">Sold</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Raised {gbp(data.sold_price ?? data.recommended_price)} for the shop
                    </p>
                    {data.sold_giftaid_ref && (
                      <p className="mt-1 text-xs font-mono text-gold" data-testid="sold-giftaid">
                        Allocated to Gift Aid {data.sold_giftaid_ref}
                      </p>
                    )}
                  </div>
                  <BadgeCheck className="size-6 text-gold" />
                </div>
              )}

              {gallery.length > 0 && (
                <div>
                  <p className="display-title text-[11px] text-gold">Photos</p>
                  <div className="mt-3 flex flex-wrap gap-3" data-testid="item-gallery">
                    {gallery.map((src, i) => (
                      <button
                        key={src}
                        type="button"
                        data-testid={`gallery-image-${i}`}
                        aria-label={`Enlarge photo ${i + 1}`}
                        onClick={() => setViewerIndex(i)}
                        className="group relative size-24 overflow-hidden rounded-lg border border-hairline transition-colors duration-200 hover:border-gold/50"
                      >
                        <img
                          src={src}
                          alt={`Photo ${i + 1}`}
                          className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                        <span className="absolute inset-0 grid place-items-center bg-obsidian/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                          <Maximize2 className="size-5 text-gold" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-hairline bg-charcoal p-6">
                <div className="flex items-center justify-between">
                  <h2 className="display-title text-sm text-gold">Item record</h2>
                  <Badge variant="outline" className="text-[10px]">
                    {sold ? "Sold" : "Available"}
                  </Badge>
                </div>
                <dl className="mt-5 space-y-3 text-sm">
                  {[
                    ["Title", data.title],
                    ["Brand", data.brand],
                    ["Category", data.category],
                    ["Location", data.location ?? "—"],
                    ...(data.size ? [["Size", data.size]] : []),
                    ["Condition", data.condition],
                    ...(data.is_electrical
                      ? [["PAT test", data.pat_passed ? "Passed" : "Required"]]
                      : []),
                    ["Peak RRP", gbp(data.peak_retail_price)],
                    ["Charity price", gbp(data.recommended_price)],
                    ["SKU", data.sku],
                    ...(data.giftaid_ref ? [["Gift Aid ref", data.giftaid_ref]] : []),
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-6 border-b border-hairline pb-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="text-right font-mono">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                  {data.description}
                </p>
              </div>

              <div
                className="rounded-xl border border-hairline bg-charcoal p-6"
                data-testid="resale-listing-card"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="display-title text-sm text-gold">Resale listing</h2>
                  {data.resale_blurb && (
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="tag-copy-blurb-button"
                      onClick={copyBlurb}
                    >
                      <Copy className="size-3.5" />
                      Copy
                    </Button>
                  )}
                </div>
                {data.resale_blurb ? (
                  <p
                    className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground"
                    data-testid="tag-resale-blurb-text"
                  >
                    {data.resale_blurb}
                  </p>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground" data-testid="tag-resale-blurb-empty">
                    No listing draft yet — pick a tone below to generate one.
                  </p>
                )}
                <div className="mt-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Redraft in a tone
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2" data-testid="blurb-tones">
                    {BLURB_TONES.map((t) => (
                      <Button
                        key={t.id}
                        size="sm"
                        variant="secondary"
                        disabled={redraft.isPending}
                        data-testid={`blurb-tone-${t.id}`}
                        onClick={() => redraft.mutate(t.id)}
                      >
                        {pendingTone === t.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="size-3.5" />
                        )}
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={sellOpen} onOpenChange={setSellOpen}>
        <DialogContent className="border-hairline bg-charcoal" data-testid="sell-dialog">
          <DialogHeader>
            <DialogTitle className="display-title text-sm text-gold">Record a sale</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sold-price" className="text-xs uppercase tracking-widest">
              Sold price (£)
            </Label>
            <Input
              id="sold-price"
              type="number"
              inputMode="decimal"
              value={soldPrice}
              onChange={(e) => setSoldPrice(e.target.value)}
              data-testid="sold-price-input"
              className="bg-obsidian font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Defaults to the recommended price — adjust if it sold for a different amount.
            </p>
            {data?.giftaid_ref && (
              <p className="text-xs font-mono text-gold" data-testid="sell-giftaid-note">
                This sale will be allocated to Gift Aid {data.giftaid_ref}.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSellOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-gold text-gold-ink hover:bg-gold-dim"
              disabled={sell.isPending}
              data-testid="confirm-sold-button"
              onClick={() => {
                const trimmed = soldPrice.trim();
                const parsed = trimmed === "" ? null : Number(trimmed);
                // Empty field -> null (backend defaults to recommended). An explicit 0 stays 0.
                sell.mutate({
                  sold: true,
                  sold_price: parsed === null || Number.isNaN(parsed) ? null : parsed,
                });
              }}
            >
              <BadgeCheck className="size-4" />
              Confirm sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="border-hairline bg-charcoal" data-testid="edit-dialog">
          <DialogHeader>
            <DialogTitle className="display-title text-sm text-gold">Edit item details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title" className="text-xs uppercase tracking-widest">
                Title
              </Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                data-testid="edit-title-input"
                className="bg-obsidian"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-price" className="text-xs uppercase tracking-widest">
                Recommended price (£)
              </Label>
              <Input
                id="edit-price"
                type="number"
                inputMode="decimal"
                value={editPrice}
                onChange={(e) => {
                  setEditPrice(e.target.value);
                  setEditPriceSource("custom");
                }}
                data-testid="edit-price-input"
                className="bg-obsidian font-mono"
              />
              {editCondition !== initialEditCondition && (
                <Button
                  type="button"
                  size="sm"
                  data-testid="reprice-from-condition"
                  onClick={() => {
                    if (!data) return;
                    const guide = charityGuidePrice(data.peak_retail_price, data.market_average_price);
                    setEditPrice(String(adjustedCharityPrice(guide, editCondition)));
                    setEditPriceSource("charity");
                  }}
                  className="mt-2 h-10 w-full justify-center bg-gold text-gold-ink hover:bg-gold-dim"
                >
                  <Sparkles className="size-4" />
                  Re-price from {editCondition} condition
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-giftaid" className="text-xs uppercase tracking-widest">
                Gift Aid number
              </Label>
              <Input
                id="edit-giftaid"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                value={editGiftAid}
                onChange={(e) => setEditGiftAid(e.target.value.replace(/\D/g, ""))}
                placeholder="Digits only — leave blank to clear"
                data-testid="edit-giftaid-input"
                className="bg-obsidian font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category" className="text-xs uppercase tracking-widest">
                Category
              </Label>
              <Select
                value={editCategory}
                onValueChange={(v) => {
                  setEditCategory(v);
                  setEditSize("");
                }}
              >
                <SelectTrigger id="edit-category" className="bg-obsidian" data-testid="edit-category-select">
                  <SelectValue>{(v) => v as string}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} data-testid={`edit-category-${c}`}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-condition" className="text-xs uppercase tracking-widest">
                Condition
              </Label>
              <Select
                value={editCondition}
                onValueChange={(v) => {
                  setEditCondition(v);
                  // The stored price no longer matches the new grade's guide until the volunteer
                  // taps "Re-price"; treat it as a manual price so the tag stops claiming "% of guide".
                  setEditPriceSource("custom");
                }}
              >
                <SelectTrigger id="edit-condition" className="bg-obsidian" data-testid="edit-condition-select">
                  <SelectValue>{(v) => v as string}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_OPTIONS.map((c) => (
                    <SelectItem
                      key={c}
                      value={c}
                      data-testid={`edit-condition-${c.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                    >
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editSizeOpts && (
              <div className="space-y-2">
                <Label htmlFor="edit-size" className="text-xs uppercase tracking-widest">
                  {editSizeOpts.label}
                </Label>
                <Select
                  value={editSize || "none"}
                  onValueChange={(v) => setEditSize(v === "none" ? "" : v)}
                >
                  <SelectTrigger id="edit-size" className="bg-obsidian" data-testid="edit-size-select">
                    <SelectValue>{(v) => (v === "none" ? "No size" : (v as string))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" data-testid="edit-size-none">
                      No size
                    </SelectItem>
                    {editSizeOpts.options.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`edit-size-${s}`}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-location" className="text-xs uppercase tracking-widest">
                Shop location
              </Label>
              <Select value={editLocation} onValueChange={setEditLocation}>
                <SelectTrigger id="edit-location" className="bg-obsidian" data-testid="edit-location-select">
                  <SelectValue>{(v) => v as string}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map((l) => (
                    <SelectItem key={l} value={l} data-testid={`edit-location-${l}`}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-gold text-gold-ink hover:bg-gold-dim"
              disabled={edit.isPending || !editTitle.trim() || !editPrice.trim()}
              data-testid="save-details-button"
              onClick={() =>
                edit.mutate({
                  category: editCategory,
                  location: editLocation,
                  title: editTitle.trim(),
                  recommended_price: Number(editPrice) || 0,
                  size: editSize,
                  condition: editCondition,
                  price_source: editPriceSource,
                  giftaid_ref: editGiftAid,
                })
              }
            >
              <Pencil className="size-4" />
              Save details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        open={viewerIndex !== null}
        images={gallery}
        startIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
    </div>
  );
}
