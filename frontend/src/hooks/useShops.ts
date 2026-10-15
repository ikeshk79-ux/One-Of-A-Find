import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { LOCATIONS } from "@/lib/types";
import type { PricingRules, Shop } from "@/lib/types";

/** Live shop list from the backend. Falls back to the static LOCATIONS tuple on first render
 * so dropdowns never flash empty while the fetch is in flight. */
export function useShops(includeDisabled = false) {
  return useQuery<Shop[]>({
    queryKey: ["shops", { includeDisabled }],
    queryFn: () =>
      apiGet<Shop[]>(`/shops${includeDisabled ? "?include_disabled=1" : ""}`),
    staleTime: 60_000,
  });
}

/** Convenience: active shop names as a string[] for the <Select /> dropdowns, falling back to
 * the hard-coded tuple while the query is loading so the UI never renders an empty picker. */
export function useShopNames(): string[] {
  const q = useShops();
  if (q.data && q.data.length > 0) return q.data.map((s) => s.name);
  return [...LOCATIONS];
}

/** Current pricing rules — any signed-in user may read; master edits. */
export function usePricingRules() {
  return useQuery<PricingRules>({
    queryKey: ["shops", "pricing-rules"],
    queryFn: () => apiGet<PricingRules>("/shops/pricing-rules"),
    staleTime: 60_000,
  });
}
