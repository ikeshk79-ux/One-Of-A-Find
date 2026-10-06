import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Camera, Check, Copy, Loader2, Plus, Save, Sparkles, Tag as TagIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import CameraCapture from "@/components/CameraCapture";
import { apiPost } from "@/lib/api";
import { gbp, CATEGORIES, LOCATIONS, sizeOptionsFor, CONDITION_OPTIONS, CONDITION_MULTIPLIERS, adjustedCharityPrice } from "@/lib/types";
import { getSessionLocation, useSessionLocation } from "@/lib/sessionLocation";
import FirstRunGuide from "@/components/FirstRunGuide";
import type { Appraisal, InventoryItem } from "@/lib/types";

function CameraSlot({
  label,
  hint,
  value,
  onOpen,
  onClear,
  testid,
}: {
  label: string;
  hint: string;
  value: string | null;
  onOpen: () => void;
  onClear: () => void;
  testid: string;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        data-testid={testid}
        onClick={onOpen}
        className="group relative flex h-56 w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed border-hairline bg-charcoal transition-colors duration-200 hover:border-gold/50"
      >
        {value ? (
          <img src={value} alt={label} className="size-full object-cover animate-shutter" />
        ) : (
          <>
            <span className="grid size-12 place-items-center rounded-full border border-gold/25 bg-gold/8 transition-transform duration-200 group-hover:scale-105">
              <Camera className="size-5 text-gold" />
            </span>
            <span className="display-title text-[11px] text-foreground">{label}</span>
            <span className="max-w-[220px] text-center text-xs text-muted-foreground">{hint}</span>
          </>
        )}
      </button>
      {value && (
        <Button
          size="icon-sm"
          variant="secondary"
          className="absolute right-2 top-2"
          data-testid={`${testid}-clear`}
          onClick={onClear}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  selected,
  onSelect,
  testid,
}: {
  label: string;
  value: string;
  accent?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  testid?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={testid}
      aria-pressed={selected}
      className={`relative rounded-lg border p-4 text-left transition-all duration-200 ${
        selected
          ? "border-gold bg-gold/10 ring-1 ring-gold/40"
          : "border-hairline bg-obsidian/60 hover:border-gold/40"
      }`}
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`mt-2 font-mono text-2xl tabular-nums ${accent ? "text-gold" : "text-foreground"}`}>
        {value}
      </p>
      {selected && (
        <span
          className="absolute right-3 top-3 text-[9px] font-semibold uppercase tracking-wider text-gold"
          data-testid={`${testid}-selected`}
        >
          Selected
        </span>
      )}
    </button>
  );
}

export default function Appraise() {
  const [itemImage, setItemImage] = useState<string | null>(null);
  const [labelImage, setLabelImage] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<Appraisal | null>(null);
  const [category, setCategory] = useState<string>("Women's tops");
  const [location, setLocation] = useState<string>(getSessionLocation());
  const [size, setSize] = useState<string>("");
  const [extraImages, setExtraImages] = useState<string[]>([]);
  const [camera, setCamera] = useState<"item" | "label" | "extra" | null>(null);
  const [giftAidRef, setGiftAidRef] = useState("");
  const [showSizeNudge, setShowSizeNudge] = useState(false);
  const [priceChoice, setPriceChoice] = useState<"peak" | "charity" | "custom">("charity");
  const [condition, setCondition] = useState<string>("Good");
  const [isElectrical, setIsElectrical] = useState(false);
  const [customPrice, setCustomPrice] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  // Show the 3-step tour once for a new volunteer on this device; reopenable via "How it works".
  useEffect(() => {
    if (localStorage.getItem("ooaf-guide-seen") !== "1") setGuideOpen(true);
  }, []);
  const closeGuide = () => {
    localStorage.setItem("ooaf-guide-seen", "1");
    setGuideOpen(false);
  };
  const qc = useQueryClient();
  const navigate = useNavigate();
  // New listings auto-file to the session branch; a mid-session header switch updates the default.
  const sessionLocation = useSessionLocation();
  useEffect(() => {
    setLocation(sessionLocation);
  }, [sessionLocation, setLocation]);

  const appraise = useMutation({
    mutationFn: () =>
      apiPost<Appraisal>("/appraise", {
        item_image: itemImage,
        label_image: labelImage,
        extra_images: extraImages,
        notes: notes.trim() || null,
      }),
    onSuccess: (data) => {
      setResult(data);
      // Respect a category the volunteer already picked pre-appraisal when the AI's guess isn't a
      // known category, and keep their chosen size if it's still valid for the resulting category.
      const nextCat = (CATEGORIES as readonly string[]).includes(data.category) ? data.category : category;
      setCategory(nextCat);
      const opts = sizeOptionsFor(nextCat);
      setSize((prev) => (opts && (opts.options as readonly string[]).includes(prev) ? prev : ""));
      setPriceChoice("charity");
      setCustomPrice("");
      // Default the condition dropdown to the AI's grade when it's a grade we price for.
      setCondition(
        (CONDITION_OPTIONS as readonly string[]).includes(data.condition) ? data.condition : "Good",
      );
      setIsElectrical(Boolean(data.is_electrical));
      toast.success("Appraisal ready");
    },
    onError: () => toast.error("Appraisal failed — try another photo"),
  });

  const sizeOpts = sizeOptionsFor(category);
  // A bespoke price the volunteer typed; used when the "Set my own price" panel is chosen.
  const customValue = Number.parseFloat(customPrice);
  const hasCustomValue = Number.isFinite(customValue) && customValue >= 0;
  // The charity price reflects the volunteer-chosen condition: base price × grade multiplier, 50p-rounded.
  const charityPrice = result ? adjustedCharityPrice(result.recommended_price, condition) : 0;
  // The volunteer taps one of the price panels; that value becomes the item's tag price.
  const chosenPrice = result
    ? priceChoice === "peak"
      ? result.peak_retail_price
      : priceChoice === "custom"
        ? (hasCustomValue ? Math.round(customValue * 100) / 100 : 0)
        : charityPrice
    : 0;

  const save = useMutation({
    mutationFn: () =>
      apiPost<InventoryItem>("/inventory", {
        appraisal: { ...(result as Appraisal), category, condition, is_electrical: isElectrical, price_source: priceChoice, recommended_price: chosenPrice },
        location,
        size: size || null,
        item_image: itemImage,
        label_image: labelImage,
        extra_images: extraImages,
        giftaid_ref: giftAidRef.trim() || null,
      }),
    onSuccess: async (item) => {
      await qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Saved to inventory");
      navigate(`/tag/${item.id}`);
    },
    onError: () => toast.error("Could not save item"),
  });

  // Gentle nudge: clothing/shoe items should carry a size before they're filed unsized.
  const needsSize = !!sizeOpts && !size;
  const copyBlurb = async () => {
    if (!result?.resale_blurb) return;
    try {
      await navigator.clipboard.writeText(result.resale_blurb);
      toast.success("Listing copied to clipboard");
    } catch {
      toast.error("Couldn't copy — select the text and copy manually");
    }
  };
  const handleSaveClick = () => {
    if (priceChoice === "custom" && !hasCustomValue) {
      toast.error("Enter your own price first");
      document.querySelector<HTMLInputElement>('[data-testid="custom-price-input"]')?.focus();
      return;
    }
    if (needsSize) {
      setShowSizeNudge(true);
      return;
    }
    save.mutate();
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr]">
      <FirstRunGuide open={guideOpen} onClose={closeGuide} />
      <section>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Step 01</p>
          <button
            type="button"
            data-testid="open-guide-button"
            onClick={() => setGuideOpen(true)}
            className="text-[11px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-gold hover:underline"
          >
            How it works
          </button>
        </div>
        <h1 className="display-title mt-3 text-2xl text-foreground">Capture the donation</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Photograph the item and its brand label. The appraiser identifies the piece, recalls its
          peak retail price, and sets a fair charity resale price to maximise fundraising.
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <CameraSlot
            label="Item photo"
            hint="Tap to open the camera and shoot the item"
            value={itemImage}
            onOpen={() => setCamera("item")}
            onClear={() => setItemImage(null)}
            testid="item-photo-slot"
          />
          <CameraSlot
            label="Brand label"
            hint="Tap to shoot a close-up of the label or tag"
            value={labelImage}
            onOpen={() => setCamera("label")}
            onClear={() => setLabelImage(null)}
            testid="label-photo-slot"
          />
        </div>

        <CameraCapture
          open={camera !== null}
          title={
            camera === "label"
              ? "Photograph the brand label"
              : camera === "extra"
                ? "Photograph damage or hallmarks"
                : "Photograph the item"
          }
          testid="camera"
          onClose={() => setCamera(null)}
          onCapture={(dataUrl) => {
            if (camera === "label") setLabelImage(dataUrl);
            else if (camera === "extra") setExtraImages((prev) => [...prev, dataUrl]);
            else setItemImage(dataUrl);
            toast.success("Photo captured");
          }}
        />

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="display-title text-[11px] text-foreground">Detail shots</p>
            <span className="text-xs text-muted-foreground">Damage · hallmarks · wear</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-3" data-testid="extra-shots">
            {extraImages.map((src, i) => (
              <div
                key={src}
                className="group relative size-20 overflow-hidden rounded-lg border border-hairline"
                data-testid={`extra-shot-${i}`}
              >
                <img src={src} alt={`Detail ${i + 1}`} className="size-full object-cover" />
                <button
                  type="button"
                  data-testid={`extra-shot-${i}-remove`}
                  onClick={() => setExtraImages((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute inset-0 grid place-items-center bg-obsidian/70 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                >
                  <X className="size-4 text-foreground" />
                </button>
              </div>
            ))}
            <button
              type="button"
              data-testid="add-detail-shot"
              onClick={() => setCamera("extra")}
              className="grid size-20 place-items-center rounded-lg border border-dashed border-hairline bg-charcoal text-muted-foreground transition-colors duration-200 hover:border-gold/50 hover:text-gold"
            >
              <Plus className="size-5" />
            </button>
          </div>
        </div>

        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes — marks, missing parts, wear…"
          data-testid="notes-input"
          className="mt-4 min-h-24 bg-charcoal"
        />

        <div className="mt-5 flex items-center justify-between">
          <p className="display-title text-[11px] text-foreground">Category &amp; size</p>
          <span className="text-xs text-muted-foreground">Set now or refine after appraisal</span>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="capture-category-select" className="text-[10px] uppercase tracking-[0.18em]">
              Category
            </Label>
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v);
                setSize("");
              }}
            >
              <SelectTrigger id="capture-category-select" className="bg-charcoal" data-testid="capture-category-select">
                <SelectValue>{(v) => v as string}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} data-testid={`capture-category-${c}`}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {sizeOpts && (
            <div className="space-y-2">
              <Label htmlFor="capture-size-select" className="text-[10px] uppercase tracking-[0.18em]">
                {sizeOpts.label}
              </Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger id="capture-size-select" className="bg-charcoal" data-testid="capture-size-select">
                  <SelectValue placeholder={`Select ${sizeOpts.label.toLowerCase()}`}>
                    {(v) => v as string}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sizeOpts.options.map((s) => (
                    <SelectItem key={s} value={s} data-testid={`capture-size-${s}`}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Button
          className="mt-5 h-12 w-full bg-gold text-gold-ink transition-transform duration-200 hover:bg-gold-dim active:scale-[0.99]"
          disabled={!itemImage || appraise.isPending}
          data-testid="appraise-button"
          onClick={() => appraise.mutate()}
        >
          {appraise.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {appraise.isPending ? "Appraising…" : "Appraise item"}
        </Button>
      </section>

      <section>
        <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Step 02</p>
        <h2 className="display-title mt-3 text-2xl text-foreground">Valuation</h2>

        {appraise.isPending && (
          <div className="mt-7 space-y-3" data-testid="appraisal-loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg border border-hairline bg-charcoal animate-sweep" />
            ))}
          </div>
        )}

        {!appraise.isPending && !result && (
          <div
            className="mt-7 rounded-xl border border-hairline bg-charcoal p-8 text-sm text-muted-foreground"
            data-testid="appraisal-empty"
          >
            <Camera className="mb-4 size-6 text-gold/70" />
            No appraisal yet. Add an item photo and press{" "}
            <span className="text-foreground">Appraise item</span> to see the valuation here.
          </div>
        )}

        {!appraise.isPending && result && (
          <div
            className="gold-ring mt-7 rounded-xl border border-hairline bg-charcoal p-6"
            data-testid="appraisal-result"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {result.brand}
                </p>
                <h3 className="mt-1 text-xl font-semibold" data-testid="result-title">
                  {result.title}
                </h3>
              </div>
              <div className="shrink-0 text-right">
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Condition
                </p>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger
                    data-testid="condition-select"
                    className="h-9 w-[168px] border-gold/30 bg-gold/10 text-gold"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_OPTIONS.map((c) => (
                      <SelectItem
                        key={c}
                        value={c}
                        data-testid={`condition-option-${c.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                      >
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground" data-testid="result-description">
              {result.description}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Stat
                testid="price-option-peak"
                label="Peak RRP"
                value={gbp(result.peak_retail_price)}
                selected={priceChoice === "peak"}
                onSelect={() => setPriceChoice("peak")}
              />
              <Stat
                testid="price-option-charity"
                label="Charity price"
                value={gbp(charityPrice)}
                accent
                selected={priceChoice === "charity"}
                onSelect={() => setPriceChoice("charity")}
              />
              <div
                role="button"
                tabIndex={0}
                data-testid="price-option-custom"
                aria-pressed={priceChoice === "custom"}
                onClick={() => setPriceChoice("custom")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setPriceChoice("custom");
                }}
                className={`relative rounded-lg border p-4 text-left transition-all duration-200 ${
                  priceChoice === "custom"
                    ? "border-gold bg-gold/10 ring-1 ring-gold/40"
                    : "border-hairline bg-obsidian/60 hover:border-gold/40"
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Set my own price
                </p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-mono text-2xl tabular-nums text-gold">£</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={customPrice}
                    placeholder="0.00"
                    data-testid="custom-price-input"
                    onChange={(e) => {
                      setCustomPrice(e.target.value);
                      setPriceChoice("custom");
                    }}
                    onFocus={() => setPriceChoice("custom")}
                    className="w-full min-w-0 bg-transparent font-mono text-2xl tabular-nums text-gold outline-none placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>
                {priceChoice === "custom" && (
                  <span
                    className="absolute right-3 top-3 text-[9px] font-semibold uppercase tracking-wider text-gold"
                    data-testid="price-option-custom-selected"
                  >
                    Selected
                  </span>
                )}
              </div>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground" data-testid="price-choice-hint">
              Tap a price to set the tag price — using{" "}
              <span className="font-semibold text-gold">{gbp(chosenPrice)}</span>
              {priceChoice === "charity" && (
                <span>
                  {" "}· {condition} condition ({Math.round((CONDITION_MULTIPLIERS[condition] ?? 1) * 100)}%)
                </span>
              )}
            </p>

            <button
              type="button"
              role="switch"
              aria-checked={isElectrical}
              data-testid="electrical-toggle"
              onClick={() => setIsElectrical((v) => !v)}
              className={`mt-4 flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-all duration-200 ${
                isElectrical
                  ? "border-gold/60 bg-gold/10"
                  : "border-hairline bg-obsidian/60 hover:border-gold/40"
              }`}
            >
              <span
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors duration-200 ${
                  isElectrical ? "border-gold bg-gold text-gold-ink" : "border-muted-foreground/50"
                }`}
              >
                {isElectrical && <Check className="size-3.5" />}
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">Electrical item</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {isElectrical
                    ? "Flagged as electrical — a PAT test must be passed before its tag can be printed."
                    : "Tick if this is a mains or battery appliance that needs a PAT safety test."}
                </span>
              </span>
            </button>

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {result.rationale} · Confidence: {result.confidence} · Estimates only.
            </p>

            {result.resale_blurb && (
              <div
                className="mt-5 rounded-lg border border-hairline bg-obsidian/60 p-4"
                data-testid="resale-blurb"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-gold">
                    Resale listing draft
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="copy-blurb-button"
                    onClick={copyBlurb}
                  >
                    <Copy className="size-3.5" />
                    Copy
                  </Button>
                </div>
                <p
                  className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground"
                  data-testid="resale-blurb-text"
                >
                  {result.resale_blurb}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground/70">
                  Ready to paste into eBay or Vinted — tweak before listing.
                </p>
              </div>
            )}

            <div className="mt-6 space-y-2">
              <Label htmlFor="category-select" className="text-[10px] uppercase tracking-[0.18em]">
                Category
              </Label>
              <Select
                value={category}
                onValueChange={(v) => {
                  setCategory(v);
                  setSize("");
                }}
              >
                <SelectTrigger id="category-select" className="bg-obsidian" data-testid="appraisal-category-select">
                  <SelectValue>{(v) => v as string}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} data-testid={`appraisal-category-${c}`}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {sizeOpts && (
              <div className="mt-4 space-y-2">
                <Label htmlFor="size-select" className="text-[10px] uppercase tracking-[0.18em]">
                  {sizeOpts.label}
                </Label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger id="size-select" className="bg-obsidian" data-testid="appraisal-size-select">
                    <SelectValue placeholder={`Select ${sizeOpts.label.toLowerCase()}`}>
                      {(v) => v as string}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {sizeOpts.options.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`appraisal-size-${s}`}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <Label htmlFor="location-select" className="text-[10px] uppercase tracking-[0.18em]">
                Shop location
              </Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger id="location-select" className="bg-obsidian" data-testid="appraisal-location-select">
                  <SelectValue>{(v) => v as string}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map((l) => (
                    <SelectItem key={l} value={l} data-testid={`appraisal-location-${l}`}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-6 space-y-2">
              <Label htmlFor="giftaid-ref" className="text-[10px] uppercase tracking-[0.18em]">
                Gift Aid number (optional)
              </Label>
              <Input
                id="giftaid-ref"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                value={giftAidRef}
                onChange={(e) => setGiftAidRef(e.target.value.replace(/\D/g, ""))}
                placeholder="Digits only — e.g. 00123"
                data-testid="giftaid-ref-input"
                className="bg-obsidian font-mono"
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                className="bg-gold text-gold-ink transition-transform duration-200 hover:bg-gold-dim active:scale-[0.99]"
                disabled={save.isPending}
                data-testid="save-inventory-button"
                onClick={handleSaveClick}
              >
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save &amp; make tag
              </Button>
              <Button variant="outline" data-testid="discard-button" onClick={() => setResult(null)}>
                <TagIcon className="size-4" />
                Discard
              </Button>
            </div>

            <Dialog open={showSizeNudge} onOpenChange={(v) => !v && setShowSizeNudge(false)}>
              <DialogContent className="border-hairline bg-charcoal" data-testid="size-nudge-dialog">
                <DialogHeader>
                  <DialogTitle className="display-title text-sm text-gold">Add a size first?</DialogTitle>
                </DialogHeader>
                <p className="text-sm leading-relaxed text-muted-foreground" data-testid="size-nudge-text">
                  This {sizeOpts?.kind === "shoe" ? "pair of shoes has" : "clothing item has"} no size set.
                  Shoppers and staff filter the ledger by size, so it&rsquo;s best to add one before filing it.
                </p>
                <DialogFooter>
                  <Button
                    variant="outline"
                    data-testid="size-nudge-save-anyway"
                    onClick={() => {
                      setShowSizeNudge(false);
                      save.mutate();
                    }}
                  >
                    Save without size
                  </Button>
                  <Button
                    className="bg-gold text-gold-ink hover:bg-gold-dim"
                    data-testid="size-nudge-add"
                    onClick={() => {
                      setShowSizeNudge(false);
                      document.getElementById("size-select")?.focus();
                    }}
                  >
                    <TagIcon className="size-4" />
                    Add a size
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </section>
    </div>
  );
}
