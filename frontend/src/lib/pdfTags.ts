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
  A7: { w: 74,  h: 105, cols: 2, rows: 4, padding: 3, titleFs: 9,  brandFs: 7, priceFs: 20, metaFs: 6, qr: 18, barcodeH: 10, barcodeW: 50 },
  A8: { w: 52,  h: 74,  cols: 4, rows: 4, padding: 2, titleFs: 7,  brandFs: 5.5, priceFs: 15, metaFs: 5, qr: 12, barcodeH: 7,  barcodeW: 36 },
};

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

  // ─── Brand (small caps) + title (bold) ────────────────────────────────────
  let cursor = bandBottom + padding * 0.5 + brandFs * 0.35;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(brandFs);
  pdf.text(fitText(pdf, (item.brand ?? "").toUpperCase(), inner.w), inner.x, cursor);
  cursor += titleFs * 0.5;
  pdf.setFontSize(titleFs);
  pdf.text(fitText(pdf, item.title ?? "", inner.w), inner.x, cursor);

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
    await drawTag(pdf, tiles[i], spec, x, y, showCutGuide);
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
