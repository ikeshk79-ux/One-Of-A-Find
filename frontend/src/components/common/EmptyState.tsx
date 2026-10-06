import type { LucideIcon } from "lucide-react";
import { PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";

// Friendly empty state for lists/pages that have no data yet.
export default function EmptyState({
  icon: Icon = PackageSearch,
  title,
  description,
  action,
  className,
  testid,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="grid size-14 place-items-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-6" />
      </span>
      <div className="space-y-1">
        <h3 className="heading-title text-lg text-foreground">{title}</h3>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
