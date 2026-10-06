import { useEffect, useRef } from "react";
import { Camera, Lightbulb, Maximize2, Sparkles } from "lucide-react";
import Appraise from "@/pages/Appraise";
import { cn } from "@/lib/utils";

// The Scan screen is the "capture studio" — a themed forest-green hero sits above the
// existing Appraise capture + valuation flow. All the camera / API / state logic lives
// inside Appraise; this file is pure chrome.
export default function Scan() {
  const captureRef = useRef<HTMLDivElement>(null);
  // Smoothly scroll the capture section into view after the hero is mounted so the user
  // sees the full studio layout — but only once, and only when they didn't deep-link mid-flow.
  useEffect(() => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    // No scroll on load — the hero should remain the first thing seen. The "Open camera"
    // button inside Appraise is what the user taps; the scroll CTA below handles it manually.
  }, []);

  const jumpToCapture = () => {
    captureRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="animate-rise space-y-8 pb-6">
      {/* Hero — themed capture studio */}
      <section
        className="relative overflow-hidden rounded-3xl border border-primary/20 bg-primary text-primary-foreground"
        data-testid="scan-hero"
      >
        {/* Decorative gradients */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-primary-foreground/8 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -bottom-16 size-72 rounded-full bg-[color-mix(in_oklab,var(--terracotta)_30%,transparent)] blur-3xl"
        />
        <div className="relative grid gap-6 p-6 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
          <div className="space-y-5">
            <span className="display-title inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-3 py-1 text-[10px] text-primary-foreground/80 ring-1 ring-primary-foreground/15">
              <Sparkles className="size-3" />
              Capture studio
            </span>
            <h1 className="heading-title text-3xl sm:text-4xl lg:text-5xl" data-testid="scan-hero-title">
              Point. Shoot. Appraise.
            </h1>
            <p className="max-w-prose text-sm text-primary-foreground/85 sm:text-base">
              Photograph the item and (if you can) its brand label. Our AI investigates what it is,
              what it's worth, and spins up a listing — in seconds.
            </p>
            <ul className="grid gap-2 sm:grid-cols-3" aria-label="Capture tips">
              <HintChip Icon={Lightbulb} label="Good lighting" description="Daylight works best" />
              <HintChip Icon={Maximize2} label="Fill the frame" description="Center the item" />
              <HintChip Icon={Camera} label="Steady hands" description="Hold for the shutter" />
            </ul>
            <button
              type="button"
              onClick={jumpToCapture}
              data-testid="scan-hero-cta"
              className={cn(
                "inline-flex touch-target items-center gap-2 rounded-full bg-primary-foreground px-5 py-3 text-sm font-semibold text-primary",
                "transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-foreground/30",
              )}
            >
              <Camera className="size-4" />
              Start capturing
            </button>
          </div>

          {/* Decorative scan frame visualisation */}
          <div
            className="relative mx-auto hidden w-full max-w-[320px] lg:block"
            aria-hidden="true"
          >
            <div className="relative aspect-3/4 w-full overflow-hidden rounded-3xl border border-primary-foreground/15 bg-primary-foreground/5 backdrop-blur-sm">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary-foreground/60 to-transparent animate-sweep" />
              <div className="absolute inset-6 grid place-items-center">
                <Camera className="size-16 text-primary-foreground/40" />
              </div>
              {/* Scan corners */}
              <span className="pointer-events-none absolute left-3 top-3 size-10 rounded-tl-2xl border-l-2 border-t-2 border-primary-foreground/60" />
              <span className="pointer-events-none absolute right-3 top-3 size-10 rounded-tr-2xl border-r-2 border-t-2 border-primary-foreground/60" />
              <span className="pointer-events-none absolute bottom-3 left-3 size-10 rounded-bl-2xl border-b-2 border-l-2 border-primary-foreground/60" />
              <span className="pointer-events-none absolute bottom-3 right-3 size-10 rounded-br-2xl border-b-2 border-r-2 border-primary-foreground/60" />
              <div className="absolute inset-x-6 bottom-6 rounded-xl bg-primary-foreground/10 p-3 text-center text-[11px] text-primary-foreground/80 ring-1 ring-primary-foreground/15">
                Line the item up inside the frame
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The capture + valuation flow (unchanged logic) */}
      <div ref={captureRef} data-testid="scan-capture-anchor">
        <Appraise />
      </div>
    </div>
  );
}

function HintChip({
  Icon,
  label,
  description,
}: {
  Icon: typeof Camera;
  label: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-2 rounded-xl bg-primary-foreground/8 px-3 py-2 ring-1 ring-primary-foreground/10">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary-foreground/15 text-primary-foreground">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-primary-foreground">{label}</span>
        <span className="block text-[11px] text-primary-foreground/70">{description}</span>
      </span>
    </li>
  );
}
