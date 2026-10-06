import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import PriceTag from "@/components/PriceTag";
import { apiGet } from "@/lib/api";
import type { InventoryItem } from "@/lib/types";

export default function PrintTags() {
  const [params] = useSearchParams();
  const ids = useMemo(
    () =>
      (params.get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [params],
  );

  const { data, isPending, isError } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => apiGet<InventoryItem[]>("/inventory"),
    retry: false,
  });

  const byId = new Map((data ?? []).map((i) => [i.id, i]));
  // Preserve the order the volunteer selected them in.
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((i): i is InventoryItem => Boolean(i));
  // An electrical item that hasn't passed its PAT test can't be tagged — keep it off the sheet.
  const printable = ordered.filter((i) => !(i.is_electrical && !i.pat_passed));
  const skipped = ordered.length - printable.length;

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Bulk print</p>
          <h1 className="display-title mt-3 text-2xl">Tag sheet</h1>
          <p className="mt-2 text-sm text-muted-foreground" data-testid="print-sheet-summary">
            {printable.length} tag{printable.length === 1 ? "" : "s"} ready to print on A4
            {skipped > 0 ? ` · ${skipped} skipped (PAT test required)` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/inventory" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="size-4" />
            Back to inventory
          </Link>
          <Button
            className="bg-gold text-gold-ink hover:bg-gold-dim"
            data-testid="print-sheet-button"
            disabled={printable.length === 0}
            onClick={() => window.print()}
          >
            <Printer className="size-4" />
            Print sheet
          </Button>
        </div>
      </div>

      {isPending && (
        <div className="mx-auto mt-10 h-64 w-[340px] rounded-lg bg-charcoal animate-sweep" />
      )}

      {!isPending && (isError || ordered.length === 0) && (
        <p className="no-print mt-10 text-sm text-muted-foreground" data-testid="print-sheet-empty">
          No items selected to print. Pick items from the inventory first.
        </p>
      )}

      {printable.length > 0 && (
        <div className="print-tags-grid mt-10 flex flex-wrap gap-6" data-testid="print-tags-grid">
          {printable.map((item) => (
            <PriceTag key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
