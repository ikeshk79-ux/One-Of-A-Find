import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import BrandLogo from "@/components/BrandLogo";
import type { InventoryItem } from "@/lib/types";
import { gbp } from "@/lib/types";

/** Supported tag sizes for bulk-print sheets. ISO A-series folds exactly into A4 so a sheet
 * tiles with zero waste: A6=4/page, A7=4/page, A8=16/page. See `tag-sheet-*` CSS in index.css. */
export type TagSize = "A6" | "A7" | "A8";

type SizeSpec = {
  /** Printable dimensions in millimetres so the browser prints at true size. */
  w: string;
  h: string;
  pad: string;
  /** Internal typography & artwork knobs per size tier. */
  brandFs: string;
  titleFs: string;
  priceFs: string;
  metaFs: string;
  logo: number;
  barcodeHeight: number;
  barcodeWidth: number;
  barcodeFontSize: number;
  /** `beside` lays sticker next to the price block; `below` stacks it full-width under the price.
   * A6 has room for beside; A7 fits beside with a smaller price glyph; A8 cannot fit a 40mm
   * sticker next to any readable price and must stack. */
  stickerLayout: "beside" | "below";
  /** A8 drops the barcode entirely — the sticker (40×25mm) plus price plus metadata already
   * fills the available 48×70mm inner space. Confirmed with the shop manager. */
  showBarcode: boolean;
};

/** Required sticker-area footprint, in millimetres. Must print at exactly these dimensions at
 * 100% print scale so a pre-cut sticker lines up with the outlined area. */
const STICKER_W_MM = 40;
const STICKER_H_MM = 25;

const SIZE_SPEC: Record<TagSize, SizeSpec> = {
  // A6 = 105×148mm, 4/sheet — plenty of room; sticker fits beside the price with margin to spare.
  A6: {
    w: "105mm",
    h: "148mm",
    pad: "6mm",
    brandFs: "11px",
    titleFs: "16px",
    priceFs: "30px",
    metaFs: "10px",
    logo: 28,
    barcodeHeight: 50,
    barcodeWidth: 2,
    barcodeFontSize: 11,
    stickerLayout: "beside",
    showBarcode: true,
  },
  // A7 = 74×105mm, 4/sheet. Inner width 68mm comfortably fits the condition + price block on
  // the left and the 40×25mm sticker on the right.
  A7: {
    w: "74mm",
    h: "105mm",
    pad: "3.5mm",
    brandFs: "9px",
    titleFs: "11px",
    priceFs: "18px",
    metaFs: "8px",
    logo: 20,
    barcodeHeight: 28,
    barcodeWidth: 1.4,
    barcodeFontSize: 7,
    stickerLayout: "beside",
    showBarcode: true,
  },
  // A8 = 52×74mm, 16/sheet. Not enough width for sticker-beside-price AND no room for the
  // barcode once the 40×25mm sticker takes 25mm of vertical space, so the sticker stacks below
  // the price and the barcode is dropped (approved by the shop manager). Price font kept small
  // so the longest condition ("New without tags") stays on one line in the price block.
  A8: {
    w: "52mm",
    h: "74mm",
    pad: "2mm",
    brandFs: "7px",
    titleFs: "8.5px",
    priceFs: "13px",
    metaFs: "6.5px",
    logo: 14,
    barcodeHeight: 0,
    barcodeWidth: 0,
    barcodeFontSize: 0,
    stickerLayout: "below",
    showBarcode: false,
  },
};

/** Dashed outlined placeholder for the physical sticker. No logo/barcode/text goes inside — this
 * area is reserved for the pre-printed sticker that the volunteer applies after cutting. Rendered
 * with the actual millimetre dimensions so it prints at 100% scale. */
function StickerArea({ testid = "tag-sticker" }: { testid?: string }) {
  return (
    <div
      data-testid={testid}
      style={{
        width: `${STICKER_W_MM}mm`,
        height: `${STICKER_H_MM}mm`,
        border: "0.25mm dashed #6b7280",
        borderRadius: "0.6mm",
        flexShrink: 0,
        boxSizing: "border-box",
      }}
      aria-label={`Sticker area ${STICKER_W_MM}mm by ${STICKER_H_MM}mm`}
    />
  );
}

/** PriceTag. When `size` is omitted it renders the legacy on-screen preview (used by
 * /tag/{id}'s single-item view, where a fixed 340px width keeps the mobile layout stable).
 * When `size` is one of A6/A7/A8 it switches to a true-mm layout so the browser prints the tag
 * at exactly that physical size — this is the layout used on the bulk-print sheet. */
