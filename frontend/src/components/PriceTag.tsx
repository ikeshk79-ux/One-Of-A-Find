import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import BrandLogo from "@/components/BrandLogo";
import type { InventoryItem } from "@/lib/types";
import { gbp } from "@/lib/types";

/** Supported tag sizes for bulk-print sheets. ISO A-series folds exactly into A4 so a sheet
 * tiles with zero waste: A6=4/page, A7=8/page, A8=16/page. See `tag-sheet-*` CSS in index.css. */
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
  qr: number;
};

const SIZE_SPEC: Record<TagSize, SizeSpec> = {
  // A6 = 105×148mm, 4/sheet — plenty of room, barcode scans trivially.
  A6: {
    w: "105mm",
    h: "148mm",
    pad: "6mm",
    brandFs: "11px",
    titleFs: "16px",
    priceFs: "34px",
    metaFs: "10px",
    logo: 28,
    barcodeHeight: 50,
    barcodeWidth: 2,
    barcodeFontSize: 11,
    qr: 86,
  },
  // A7 = 74×105mm, 8/sheet — the sweet spot: compact but still clearly legible.
  A7: {
    w: "74mm",
    h: "105mm",
    pad: "3.5mm",
    brandFs: "9px",
    titleFs: "11px",
    priceFs: "22px",
    metaFs: "8px",
    logo: 20,
    barcodeHeight: 32,
    barcodeWidth: 1.5,
    barcodeFontSize: 8,
    qr: 56,
  },
  // A8 = 52×74mm, 16/sheet — the default. Barcode shrinks but still scans off a typical phone;
  // the brand lockup is dropped and the layout stacks vertically to maximise the price glyph.
  A8: {
    w: "52mm",
    h: "74mm",
    pad: "2mm",
    brandFs: "7px",
    titleFs: "8.5px",
    priceFs: "17px",
    metaFs: "6.5px",
    logo: 14,
    barcodeHeight: 20,
    barcodeWidth: 1,
    barcodeFontSize: 6,
    qr: 38,
  },
};

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
  const qrRef = useRef<HTMLCanvasElement>(null);
  const spec = size ? SIZE_SPEC[size] : null;

  useEffect(() => {
    if (barcodeRef.current) {
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
    }
    if (qrRef.current) {
      // QR deep-links to the item and carries the gift aid ref so a scan allocates the sale to it.
      const url =
        `${window.location.origin}/tag/${item.id}` +
        (item.giftaid_ref ? `?ga=${encodeURIComponent(item.giftaid_ref)}` : "");
      void QRCode.toCanvas(qrRef.current, url, { width: spec?.qr ?? 104, margin: 0 });
    }
  }, [item.sku, item.id, item.giftaid_ref, spec]);

  // ─── Legacy fixed-width preview (TagPage / on-screen) ────────────────────────
  if (!spec) {
    return (
      <div
        className="print-sheet mx-auto w-[340px] rounded-lg border border-black bg-white p-5 text-black"
        data-testid="price-tag"
      >
        <div className="flex items-start justify-between border-b border-black/20 pb-2">
          <span className="display-title text-[10px]">One Of A Find</span>
          <span className="font-mono text-[10px]">{item.condition}</span>
        </div>
        <div className="mt-3 flex items-start gap-2">
          <BrandLogo brand={item.brand} size={28} testid="tag-brand-logo" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest" data-testid="tag-brand">
              {item.brand}
            </p>
            <h2 className="mt-1 text-lg leading-tight font-bold" data-testid="tag-title">
              {item.title}
            </h2>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-black/60" data-testid="tag-category">
          {item.category}
          {item.size ? ` · Size ${item.size}` : ""}
        </p>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-black/60">Price</p>
            <p className="text-4xl font-bold tabular-nums" data-testid="tag-price">
              {gbp(item.recommended_price)}
            </p>
            <p className="mt-1 text-[10px] text-black/60" data-testid="tag-condition">
              {item.condition} condition
            </p>
          </div>
          <canvas ref={qrRef} data-testid="tag-qr" />
        </div>
        <p className="mt-2 text-[10px] text-black/60">
          RRP when new {gbp(item.peak_retail_price)} · all proceeds to the shop
        </p>
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
  const isTiny = size === "A8";
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
      <div
        className="flex items-start justify-between border-b border-black/20"
        style={{ paddingBottom: "1mm" }}
      >
        <span className="display-title" style={{ fontSize: spec.brandFs }}>
          One Of A Find
        </span>
        <span className="font-mono" style={{ fontSize: spec.metaFs }}>
          {item.condition}
        </span>
      </div>

      {/* Brand + title. On A8 the brand logo is dropped to maximise price glyph space. */}
      <div className="flex items-start" style={{ gap: "1.5mm" }}>
        {!isTiny && <BrandLogo brand={item.brand} size={spec.logo} testid="tag-brand-logo" />}
        <div className="min-w-0 flex-1">
          <p
            className="font-semibold uppercase tracking-widest"
            style={{ fontSize: spec.brandFs }}
            data-testid="tag-brand"
          >
            {item.brand}
          </p>
          <h2
            className="leading-tight font-bold"
            style={{ fontSize: spec.titleFs, marginTop: "0.5mm" }}
            data-testid="tag-title"
          >
            {item.title}
          </h2>
        </div>
      </div>

      <p
        className="text-black/60"
        style={{ fontSize: spec.metaFs }}
        data-testid="tag-category"
      >
        {item.category}
        {item.size ? ` · Size ${item.size}` : ""}
      </p>

      <div className="flex items-end justify-between" style={{ marginTop: "auto" }}>
        <div>
          <p
            className="uppercase tracking-widest text-black/60"
            style={{ fontSize: spec.metaFs }}
          >
            Price
          </p>
          <p
            className="font-bold tabular-nums"
            style={{ fontSize: spec.priceFs, lineHeight: 1 }}
            data-testid="tag-price"
          >
            {gbp(item.recommended_price)}
          </p>
          <p
            className="text-black/60"
            style={{ fontSize: spec.metaFs, marginTop: "0.5mm" }}
            data-testid="tag-condition"
          >
            {item.condition}
          </p>
        </div>
        <canvas ref={qrRef} data-testid="tag-qr" />
      </div>

      {!isTiny && (
        <p className="text-black/60" style={{ fontSize: spec.metaFs }}>
          RRP {gbp(item.peak_retail_price)} · all proceeds to the shop
        </p>
      )}
      {item.giftaid_ref && !isTiny && (
        <p
          className="font-mono text-black/60"
          style={{ fontSize: spec.metaFs }}
          data-testid="tag-giftaid"
        >
          Gift Aid: {item.giftaid_ref}
        </p>
      )}
      <div
        className="flex justify-center border-t border-black/20"
        style={{ paddingTop: "1mm" }}
      >
        <svg ref={barcodeRef} data-testid="tag-barcode" />
      </div>
    </div>
  );
}
