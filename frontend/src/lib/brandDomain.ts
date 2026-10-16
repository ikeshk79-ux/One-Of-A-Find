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

/** Normalise a brand name into something unavatar.io can resolve.
 * Shared by the on-screen `<BrandLogo>` and the PDF generator so printed tags carry the same
 * logo as the preview — mismatches used to be a surprise ("no logo on the print!"). */
export function brandDomain(brand: string): string | null {
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

export function brandLogoUrl(brand: string): string | null {
  const d = brandDomain(brand);
  return d ? `https://unavatar.io/${d}?fallback=false` : null;
}
