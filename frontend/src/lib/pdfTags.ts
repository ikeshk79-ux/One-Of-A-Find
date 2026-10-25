/**
 * Client-side PDF generation for the bulk-print tags sheet.
 *
 * Why not `window.print()`?
 *   Mobile browser print paths (Android Chrome, iOS Safari) ignore `@page { size: A4; margin: 0 }`
 *   and apply a system-enforced minimum margin plus a "fit to page" scale factor, so a 210mm
 *   layout gets squished to ~190mm and tiles no longer land at their true physical size (users
 *   saw A8 render at ~A6 size, 4 per page instead of 16). jsPDF emits a PDF with absolute mm
 *   coordinates — the mobile PDF viewer honours those unconditionally, and the printer sees
 *   exactly the layout we drew.
 *
 * The layout is drawn with jsPDF primitives (text, lines, rect, addImage for the barcode) rather
 * than html2canvas-ing the DOM, so each tag is pixel-perfect at any zoom and the output stays
 * small (vector text + one small PNG per tile). A dashed outlined rectangle marks where the
 * physical sticker is applied — no QR code is drawn on any tag.
 */

import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import { brandLogoUrl } from "@/lib/brandDomain";
import type { InventoryItem } from "@/lib/types";
import { gbp } from "@/lib/types";

export type PdfTagSize = "A6" | "A7" | "A8";

/** Physical size + layout knobs per tag size. Dimensions are mm; "cols/rows" is the practical
 * printed tiling on an A4 sheet (A6=2×2, A7=2×2, A8=4×4). Font sizes are pt because jsPDF uses pt
 * natively. `stickerLayout` places the 40×25mm sticker area either beside the price (A6/A7) or
 * stacked below it (A8, which has no horizontal room). `showBarcode` is false on A8 only — the
 * sticker consumes the vertical space the barcode used to occupy. */
type PdfSpec = {
  w: number; // tag width mm
  h: number; // tag height mm
  cols: number;
  rows: number;
  padding: number; // internal margin inside each tag, mm
  titleFs: number; // pt
  brandFs: number;
  priceFs: number;
  metaFs: number;
  barcodeH: number; // barcode height, mm
  barcodeW: number; // barcode width in the PDF, mm
  stickerLayout: "beside" | "below";
  showBarcode: boolean;
};

/** Required sticker-area footprint in millimetres — must print at exactly these dimensions at
 * 100% scale so a pre-cut adhesive sticker lines up with the outlined area on the printed tag. */
const STICKER_W_MM = 40;
const STICKER_H_MM = 25;

const SPECS: Record<PdfTagSize, PdfSpec> = {
  A6: { w: 105, h: 148, cols: 2, rows: 2, padding: 5, titleFs: 12, brandFs: 8, priceFs: 24, metaFs: 7, barcodeH: 14, barcodeW: 70, stickerLayout: "beside", showBarcode: true },
  // A7 fits 2 cols × 2 rows (148×210mm) comfortably inside A4. Inner width 68mm — the condition
  // (same font as price) and price glyph both share this space with the 40×25mm sticker to the
  // right, so the price font is sized so the longest condition string ("New without tags") stays
  // on one line without crowding the sticker.
  A7: { w: 74,  h: 105, cols: 2, rows: 2, padding: 3, titleFs: 9,  brandFs: 7, priceFs: 13, metaFs: 6, barcodeH: 9,  barcodeW: 50, stickerLayout: "beside", showBarcode: true },
  // A8 inner is 48×70mm. The 40mm sticker can't sit beside any readable price, so it stacks
  // below the price and the barcode is dropped — approved by the shop manager so the sticker
  // footprint can be preserved.
  A8: { w: 52,  h: 74,  cols: 4, rows: 4, padding: 2, titleFs: 7,  brandFs: 5.5, priceFs: 11, metaFs: 5, barcodeH: 0, barcodeW: 0, stickerLayout: "below", showBarcode: false },
};

/** Brand-logo size (mm square) per tag size. A8 drops the logo entirely — there isn't enough
 * width for it alongside the condition text once the sticker row claims the bottom half. */
