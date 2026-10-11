import { Camera, Heart, PartyPopper, Printer, Receipt, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfidenceBadge from "@/components/common/ConfidenceBadge";
import { gbp } from "@/lib/types";
import type { InventoryItem } from "@/lib/types";

// Discovery / success moment shown after `POST /inventory` succeeds. Keeps the user on the
// capture page instead of auto-navigating, so they can print a tag or scan another item.
export default function SuccessMoment({
  item,
  onPrintTag,
  onScanAnother,
  onViewFinds,
  testid,
}: {
  item: InventoryItem;
  onPrintTag: () => void;
  onScanAnother: () => void;
  onViewFinds: () => void;
  testid?: string;
}) {
  return (
    <section
      data-testid={testid ?? "success-moment"}
      className="relative mx-auto animate-rise space-y-6 overflow-hidden rounded-3xl border border-primary/20 bg-primary p-6 text-primary-foreground sm:p-10"
    >
      {/* Decorative glow */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-primary-foreground/10 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -bottom-20 size-72 rounded-full bg-[color-mix(in_oklab,var(--terracotta)_30%,transparent)] blur-3xl"
      />

      <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary-foreground/15 ring-1 ring-primary-foreground/20 animate-heart"
          aria-hidden="true"
        >
          <PartyPopper className="size-7" />
        </span>
        <div>
          <p className="display-title text-[10px] text-primary-foreground/70">Saved to Finds</p>
          <h2
            className="heading-title mt-1 text-3xl sm:text-4xl"
            data-testid="success-moment-title"
          >
            You found a good one!
          </h2>
          <p className="mt-2 max-w-prose text-sm text-primary-foreground/85">
            Nice work — it's in the ledger now. Here's a snapshot of what you just appraised.
          </p>
        </div>
      </div>

      <div className="relative grid gap-4 sm:grid-cols-[200px_1fr]">
        <div className="relative overflow-hidden rounded-2xl bg-primary-foreground/10 ring-1 ring-primary-foreground/15 sm:aspect-3/4">
          {item.item_image ? (
            <img
              src={item.item_image}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <div className="grid h-48 place-items-center text-primary-foreground/50 sm:h-full">
              <Camera className="size-10" />
            </div>
          )}
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl bg-primary-foreground/10 p-4 ring-1 ring-primary-foreground/15">
            <p
              className="display-title text-[10px] text-primary-foreground/70"
              data-testid="success-moment-value-label"
            >
              Estimated value
            </p>
            <p
              className="heading-title mt-1 text-4xl font-extrabold tabular-nums"
              data-testid="success-moment-value"
            >
              {gbp(item.recommended_price)}
            </p>
            <p className="mt-1 text-xs text-primary-foreground/75">
              {item.title} · {item.brand}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-primary-foreground/85">
            <ConfidenceBadge confidence={item.confidence} testid="success-moment-confidence" />
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-foreground/10 px-2.5 py-1 ring-1 ring-primary-foreground/15">
              <Sparkles className="size-3" />
              {item.condition} condition
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-foreground/10 px-2.5 py-1 font-mono tabular-nums ring-1 ring-primary-foreground/15">
              SKU {item.sku}
            </span>
          </div>
          <p className="rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-3 text-[11px] leading-relaxed text-primary-foreground/75">
            Price is a Gemini-based estimate — not a guaranteed sale value. Fees, condition and
            selling time will affect any resale income.
          </p>
        </div>
      </div>

      <div className="relative flex flex-wrap gap-3">
        <Button
          onClick={onPrintTag}
          data-testid="success-moment-print"
          className="touch-target bg-primary-foreground text-primary hover:bg-primary-foreground/90"
        >
          <Printer className="size-4" />
          Print price tag
        </Button>
        <Button
          variant="outline"
          onClick={onScanAnother}
          data-testid="success-moment-scan-another"
          className="touch-target border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
        >
          <Camera className="size-4" />
          Scan another item
        </Button>
        <Button
          variant="ghost"
          onClick={onViewFinds}
          data-testid="success-moment-view-finds"
          className="touch-target text-primary-foreground hover:bg-primary-foreground/10"
        >
          <Heart className="size-4" />
          View my Finds
        </Button>
      </div>

      <p className="relative inline-flex items-center gap-2 text-[11px] text-primary-foreground/75">
        <Receipt className="size-3" />
        Price tag includes the SKU, QR code and condition — ready for the till.
      </p>
    </section>
  );
}
