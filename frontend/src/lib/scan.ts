import { apiGet } from "@/lib/api";
import type { InventoryItem } from "@/lib/types";

/** Resolve a scanned barcode/QR payload to an inventory item id.
 *
 * Price tags carry two payloads: the QR encodes a deep link (`https://…/tag/<uuid>?ga=GA-001`)
 * and the barcode encodes the SKU, optionally suffixed `SKU*GIFTAID`. Returns `null` when no
 * item matches the scanned SKU; any other lookup failure is re-thrown for the caller to report.
 */
export async function resolveScannedCode(
  raw: string,
): Promise<{ id: string; title: string } | null> {
  const text = raw.trim();
  if (!text) return null;

  const urlMatch = text.match(/\/tag\/([0-9a-fA-F-]{36})/);
  if (urlMatch) return { id: urlMatch[1], title: "" };

  const sku = text.split("*")[0].trim();
  if (!sku) return null;
  const item = await apiGet<InventoryItem>(`/inventory/lookup?sku=${encodeURIComponent(sku)}`);
  return { id: item.id, title: item.title };
}
