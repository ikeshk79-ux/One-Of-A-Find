import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Expandable "Why this estimate?" surface. Shows what the appraisal API actually returned
// (rationale, confidence, condition, price-source) — never fabricates external sources.
export default function WhyThisEstimate({
  rationale,
  confidence,
  condition,
  priceSource,
  defaultOpen = false,
  testid,
  className,
}: {
  rationale: string;
  confidence: string;
  condition: string;
  priceSource: string;
  defaultOpen?: boolean;
  testid?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const priceSourceLabel =
    priceSource === "peak"
      ? "The volunteer chose the peak RRP"
      : priceSource === "custom"
        ? "The volunteer set a bespoke price"
        : "Derived from peak RRP × condition multiplier, rounded to 50 p";

  return (
    <section
      data-testid={testid}
      className={cn(
        "card-elevated overflow-hidden rounded-2xl",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={testid ? `${testid}-toggle` : undefined}
        className="flex w-full touch-target items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
          <Sparkles className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            Why this estimate?
          </span>
          <span className="block text-xs text-muted-foreground">
            See what the appraisal is based on
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          className="animate-rise space-y-4 border-t border-border px-4 pb-5 pt-4"
          data-testid={testid ? `${testid}-content` : undefined}
        >
          <dl className="grid gap-3 sm:grid-cols-2" aria-label="Appraisal evidence">
            <EvidenceRow label="Confidence" value={confidence || "Unknown"} />
            <EvidenceRow label="Condition grade" value={condition || "Unknown"} />
            <EvidenceRow
              label="Price basis"
              value={priceSourceLabel}
              className="sm:col-span-2"
            />
            <EvidenceRow
              label="AI rationale"
              value={rationale || "No rationale returned."}
              className="sm:col-span-2"
              body
            />
          </dl>
          <p
            className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground"
            data-testid={testid ? `${testid}-honesty` : undefined}
          >
            This estimate is based on Gemini's analysis of your photos. No external market URLs
            are returned by this appraisal — treat the figures as an informed estimate, not a
            guaranteed sale price.
          </p>
        </div>
      )}
    </section>
  );
}

function EvidenceRow({
  label,
  value,
  className,
  body,
}: {
  label: string;
  value: string;
  className?: string;
  body?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-3", className)}>
      <dt className="display-title text-[10px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-foreground",
          body ? "text-xs leading-relaxed" : "text-sm font-semibold",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