const LOGO_MM: Record<PdfTagSize, number> = { A6: 10, A7: 7, A8: 5 };

/** Fetch unavatar.io's logo PNG for a brand, data-url it so it can be embedded. Null when the
 * brand has no logo, is on the "unbranded" allowlist, the service returns a 404/CORS error, or
 * the image fails to decode. The result is memoised for the lifetime of the page so a 16-tile
 * A8 sheet makes at most one network request per brand.
 *
 * unavatar.io occasionally returns a Windows .ico body with a mislabelled `content-type: image/png`
 * header (observed in production for well-known brands). jsPDF.addImage(…, "PNG", …) throws on a
 * bad PNG signature, which would otherwise kill the entire print job. We validate the PNG magic
 * number (89 50 4E 47 0D 0A 1A 0A) up front and treat anything else as "no logo". */
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const LOGO_CACHE = new Map<string, string | null>();
async function fetchBrandLogo(brand: string): Promise<string | null> {
  const url = brandLogoUrl(brand);
  if (!url) return null;
  if (LOGO_CACHE.has(url)) return LOGO_CACHE.get(url) ?? null;
  try {
    // unavatar.io returns a 404 (as HTML) when `?fallback=false` and no logo exists — bail then
    // so we don't embed garbage. The service does send permissive CORS headers so fetch works.
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) {
      LOGO_CACHE.set(url, null);
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    // Reject anything that isn't a real PNG. ICO files (00 00 01 00…), SVGs (<?xml / <svg), and
    // HTML error pages all fail this check and silently skip the logo.
    const isPng =
      buf.length >= 8 && PNG_MAGIC.every((b, i) => buf[i] === b);
    if (!isPng) {
      LOGO_CACHE.set(url, null);
      return null;
    }
    const blob = new Blob([buf], { type: "image/png" });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    LOGO_CACHE.set(url, dataUrl);
    return dataUrl;
  } catch {
    LOGO_CACHE.set(url, null);
    return null;
  }
}

/** A4 is 210×297mm. Both tilings fit without any sheet margin (A8: 4×52=208, 4×74=296). */
const PAGE_W = 210;
const PAGE_H = 297;

/** Convert an SVG string to a PNG data URL by rendering it on an offscreen canvas. */
async function svgToPng(svg: string, widthPx: number, heightPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = widthPx;
      canvas.height = heightPx;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas 2D unsupported"));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, widthPx, heightPx);
      ctx.drawImage(img, 0, 0, widthPx, heightPx);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Render a CODE128 barcode (SKU + optional Gift Aid ref) at a fixed pixel size, return PNG. */
async function makeBarcodePng(sku: string, giftaidRef: string | null, widthPx: number, heightPx: number): Promise<string> {
  const value = giftaidRef ? `${sku}*${giftaidRef}` : sku;
  // JsBarcode writes into a detached SVG — we don't need to append it to the DOM.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, {
    format: "CODE128",
    width: 1.2,
    height: 40,
    fontSize: 10,
    margin: 0,
    background: "#ffffff",
    lineColor: "#000000",
    displayValue: true,
  });
  return svgToPng(new XMLSerializer().serializeToString(svg), widthPx, heightPx);
}

/** Truncate `text` to the longest prefix that fits in `maxMm` at the current font size. */
function fitText(pdf: jsPDF, text: string, maxMm: number): string {
  if (pdf.getTextWidth(text) <= maxMm) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const candidate = text.slice(0, mid) + "…";
    if (pdf.getTextWidth(candidate) <= maxMm) lo = mid + 1;
    else hi = mid;
  }
  return text.slice(0, Math.max(0, lo - 1)) + "…";
}

/** Draw a dashed-outline rectangle marking the physical sticker area (no content inside). */
function drawStickerArea(pdf: jsPDF, x: number, y: number, w: number, h: number) {
  pdf.setLineWidth(0.2);
  pdf.setDrawColor(120);
  pdf.setLineDashPattern([0.8, 0.6], 0);
  pdf.roundedRect(x, y, w, h, 0.6, 0.6);
  pdf.setLineDashPattern([], 0);
  pdf.setDrawColor(0);
}

