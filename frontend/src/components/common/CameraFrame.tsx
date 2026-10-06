import { cn } from "@/lib/utils";

// Decorative scan frame used on the Scan screen (and anywhere we want a "line up the item"
// cue). Pure CSS corners — zero runtime cost, no SVG payload.
export default function CameraFrame({
  children,
  className,
  cornerClassName,
  testid,
}: {
  children?: React.ReactNode;
  className?: string;
  cornerClassName?: string;
  testid?: string;
}) {
  const corner = cn(
    "pointer-events-none absolute size-10 border-primary",
    cornerClassName,
  );
  return (
    <div
      data-testid={testid}
      className={cn(
        "relative mx-auto aspect-3/4 w-full max-w-[380px] overflow-hidden rounded-3xl border border-border bg-muted",
        className,
      )}
    >
      {children}
      <span className={cn(corner, "left-3 top-3 rounded-tl-2xl border-l-2 border-t-2")} />
      <span className={cn(corner, "right-3 top-3 rounded-tr-2xl border-r-2 border-t-2")} />
      <span className={cn(corner, "bottom-3 left-3 rounded-bl-2xl border-b-2 border-l-2")} />
      <span className={cn(corner, "bottom-3 right-3 rounded-br-2xl border-b-2 border-r-2")} />
    </div>
  );
}
