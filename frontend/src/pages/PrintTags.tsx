import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import PriceTag, { type TagSize } from "@/components/PriceTag";
import { apiGet } from "@/lib/api";
import { generateTagsPdf } from "@/lib/pdfTags";
import type { InventoryItem } from "@/lib/types";

/** Per-size layout metadata. The grid tiles into A4 at zero-margin: A6=2×2 (4/sheet),
 * A7=2×2 (4/sheet — the ISO fold math says 8/sheet, but that only works when you cut A4, so
 * printed uncut it tiles as 4), A8=4×4 (16/sheet). Also carries the max copies-per-tag cap so
 * the Print button can't ask for more tiles than one sheet holds. */
const SIZE_META: Record<TagSize, { label: string; perSheet: number; cols: number; cls: string }> = {
  A6: { label: "A6 — 4 per A4 sheet", perSheet: 4, cols: 2, cls: "tag-sheet-a6" },
  A7: { label: "A7 — 4 per A4 sheet", perSheet: 4, cols: 2, cls: "tag-sheet-a7" },
  A8: { label: "A8 — 16 per A4 sheet (default)", perSheet: 16, cols: 4, cls: "tag-sheet-a8" },
};

const TAG_SIZES: TagSize[] = ["A6", "A7", "A8"];

function readSize(v: string | null): TagSize {
  return TAG_SIZES.includes(v as TagSize) ? (v as TagSize) : "A8";
}
function readCopies(v: string | null): number {
  const n = Math.max(1, Math.min(16, Number.parseInt(v ?? "1", 10) || 1));
  return n;
}

export default function PrintTags() {
  const [params, setParams] = useSearchParams();
  const ids = useMemo(
    () =>
      (params.get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [params],
  );

  // Print controls persist in the URL so a reload after the browser's print dialog closes
  // keeps the volunteer's choices. All three default to the safest option.
  const size = readSize(params.get("size"));
  const copies = readCopies(params.get("copies"));
  const guides = params.get("guides") === "1";

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  const { data, isPending, isError } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => apiGet<InventoryItem[]>("/inventory"),
    retry: false,
  });

  const [generating, setGenerating] = useState(false);

  const openPdf = async () => {
    // Mobile browser `window.print()` ignores `@page { margin: 0 }` and applies a system scale
    // factor, so the mm layout gets squished (users saw 4 A8 tags per sheet instead of 16).
    // We hand the user a PDF generated with absolute mm coords instead — the native PDF viewer
    // honours those unconditionally and the printer sees the exact tiling we drew.
    if (printable.length === 0) return;
    setGenerating(true);
    try {
      await generateTagsPdf({
        items: printable,
        size,
        copies,
        showCutGuide: guides,
        filename: `oneofafind-tags-${size}-${Date.now()}.pdf`,
      });
      toast.success("PDF ready — open in your PDF viewer to print");
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      toast.error("Could not generate PDF");
    } finally {
      setGenerating(false);
    }
  };

  const byId = new Map((data ?? []).map((i) => [i.id, i]));
  // Preserve the order the volunteer selected them in.
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((i): i is InventoryItem => Boolean(i));
  // An electrical item that hasn't passed its PAT test can't be tagged — keep it off the sheet.
  const printable = ordered.filter((i) => !(i.is_electrical && !i.pat_passed));
  const skipped = ordered.length - printable.length;

  const meta = SIZE_META[size];
  // Repeat each item `copies` times so the volunteer can print duplicates without re-selecting
  // the same item in inventory first.
  const tiles: Array<{ item: InventoryItem; key: string }> = [];
  printable.forEach((item) => {
    for (let c = 0; c < copies; c++) tiles.push({ item, key: `${item.id}-${c}` });
  });
  const sheetsNeeded = tiles.length === 0 ? 0 : Math.ceil(tiles.length / meta.perSheet);

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Bulk print</p>
          <h1 className="display-title mt-3 text-2xl">Tag sheet</h1>
          <p className="mt-2 text-sm text-muted-foreground" data-testid="print-sheet-summary">
            {tiles.length} tag{tiles.length === 1 ? "" : "s"} on {sheetsNeeded} A4 sheet
            {sheetsNeeded === 1 ? "" : "s"}
            {copies > 1 ? ` (${copies} copies × ${printable.length} item${printable.length === 1 ? "" : "s"})` : ""}
            {skipped > 0 ? ` · ${skipped} skipped (PAT test required)` : ""}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tapping "Open PDF" downloads an A4 PDF — print from your PDF viewer so the tags land at
            true physical size (mobile browser print scales the layout).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/inventory" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="size-4" />
            Back to inventory
          </Link>
          <Button
            className="bg-gold text-gold-ink hover:bg-gold-dim"
            data-testid="print-sheet-button"
            disabled={tiles.length === 0 || generating}
            onClick={openPdf}
          >
            {generating ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            {generating ? "Generating…" : "Open PDF for printing"}
          </Button>
        </div>
      </div>

      {/* Controls: size, copies, guides. Hidden from the printed sheet via no-print. */}
      <div className="no-print mt-6 grid gap-4 rounded-xl border border-border bg-card/40 p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="print-size" className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Tag size
          </Label>
          <Select value={size} onValueChange={(v) => updateParam("size", v)}>
            <SelectTrigger id="print-size" className="h-10" data-testid="print-size-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAG_SIZES.map((s) => (
                <SelectItem key={s} value={s} data-testid={`print-size-option-${s}`}>
                  {SIZE_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="print-copies" className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Copies per item
          </Label>
          <Input
            id="print-copies"
            type="number"
            min={1}
            max={16}
            inputMode="numeric"
            value={copies}
            onChange={(e) => updateParam("copies", e.target.value || "1")}
            className="h-10"
            data-testid="print-copies-input"
          />
          <p className="text-[11px] text-muted-foreground">
            Print the same tag {copies > 1 ? `${copies} times` : "once"} — handy when an item has
            matching accessories.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="print-guides" className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Cutting guides
          </Label>
          <div className="flex h-10 items-center gap-3 rounded-md border border-input bg-background px-3">
            <Switch
              id="print-guides"
              checked={guides}
              onCheckedChange={(v) => updateParam("guides", v ? "1" : "0")}
              data-testid="print-guides-toggle"
            />
            <span className="text-sm text-foreground/80">
              {guides ? "Dashed trim lines on" : "Clean tags (no trim lines)"}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Turn on to see dashed edges to cut along; leave off for a flush, borderless sheet.
          </p>
        </div>
      </div>

      {isPending && (
        <div className="mx-auto mt-10 h-64 w-[340px] rounded-lg bg-charcoal animate-sweep" />
      )}

      {!isPending && (isError || ordered.length === 0) && (
        <p className="no-print mt-10 text-sm text-muted-foreground" data-testid="print-sheet-empty">
          No items selected to print. Pick items from the inventory first.
        </p>
      )}

      {tiles.length > 0 && (
        <div
          className={`print-tags-grid ${meta.cls} mt-10`}
          data-testid="print-tags-grid"
          data-tag-size={size}
          data-tag-cols={meta.cols}
          style={{ gridTemplateColumns: `repeat(${meta.cols}, max-content)` }}
        >
          {tiles.map(({ item, key }) => (
            <PriceTag key={key} item={item} size={size} showCutGuide={guides} />
          ))}
        </div>
      )}
    </div>
  );
}
