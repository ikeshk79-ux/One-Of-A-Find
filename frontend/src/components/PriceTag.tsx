import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import BrandLogo from "@/components/BrandLogo";
import type { InventoryItem } from "@/lib/types";
import { gbp } from "@/lib/types";

export default function PriceTag({ item }: { item: InventoryItem }) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (barcodeRef.current) {
      // CODE128 (alphanumeric) so the gift aid number rides in the barcode alongside the SKU.
      const barcodeValue = item.giftaid_ref ? `${item.sku}*${item.giftaid_ref}` : item.sku;
      JsBarcode(barcodeRef.current, barcodeValue, {
        format: "CODE128",
        width: 2,
        height: 54,
        fontSize: 12,
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
      void QRCode.toCanvas(qrRef.current, url, { width: 104, margin: 0 });
    }
  }, [item.sku, item.id, item.giftaid_ref]);

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
