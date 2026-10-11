import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

// Soft-sage mission card. Low-key, no fabricated statistics. Used on the More page.
export default function MissionCard({
  className,
  testid,
}: {
  className?: string;
  testid?: string;
}) {
  return (
    <section
      data-testid={testid ?? "mission-card"}
      className={cn(
        "flex items-start gap-4 rounded-2xl border border-secondary bg-secondary p-5 text-secondary-foreground",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--terracotta)_18%,transparent)] text-[color:var(--terracotta-deep)]"
      >
        <Heart className="size-5" />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="heading-title text-base text-foreground">
          Good finds support great causes.
        </p>
        <p className="text-xs leading-relaxed text-secondary-foreground/80">
          One Of A Find helps charity shops price donations fairly so every sale raises more for
          the causes behind them.
        </p>
      </div>
    </section>
  );
}