/** Draw one tag box onto the pdf at (x, y). All measurements are mm. */
async function drawTag(
  pdf: jsPDF,
  item: InventoryItem,
  size: PdfTagSize,
  spec: PdfSpec,
  x: number,
  y: number,
  showCutGuide: boolean,
) {
  const { w, h, padding, titleFs, brandFs, priceFs, metaFs, barcodeH, barcodeW } = spec;
  const inner = { x: x + padding, y: y + padding, w: w - padding * 2, h: h - padding * 2 };
  // Convert pt → mm the way jsPDF does when it draws a glyph (approx — 1pt ≈ 0.3528mm; the
  // 0.9 factor accounts for Helvetica's cap-height-to-point ratio and matches the gap the DOM
  // preview renders).
  const ptToMm = (pt: number) => pt * 0.353 * 0.9;
  const rrpFs = priceFs / 2;

  pdf.setDrawColor(0);
  if (showCutGuide) {
    // Dashed trim lines so the volunteer can cut by hand after printing.
    pdf.setLineDashPattern([0.8, 0.6], 0);
    pdf.setLineWidth(0.2);
    pdf.rect(x, y, w, h);
    pdf.setLineDashPattern([], 0);
  }

  // ─── Top band: brand lockup only (condition moved to the price block below) ──
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(brandFs);
  pdf.setTextColor(0);
  pdf.text("One Of A Find", inner.x, inner.y + brandFs * 0.35);
  const bandBottom = inner.y + brandFs * 0.5 + 1;
  pdf.setLineWidth(0.1);
  pdf.setDrawColor(180);
  pdf.line(inner.x, bandBottom, inner.x + inner.w, bandBottom);
  pdf.setDrawColor(0);

  // ─── Brand logo + brand name + title ──────────────────────────────────────
  // Fetch the logo first so the row below can shift text right by its width. If the brand has
  // no logo (unbranded / 404), logoDataUrl is null and the text simply fills the full row.
  const logoDataUrl = await fetchBrandLogo(item.brand ?? "");
  const logoMm = LOGO_MM[size];
  const hasLogo = Boolean(logoDataUrl);
  const brandTextX = hasLogo ? inner.x + logoMm + 1.5 : inner.x;
  const brandTextW = inner.w - (hasLogo ? logoMm + 1.5 : 0);

  // Lay out the brand row anchored to a known top edge (rowTop), then place the title BELOW the
  // logo's bottom edge so the two never collide.
  const rowTop = bandBottom + padding * 0.5;
  let logoDrawn = false;
  if (hasLogo && logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, "PNG", inner.x, rowTop, logoMm, logoMm);
      logoDrawn = true;
    } catch {
      // A corrupt PNG the magic-number check didn't catch (e.g. truncated download) must not
      // kill the whole print job — silently fall back to text-only for this tile.
      logoDrawn = false;
    }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(brandFs);
  const brandDrawX = logoDrawn ? brandTextX : inner.x;
  const brandDrawW = logoDrawn ? brandTextW : inner.w;
  const brandBaseline = logoDrawn
    ? rowTop + logoMm / 2 + brandFs * 0.3
    : rowTop + brandFs * 0.35;
  pdf.text(
    fitText(pdf, (item.brand ?? "").toUpperCase(), brandDrawW),
    brandDrawX,
    brandBaseline,
  );

  // Title wraps to multiple lines so the full product description stays legible — ellipsising
  // a long title is the "unnecessary truncation" the design brief explicitly calls out. We cap
  // to a per-size max line count so the title never pushes the price/sticker block down.
  const titleTop = Math.max(
    logoDrawn ? rowTop + logoMm : brandBaseline,
    brandBaseline,
  ) + 1;
  pdf.setFontSize(titleFs);
  const titleLineHeightMm = titleFs * 0.42;
  const titleMaxLines = size === "A8" ? 2 : 3;
  const titleLines = pdf
    .splitTextToSize(item.title ?? "", inner.w)
    .slice(0, titleMaxLines);
  // If the title overflows the max line count, append an ellipsis on the final line so the
  // reader knows there's more without the previous full-string ellipsis trimming words mid-way.
  const originalLines = pdf.splitTextToSize(item.title ?? "", inner.w);
  if (originalLines.length > titleMaxLines && titleLines.length > 0) {
    const last = titleLines[titleLines.length - 1];
    titleLines[titleLines.length - 1] = fitText(pdf, `${last}…`, inner.w);
  }
  titleLines.forEach((line: string, i: number) => {
    pdf.text(line, inner.x, titleTop + titleFs * 0.4 + i * titleLineHeightMm);
  });

  let cursor = titleTop + titleFs * 0.4 + (titleLines.length - 1) * titleLineHeightMm;

  // Category + size (one line, muted colour). Allowed to wrap over 2 lines on roomier sizes so a
  // long category like "Women's jackets/coats · Size UK 8 · S · EU 36" is not cut off.
  cursor += metaFs * 0.6 + 0.4;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(metaFs);
  pdf.setTextColor(90);
  const meta = `${item.category ?? ""}${item.size ? " · Size " + item.size : ""}`;
  const metaMaxLines = size === "A8" ? 1 : 2;
  const metaLines = pdf.splitTextToSize(meta, inner.w).slice(0, metaMaxLines);
  metaLines.forEach((line: string, i: number) => {
    pdf.text(line, inner.x, cursor + i * metaFs * 0.55);
  });
  pdf.setTextColor(0);

  // ─── Price block + sticker area ───────────────────────────────────────────
  // Shared math for the price block height (CONDITION label → condition → PRICE label → price
  // → optional RRP), so both the beside and below layouts can position themselves without
  // pushing the barcode row down.
  const priceLineGapMm = 0.4;
  const labelGapMm = 0.8;
  const hasRrp = (item.peak_retail_price ?? 0) > 0;
  // Pre-compute block height: 2 meta labels + condition + price + optional RRP, with a slightly
  // larger gap before each new section label.
  const priceBlockH =
    ptToMm(metaFs) +
    priceLineGapMm + ptToMm(priceFs) +
    labelGapMm + ptToMm(metaFs) +
    priceLineGapMm + ptToMm(priceFs) +
    (hasRrp ? priceLineGapMm + ptToMm(rrpFs) : 0);
  const drawPriceBlock = (originX: number, blockTop: number) => {
    let y = blockTop + ptToMm(metaFs);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(metaFs);
    pdf.setTextColor(90);
    pdf.text("CONDITION:", originX, y);
    pdf.setTextColor(0);
    y += priceLineGapMm + ptToMm(priceFs);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(priceFs);
    pdf.text(item.condition ?? "", originX, y);
    y += labelGapMm + ptToMm(metaFs);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(metaFs);
    pdf.setTextColor(90);
    pdf.text("PRICE", originX, y);
    pdf.setTextColor(0);
    y += priceLineGapMm + ptToMm(priceFs);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(priceFs);
    pdf.text(gbp(item.recommended_price), originX, y);
    if (hasRrp) {
      y += priceLineGapMm + ptToMm(rrpFs);
      pdf.setFontSize(rrpFs);
      pdf.text(`RRP ${gbp(item.peak_retail_price)}`, originX, y);
    }
  };

  // Position the price-block + sticker row so the proceeds + barcode land at the fixed bottom.
  const proceedsLineY = y + h - padding - (spec.showBarcode ? barcodeH + metaFs * 0.6 + 0.8 : metaFs * 0.6 + 0.8);
  const barcodeY = spec.showBarcode ? y + h - padding - barcodeH : 0;

  if (spec.stickerLayout === "beside") {
    // Bottom-align the price block to the baseline of the sticker/proceeds row.
    const blockBottom = proceedsLineY - 1;
    const blockTop = blockBottom - priceBlockH;
    drawPriceBlock(inner.x, blockTop);
    // Sticker vertically centred against the price block so the row reads as a single band.
    const stickerX = inner.x + inner.w - STICKER_W_MM;
    const stickerY = blockBottom - STICKER_H_MM;
    drawStickerArea(pdf, stickerX, stickerY, STICKER_W_MM, STICKER_H_MM);
  } else {
    // A8 stacked layout: price block, then sticker centred below it.
    const stickerY = proceedsLineY - STICKER_H_MM - 0.5;
    const blockBottom = stickerY - 1;
    const blockTop = blockBottom - priceBlockH;
    drawPriceBlock(inner.x, blockTop);
    const stickerX = inner.x + (inner.w - STICKER_W_MM) / 2;
    drawStickerArea(pdf, stickerX, stickerY, STICKER_W_MM, STICKER_H_MM);
  }

  // Proceeds line — RRP moved to its own row under the price, so this line is just the
  // charitable-use statement now.
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(metaFs);
  pdf.setTextColor(90);
  pdf.text(fitText(pdf, "All proceeds go to charity", inner.w), inner.x, proceedsLineY);
  pdf.setTextColor(0);

  // ─── Barcode row (A6/A7 only) ─────────────────────────────────────────────
  if (spec.showBarcode) {
    pdf.setDrawColor(180);
    pdf.line(inner.x, barcodeY - 0.6, inner.x + inner.w, barcodeY - 0.6);
    pdf.setDrawColor(0);
    const bcW = Math.min(barcodeW, inner.w);
    const bcX = inner.x + (inner.w - bcW) / 2;
    const barcodePx = Math.round(bcW * 10);
    const barcodePxH = Math.round(barcodeH * 10);
    const barcodePng = await makeBarcodePng(
      item.sku,
      item.giftaid_ref ?? null,
      barcodePx,
      barcodePxH,
    );
    pdf.addImage(barcodePng, "PNG", bcX, barcodeY, bcW, barcodeH);
  }
}

