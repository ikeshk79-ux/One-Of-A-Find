import { useQuery } from "@tanstack/react-query";
import { TrendingDown } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { PriceAdjustmentPreview } from "@/lib/types";
import { gbp } from "@/lib/types";

/** Advisory banner shown beneath the shop-location picker: fetches the zone-adjusted price
 * from GET /shops/preview-adjustment and renders a one-liner the volunteer can sense-check.
 * The canonical computation still happens on the backend when the item is saved. */
export default function ZoneAdjustmentHint({
  location,
  basePrice,
}: {
  location: string | null;
  basePrice: number;
}) {
  const enabled = Boolean(location) && basePrice > 0;
  const q = useQuery<PriceAdjustmentPreview>({
    queryKey: ["shops", "preview-adjustment", location, basePrice],
    enabled,
    queryFn: () =>
      apiGet<PriceAdjustmentPreview>(
        `/shops/preview-adjustment?base_price=${encodeURIComponent(
          String(basePrice),
        )}&shop_name=${encodeURIComponent(location ?? "")}`,
      ),
    staleTime: 30_000,
  });

  if (!enabled || !q.data) return null;
  const { adjustment_percent, zone, adjusted_price, base_price } = q.data;
  if (adjustment_percent === 0) {
    return (
      <p
        className="text-[11px] text-muted-foreground"
        data-testid="zone-adjustment-hint"
      >
        {zone === null
          ? "This shop has no mapped TfL zone — recommended price unchanged."
          : `Zone ${zone} · no adjustment (${gbp(adjusted_price)}).`}
      </p>
    );
  }
  return (
    <p
      className="flex items-center gap-1.5 text-[11px] text-primary"
      data-testid="zone-adjustment-hint"
    >
      <TrendingDown className="size-3" />
      Zone {zone} · {adjustment_percent}% applied — {gbp(base_price)} → {gbp(adjusted_price)}
    </p>
  );
}