export default function PriceTag({
  item,
  size,
  showCutGuide = false,
}: {
  item: InventoryItem;
  size?: TagSize;
  /** When true, draws a thin solid border so the admin can see tile edges on the printed sheet
   * and cut the sheet apart with scissors or a guillotine. Hidden by default (clean tags). */
  showCutGuide?: boolean;
}) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const spec = size ? SIZE_SPEC[size] : null;

  useEffect(() => {
    if (!barcodeRef.current) return;
    // The legacy single-item preview always draws the barcode; the sized layouts honour the
    // per-size `showBarcode` flag (A8 skips it to free up vertical space for the sticker).
    if (spec && !spec.showBarcode) return;
    // CODE128 (alphanumeric) so the gift aid number rides in the barcode alongside the SKU.
    const barcodeValue = item.giftaid_ref ? `${item.sku}*${item.giftaid_ref}` : item.sku;
    JsBarcode(barcodeRef.current, barcodeValue, {
      format: "CODE128",
      width: spec?.barcodeWidth ?? 2,
      height: spec?.barcodeHeight ?? 54,
      fontSize: spec?.barcodeFontSize ?? 12,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
    });
  }, [item.sku, item.giftaid_ref, spec]);

  // ─── Legacy fixed-width preview (TagPage / on-screen) ────────────────────────
  if (!spec) {
    return (
      <div
        className="print-sheet mx-auto w-[340px] rounded-lg border border-black bg-white p-5 text-black"
        data-testid="price-tag"
      >
        {/* Top band — just the One Of A Find lockup. Condition no longer lives here; it moved
            above the price in the bottom-left price area. */}
        <div className="flex items-start justify-between border-b border-black/20 pb-2">
          <span className="display-title text-[10px]">One Of A Find</span>
        </div>
        <div className="mt-3 flex items-start gap-2">
          <BrandLogo brand={item.brand} size={28} testid="tag-brand-logo" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest" data-testid="tag-brand">
              {item.brand}
            </p>
            {/* Title wraps freely — the printed tag must show the full product description without
                truncation (previously ellipsised with .truncate / line-clamp). */}
            <h2 className="mt-1 text-lg leading-tight font-bold break-words" data-testid="tag-title">
              {item.title}
            </h2>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-black/60" data-testid="tag-category">
          {item.category}
          {item.size ? ` · Size ${item.size}` : ""}
        </p>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Condition sits above the price: a small "CONDITION:" meta label (matching the
                "PRICE" label style) and the value in the same font / weight / size as the price
                figure. Kept on one line so a long value like "New without tags" doesn't wrap. */}
            <p className="text-[10px] uppercase tracking-widest text-black/60">Condition:</p>
            <p
              className="mt-1 text-4xl font-bold whitespace-nowrap"
              data-testid="tag-condition"
            >
              {item.condition}
            </p>
            <p className="mt-2 text-[10px] uppercase tracking-widest text-black/60">Price</p>
            <p className="mt-1 text-4xl font-bold tabular-nums" data-testid="tag-price">
              {gbp(item.recommended_price)}
            </p>
            {item.peak_retail_price > 0 && (
              <p
                className="mt-1 text-lg font-bold tabular-nums"
                data-testid="tag-rrp"
              >
                RRP {gbp(item.peak_retail_price)}
              </p>
            )}
          </div>
          <StickerArea />
        </div>
        <p className="mt-2 text-[10px] text-black/60">All proceeds go to charity</p>
        {item.giftaid_ref && (
          <p className="mt-1 text-[10px] font-mono text-black/60" data-testid="tag-giftaid">
            Gift Aid: {item.giftaid_ref}
          </p>
        )}
        <div className="mt-3 flex justify-center border-t border-black/20 pt-3">
          <svg ref={barcodeRef} data-testid="tag-barcode" />
        </div>
      </div>
    );
  }

  // ─── Sized-for-print layout (A6/A7/A8) ────────────────────────────────────────
  const stickerBeside = spec.stickerLayout === "beside";
  const isTiny = size === "A8";
  // RRP line is drawn at exactly 50% of the price font size, matching the design spec.
  const rrpFs = `calc(${spec.priceFs} / 2)`;

  // Shared left-hand price block (CONDITION label → condition → PRICE label → price → optional
  // RRP). Rendered the same way regardless of whether the sticker sits beside or below the
  // block — the surrounding wrapper handles the arrangement so a single component drives both
  // layouts and never diverges.
  const priceBlock = (
    <div className="min-w-0 flex-1">
      <p
        className="uppercase tracking-widest text-black/60"
        style={{ fontSize: spec.metaFs }}
      >
        Condition:
      </p>
      <p
        className="font-bold whitespace-nowrap"
        style={{ fontSize: spec.priceFs, lineHeight: 1.05, marginTop: "0.4mm" }}
        data-testid="tag-condition"
      >
        {item.condition}
      </p>
      <p
        className="uppercase tracking-widest text-black/60"
        style={{ fontSize: spec.metaFs, marginTop: "0.8mm" }}
      >
        Price
      </p>
      <p
        className="font-bold tabular-nums whitespace-nowrap"
        style={{ fontSize: spec.priceFs, lineHeight: 1.05, marginTop: "0.4mm" }}
        data-testid="tag-price"
      >
        {gbp(item.recommended_price)}
      </p>
      {item.peak_retail_price > 0 && (
        <p
          className="font-bold tabular-nums whitespace-nowrap"
          style={{ fontSize: rrpFs, lineHeight: 1.05, marginTop: "0.4mm" }}
          data-testid="tag-rrp"
        >
          RRP {gbp(item.peak_retail_price)}
        </p>
      )}
    </div>
  );

  return (
    <div
      className="print-sheet bg-white text-black"
      data-testid="price-tag"
      data-tag-size={size}
      style={{
        width: spec.w,
        height: spec.h,
        padding: spec.pad,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "1.5mm",
        // Cutting guide: a thin solid border lets scissors/guillotine follow the tile edge.
        // Without the guide we still show a hairline so the volunteer can trim without a guide
        // sheet, but printers that cut on the fold want 0 border — keep this subtle.
        border: showCutGuide ? "0.4mm dashed #000" : "0.1mm solid #e5e5e5",
      }}
    >
      {/* Top band — One Of A Find lockup only. Condition no longer appears here; it moved into
          the price block below. */}
      <div
        className="flex items-start border-b border-black/20"
        style={{ paddingBottom: "1mm" }}
      >
        <span className="display-title" style={{ fontSize: spec.brandFs }}>
          One Of A Find
        </span>
      </div>

      {/* Brand + title. On A8 the brand logo is dropped to maximise price glyph space.
          Title uses line-clamp as a safety net on tiny A8 tags but is otherwise unclamped so the
          full product description stays legible on A6/A7. */}
      <div className="flex items-start" style={{ gap: "1.5mm" }}>
        {!isTiny && <BrandLogo brand={item.brand} size={spec.logo} testid="tag-brand-logo" />}
        <div className="min-w-0 flex-1">
          <p
            className="font-semibold uppercase tracking-widest break-words"
            style={{ fontSize: spec.brandFs }}
            data-testid="tag-brand"
          >
            {item.brand}
          </p>
          <h2
            className={`leading-tight font-bold break-words ${isTiny ? "line-clamp-2" : ""}`}
            style={{ fontSize: spec.titleFs, marginTop: "0.5mm" }}
            data-testid="tag-title"
          >
            {item.title}
          </h2>
        </div>
      </div>

      <p
        className="text-black/60 break-words"
        style={{ fontSize: spec.metaFs }}
        data-testid="tag-category"
      >
        {item.category}
        {item.size ? ` · Size ${item.size}` : ""}
      </p>

      {/* Price + sticker row. On A6/A7 they sit side-by-side; on A8 the sticker drops to its
          own full-width row below the price so the 40×25mm footprint is preserved. */}
      {stickerBeside ? (
        <div
          className="flex items-end justify-between gap-1"
          style={{ marginTop: "auto" }}
        >
          {priceBlock}
          <StickerArea />
        </div>
      ) : (
        <div className="flex flex-col" style={{ marginTop: "auto", gap: "1mm" }}>
          {priceBlock}
          <div className="self-center">
            <StickerArea />
          </div>
        </div>
      )}

      <p className="text-black/60" style={{ fontSize: spec.metaFs }} data-testid="tag-proceeds">
        All proceeds go to charity
      </p>
      {item.giftaid_ref && !isTiny && (
        <p
          className="font-mono text-black/60"
          style={{ fontSize: spec.metaFs }}
          data-testid="tag-giftaid"
        >
          Gift Aid: {item.giftaid_ref}
        </p>
      )}
      {spec.showBarcode && (
        <div
          className="flex justify-center border-t border-black/20"
          style={{ paddingTop: "1mm" }}
        >
          <svg ref={barcodeRef} data-testid="tag-barcode" />
        </div>
      )}
    </div>
  );
}
