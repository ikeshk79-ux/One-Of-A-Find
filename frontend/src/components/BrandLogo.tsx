import { useState } from "react";

// Hand-curated overrides for brands whose domain doesn't match a plain lowercase-strip slug.
// Add here only when the auto slug fails for a brand we see often — e.g. UK high-street names
// with ampersands or non-obvious top-level domains.
const DOMAIN_OVERRIDES: Record<string, string> = {
  "levi's": "levi.com",
  levis: "levi.com",
  "marks & spencer": "marksandspencer.com",
  "m&s": "marksandspencer.com",
  "john lewis": "johnlewis.com",
  "royal doulton": "royaldoulton.com",
  "cath kidston": "cathkidston.com",
  next: "next.co.uk",
  primark: "primark.com",
  tesco: "tesco.com",
  argos: "argos.co.uk",
  "the white company": "thewhitecompany.com",
};

// Normalise a brand name into something Clearbit's logo service can resolve. Clearbit returns
// clean square PNG logos for most well-known brands at https://logo.clearbit.com/{domain}.
function brandDomain(brand: string): string | null {
  const trimmed = brand.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  if (DOMAIN_OVERRIDES[key]) return DOMAIN_OVERRIDES[key];
  if (key === "unbranded" || key === "unknown" || key === "n/a") return null;
  // Strip apostrophes/periods/commas, collapse spaces, keep letters + digits.
  const slug = key
    .replace(/['’".,]/g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (!slug) return null;
  return `${slug}.com`;
}

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
  const domain = brandDomain(brand);
  if (!domain || failed) return null;
  // unavatar.io is a free aggregator that composes brand logos from multiple sources
  // (Google favicons, Twitter, GitHub, DuckDuckGo). No API key required and it covers the
  // tail of UK high-street brands well. Clearbit's public Logo API was decommissioned
  // December 2025 so we never ship against that endpoint. onError hides the <img>
  // gracefully when a brand genuinely has no logo anywhere.
  return (
    <img
      src={`https://unavatar.io/${domain}?fallback=false`}
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