/** Build and open/download the PDF. Returns the generated Blob for tests. */
export async function generateTagsPdf({
  items,
  size,
  copies,
  showCutGuide,
  filename = "oneofafind-tags.pdf",
}: {
  items: InventoryItem[];
  size: PdfTagSize;
  copies: number;
  showCutGuide: boolean;
  filename?: string;
}): Promise<Blob> {
  const spec = SPECS[size];
  const perSheet = spec.cols * spec.rows;
  // Explode the copies-per-item into a flat tile list that we walk row-by-row.
  const tiles: InventoryItem[] = [];
  items.forEach((item) => {
    for (let c = 0; c < copies; c++) tiles.push(item);
  });

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  // The grid pins to the top-left of the page with zero outer margin, so (col*w, row*h) is the
  // exact tile origin on every size. Centering within the page is left to the user (A8 leaves
  // 2mm on the right and 1mm on the bottom — well within printer tolerance).
  const originX = (PAGE_W - spec.cols * spec.w) / 2;
  const originY = (PAGE_H - spec.rows * spec.h) / 2;

  for (let i = 0; i < tiles.length; i++) {
    const slot = i % perSheet;
    if (i > 0 && slot === 0) pdf.addPage("a4", "portrait");
    const col = slot % spec.cols;
    const row = Math.floor(slot / spec.cols);
    const x = originX + col * spec.w;
    const y = originY + row * spec.h;
    // Awaiting inside the loop keeps barcode generation sequential; the volunteer waits a
    // second or two for 16 tiles — not worth the complexity of a parallel Promise.all here.
    // eslint-disable-next-line no-await-in-loop
    await drawTag(pdf, tiles[i], size, spec, x, y, showCutGuide);
  }

  const blob = pdf.output("blob");
  // Open in a new tab so the user can preview + print from their native PDF viewer, which honours
  // our mm sizing unconditionally. Falls back to a download if popups are blocked (common on iOS).
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, "_blank");
  if (!popup) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  // Revoke after a short delay so the opened tab has time to load the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return blob;
}
