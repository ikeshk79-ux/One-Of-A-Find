import type { LucideIcon } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// Friendly error state. Never surfaces raw backend text — the caller supplies the message.
export default function ErrorState({
  icon: Icon = AlertTriangle,
  title = "Something went wrong",
  description = "We hit a snag. Please try again in a moment.",
  action,
  className,
  testid,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl border px-6 py-10 text-center",
        "border-[color-mix(in_oklab,var(--terracotta)_30%,transparent)] bg-[color-mix(in_oklab,var(--terracotta)_8%,var(--card))]",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-[color-mix(in_oklab,var(--terracotta)_18%,transparent)] text-[color:var(--terracotta-deep)]">
        <Icon className="size-5" />
      </span>
      <div className="space-y-1">
        <h3 className="heading-title text-base text-foreground">{title}</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
