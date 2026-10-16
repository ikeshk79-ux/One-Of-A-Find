import { useState } from "react";
import { brandLogoUrl } from "@/lib/brandDomain";

export default function BrandLogo({
  brand,
  size = 28,
  className,
  testid,
}: {
  brand: string;
  size?: number;
  className?: string;
  testid?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = brandLogoUrl(brand);
  if (!url || failed) return null;
  // unavatar.io is a free aggregator that composes brand logos from multiple sources
  // (Google favicons, Twitter, GitHub, DuckDuckGo). No API key required and it covers the
  // tail of UK high-street brands well. Clearbit's public Logo API was decommissioned
  // December 2025 so we never ship against that endpoint. onError hides the <img>
  // gracefully when a brand genuinely has no logo anywhere.
  return (
    <img
      src={url}
      alt={`${brand} logo`}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      data-testid={testid ?? "brand-logo"}
      className={className ?? "size-7 shrink-0 rounded-md object-contain"}
      style={{ width: size, height: size }}
    />
  );
}
