import { Check, CircleDashed, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// Visual badge for AI confidence (High / Medium / Low). Accepts any string; falls
// back to a neutral style for unknown values.
export default function ConfidenceBadge({
  confidence,
  className,
  testid,
}: {
  confidence: string | null | undefined;
  className?: string;
  testid?: string;
}) {
  const normalized = (confidence ?? "").trim().toLowerCase();
  const config =
    normalized === "high"
      ? {
          label: "High confidence",
          Icon: Check,
          className: "bg-secondary text-secondary-foreground border-secondary",
        }
      : normalized === "medium"
        ? {
            label: "Medium confidence",
            Icon: CircleDashed,
            className: "bg-muted text-foreground border-border",
          }
        : normalized === "low"
          ? {
              label: "Low confidence",
              Icon: Minus,
              className:
                "bg-[color-mix(in_oklab,var(--terracotta)_20%,transparent)] text-[color:var(--terracotta-deep)] border-[color-mix(in_oklab,var(--terracotta)_40%,transparent)]",
            }
          : {
              label: confidence || "Unknown",
              Icon: Minus,
              className: "bg-muted text-muted-foreground border-border",
            };
  const Icon = config.Icon;
  return (
    <span
      data-testid={testid}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        config.className,
        className,
      )}
    >
      <Icon className="size-3" />
      {config.label}
    </span>
  );
}
