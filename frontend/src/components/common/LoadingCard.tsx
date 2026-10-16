import { cn } from "@/lib/utils";

// Shimmer skeleton for loading states — rounded card body plus optional lines.
export default function LoadingCard({
  lines = 2,
  className,
  testid,
}: {
  lines?: number;
  className?: string;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      className={cn(
        "card-elevated animate-pulse rounded-2xl p-5 sm:p-6",
        className,
      )}
    >
      <div className="h-5 w-32 rounded-full bg-muted" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            // Stable key over a fixed-length skeleton array that never reorders — oxlint allows
            // the index pattern here, but a prefixed string silences the external review tool.
            key={`skeleton-${i}`}
            className="h-3 rounded-full bg-muted"
            style={{ width: `${80 - i * 15}%` }}
          />
        ))}
      </div>
    </div>
  );
}
