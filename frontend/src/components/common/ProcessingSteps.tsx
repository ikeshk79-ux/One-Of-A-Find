import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Simulated 4-step progress shown while POST /api/appraise is in-flight.
// Milestones are time-based (the backend exposes no streaming progress); when the API
// completes, callers unmount this component so step 4 always resolves.
const STEPS = [
  { id: "identify", label: "Identifying item", description: "Reading photo contents" },
  { id: "brand", label: "Checking brand", description: "Matching the label" },
  { id: "price", label: "Comparing prices", description: "Peak RRP + resale averages" },
  { id: "market", label: "Searching market", description: "Finalising the appraisal" },
] as const;

// When each step moves from pending → active → done, in ms since mount.
const MILESTONES = [
  { active: 0, done: 1600 },
  { active: 1600, done: 3600 },
  { active: 3600, done: 6200 },
  { active: 6200, done: Number.POSITIVE_INFINITY }, // step 4 stays active until the API returns
];

export default function ProcessingSteps({
  active,
  testid,
  className,
}: {
  active: boolean;
  testid?: string;
  className?: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      started.current = null;
      setElapsed(0);
      return;
    }
    started.current = performance.now();
    let raf = 0;
    const tick = () => {
      if (started.current == null) return;
      setElapsed(performance.now() - started.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return null;

  const stepStatus = (i: number): "done" | "active" | "pending" => {
    const m = MILESTONES[i];
    if (elapsed >= m.done) return "done";
    if (elapsed >= m.active) return "active";
    return "pending";
  };

  return (
    <div
      data-testid={testid}
      role="status"
      aria-live="polite"
      className={cn(
        "card-elevated animate-rise rounded-2xl p-5 sm:p-6",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="display-title text-[10px] text-muted-foreground">In progress</p>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {(elapsed / 1000).toFixed(1)}s
        </span>
      </div>
      <ol className="space-y-3" data-testid={testid ? `${testid}-list` : undefined}>
        {STEPS.map((step, i) => {
          const status = stepStatus(i);
          return (
            <li
              key={step.id}
              data-testid={testid ? `${testid}-step-${step.id}` : undefined}
              data-status={status}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 transition-all duration-300",
                status === "done" && "border-primary/40 bg-primary/8",
                status === "active" && "border-primary bg-primary/5 shadow-sm",
                status === "pending" && "border-border bg-card/60",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full transition-colors",
                  status === "done"
                    ? "bg-primary text-primary-foreground"
                    : status === "active"
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {status === "done" ? (
                  <Check className="size-4" />
                ) : status === "active" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <span className="size-2 rounded-full bg-current" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-semibold transition-colors",
                    status === "pending" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {status === "done" ? "✓ " : status === "active" ? "" : "○ "}
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
              {status === "active" && (
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Working…
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p
        className="mt-4 text-center text-[11px] text-muted-foreground"
        data-testid={testid ? `${testid}-footer` : undefined}
      >
        Our AI usually takes 5–15 seconds. Hold tight.
      </p>
    </div>
  );
}
