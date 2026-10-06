import { cn } from "@/lib/utils";

// Large, soft-sage "value card" used on the home + results screens.
export default function ValueDisplay({
  label,
  value,
  caption,
  tone = "sage",
  className,
  testid,
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: "sage" | "cream" | "forest";
  className?: string;
  testid?: string;
}) {
  const toneClass =
    tone === "forest"
      ? "bg-primary text-primary-foreground border-primary/50"
      : tone === "cream"
        ? "bg-muted text-foreground border-border"
        : "bg-secondary text-secondary-foreground border-secondary";
  return (
    <div
      data-testid={testid}
      className={cn(
        "rounded-2xl border p-5 sm:p-6",
        toneClass,
        className,
      )}
    >
      <p
        className={cn(
          "display-title text-[10px]",
          tone === "forest" ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p className="heading-title mt-2 text-3xl font-extrabold tabular-nums sm:text-4xl">
        {value}
      </p>
      {caption && (
        <p
          className={cn(
            "mt-1 text-xs",
            tone === "forest" ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {caption}
        </p>
      )}
    </div>
  );
}
