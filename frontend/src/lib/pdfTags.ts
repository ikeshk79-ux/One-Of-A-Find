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
 * The layout is drawn with jsPDF primitives (text, lines, rect, addImage for the QR+barcode)
 * rather than html2canvas-ing the DOM, so each tag is pixel-perfect at any zoom and the output
 * stays small (vector text + two small PNGs per tile).
 */

import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { brandLogoUrl } from "@/lib/brandDomain";
import type { InventoryItem } from "@/lib/types";
import { gbp } from "@/lib/types";

export type PdfTagSize = "A6" | "A7" | "A8";

/** Physical size + layout knobs per tag size. Dimensions are mm; "cols/rows" is the exact
 * A4-aligned tiling (A6=2×2, A7=2×4, A8=4×4). Font sizes are pt because jsPDF uses pt natively. */
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
  qr: number; // QR edge length, mm
  barcodeH: number; // barcode height, mm
  barcodeW: number; // barcode width in the PDF, mm
};

const SPECS: Record<PdfTagSize, PdfSpec> = {
  A6: { w: 105, h: 148, cols: 2, rows: 2, padding: 5, titleFs: 12, brandFs: 8, priceFs: 28, metaFs: 7, qr: 24, barcodeH: 14, barcodeW: 70 },
  // A7 fits 2 cols × 2 rows (148×210mm) comfortably inside A4 — the ISO fold math (8×A7 per A4)
  // only works when you cut the sheet, which isn't what we do here. 4-up printed uncut is the
  // practical layout; the vertical slack centres the grid on the page.
  A7: { w: 74,  h: 105, cols: 2, rows: 2, padding: 3, titleFs: 9,  brandFs: 7, priceFs: 20, metaFs: 6, qr: 18, barcodeH: 10, barcodeW: 50 },
  A8: { w: 52,  h: 74,  cols: 4, rows: 4, padding: 2, titleFs: 7,  brandFs: 5.5, priceFs: 15, metaFs: 5, qr: 12, barcodeH: 7,  barcodeW: 36 },
};

/** Brand-logo size (mm square) per tag size. A8 drops the logo entirely — there isn't enough
 * width for it alongside the condition text and the barcode would start to collide. */
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

/** Deep-link QR for /tag/{id}, carrying the gift aid ref so a scan allocates the sale. */
async function makeQrPng(itemId: string, giftaidRef: string | null, pixels: number): Promise<string> {
  const url =
    `${window.location.origin}/tag/${itemId}` +
    (giftaidRef ? `?ga=${encodeURIComponent(giftaidRef)}` : "");
  return QRCode.toDataURL(url, { width: pixels, margin: 0 });
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
  const { w, h, padding, titleFs, brandFs, priceFs, metaFs, qr, barcodeH, barcodeW } = spec;
  const inner = { x: x + padding, y: y + padding, w: w - padding * 2, h: h - padding * 2 };

  pdf.setDrawColor(0);
  if (showCutGuide) {
    // Dashed trim lines so the volunteer can cut by hand after printing.
    pdf.setLineDashPattern([0.8, 0.6], 0);
    pdf.setLineWidth(0.2);
    pdf.rect(x, y, w, h);
    pdf.setLineDashPattern([], 0);
  }

  // ─── Top band: brand + condition ──────────────────────────────────────────
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(brandFs);
  pdf.setTextColor(0);
  pdf.text("One Of A Find", inner.x, inner.y + brandFs * 0.35);
  const conditionText = item.condition ?? "";
  const conditionW = pdf.getTextWidth(conditionText);
  pdf.text(conditionText, inner.x + inner.w - conditionW, inner.y + brandFs * 0.35);
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
  // logo's bottom edge so the two never collide. The previous attempt used a running cursor seeded
  // off the brand baseline, which left the title drawn on top of a tall A6 logo.
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
  // Brand baseline sits vertically centred against the logo square, or just below rowTop when
  // there is no logo. brandFs is in pt and jsPDF's baseline is at the glyph bottom, so centring
  // the row by (logoMm/2 + brandFs*0.3) looks visually balanced for Helvetica.
  const brandBaseline = logoDrawn
    ? rowTop + logoMm / 2 + brandFs * 0.3
    : rowTop + brandFs * 0.35;
  pdf.text(
    fitText(pdf, (item.brand ?? "").toUpperCase(), brandDrawW),
    brandDrawX,
    brandBaseline,
  );

  // Title starts strictly below the logo bottom (or below the brand text when no logo). Use the
  // taller of the two so A6/A7 (tall logo) and A8 (short logo + taller brand text) both clear.
  const titleTop = Math.max(
    logoDrawn ? rowTop + logoMm : brandBaseline,
    brandBaseline,
  ) + 1;
  pdf.setFontSize(titleFs);
  const titleBaseline = titleTop + titleFs * 0.4;
  pdf.text(fitText(pdf, item.title ?? "", inner.w), inner.x, titleBaseline);

  let cursor = titleBaseline;

  // Category + size (one line, muted colour).
  cursor += metaFs * 0.6 + 0.4;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(metaFs);
  pdf.setTextColor(90);
  const meta = `${item.category ?? ""}${item.size ? " · Size " + item.size : ""}`;
  pdf.text(fitText(pdf, meta, inner.w), inner.x, cursor);
  pdf.setTextColor(0);

  // ─── Price block (left) + QR (right) ──────────────────────────────────────
  // Pin the price-and-QR row near the lower-middle so the barcode has room at the bottom.
  const barcodeY = y + h - padding - barcodeH;
  const priceRowBottom = barcodeY - 1.5;
  const priceLabelY = priceRowBottom - priceFs * 0.9 - metaFs * 0.5 - 1;
  pdf.setFontSize(metaFs);
  pdf.setTextColor(90);
  pdf.text("PRICE", inner.x, priceLabelY);
  pdf.setTextColor(0);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(priceFs);
  const priceText = gbp(item.recommended_price);
  pdf.text(priceText, inner.x, priceLabelY + priceFs * 0.9);
  // Condition sub-label beneath price (hidden on A8 to free up vertical space).
  if (spec.w >= 74) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(metaFs);
    pdf.setTextColor(90);
    pdf.text(
      `${item.condition ?? ""} condition`,
      inner.x,
      priceLabelY + priceFs * 0.9 + metaFs * 0.6,
    );
    pdf.setTextColor(0);
  }

  // QR to the right of the price block.
  const qrPx = Math.max(96, Math.round(qr * 10));
  const qrPng = await makeQrPng(item.id, item.giftaid_ref ?? null, qrPx);
  const qrX = inner.x + inner.w - qr;
  const qrY = priceLabelY - 0.5;
  pdf.addImage(qrPng, "PNG", qrX, qrY, qr, qr);

  // ─── Barcode row ──────────────────────────────────────────────────────────
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
    // Awaiting inside the loop keeps QR/barcode generation sequential; the volunteer waits a
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
