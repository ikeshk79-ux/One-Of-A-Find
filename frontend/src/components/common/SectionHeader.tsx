import { cn } from "@/lib/utils";

// A quiet, uppercase eyebrow + a strong heading row with optional right-side action.
export default function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
  testid,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  testid?: string;
}) {
  return (
    <header className={cn("flex items-end justify-between gap-4", className)} data-testid={testid}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="display-title text-[10px] text-muted-foreground">{eyebrow}</p>
        )}
        <h2 className="heading-title mt-1 truncate text-xl text-foreground sm:text-2xl">
          {title}
        </h2>
        {description && (
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
