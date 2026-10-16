import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Check, ExternalLink, Loader2, Receipt, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiGet, apiPatch, ApiError } from "@/lib/api";
import { gbp } from "@/lib/types";
import type { InventoryItem } from "@/lib/types";

/** Till-mode sell confirmation. Opens after a successful barcode/QR scan so a volunteer at the
 * till can ring an item through in one tap — item title + the tag price, and a big "Mark sold"
 * button. The sale always goes through at the tag price (no override at the till); staff who need
 * to change anything open the item instead. On success invalidates inventory/stats so the Finds
 * grid and dashboards refresh instantly. */
export default function TillSellDialog({
  itemId,
  open,
  onClose,
}: {
  itemId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const item = useQuery<InventoryItem>({
    queryKey: ["inventory", itemId],
    queryFn: () => apiGet<InventoryItem>(`/inventory/${itemId}`),
    enabled: open && !!itemId,
    staleTime: 0,
  });

  const sell = useMutation({
    mutationFn: async () => {
      const price = item.data?.recommended_price;
      if (price === undefined || !Number.isFinite(price) || price < 0) {
        throw new Error("This item has no valid tag price");
      }
      return apiPatch<InventoryItem>(`/inventory/${itemId}/sell`, {
        sold: true,
        sold_price: Math.round(price * 100) / 100,
      });
    },
    onSuccess: (sold) => {
      toast.success(`Sold: ${sold.title} · ${gbp(sold.sold_price ?? 0)}`, { duration: 2500 });
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      void qc.invalidateQueries({ queryKey: ["activity"] });
      onClose();
    },
    onError: (e: Error) => {
      // Surface the backend detail (e.g. "Item is already marked sold" after a cross-device
      // race) so volunteers see the real reason, not just the generic fetch wrapper message.
      const detail =
        e instanceof ApiError
          ? typeof (e.body as { detail?: unknown } | null)?.detail === "string"
            ? ((e.body as { detail: string }).detail)
            : e.message
          : e.message;
      toast.error(detail || "Could not mark sold");
      // On a 409 the server-side state has diverged from our cache — refetch so the dialog
      // flips to the "already sold" branch next time it opens.
      if (e instanceof ApiError && e.status === 409) {
        void qc.invalidateQueries({ queryKey: ["inventory"] });
      }
    },
  });

  const i = item.data;
  const isSold = i?.status === "sold";

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent data-testid="till-sell-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" />
            Till — mark sold
          </DialogTitle>
        </DialogHeader>
        {item.isPending ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : !i ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground" data-testid="till-not-found">
              Item not found.
            </p>
            <Button variant="outline" className="w-full" onClick={onClose} data-testid="till-close">
              <X className="size-4" />
              Close
            </Button>
          </div>
        ) : isSold ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground" data-testid="till-already-sold">
              <span className="font-semibold text-foreground">{i.title}</span> was already sold
              {i.sold_price != null ? ` for ${gbp(i.sold_price)}` : ""}.
            </p>
            <Button variant="outline" className="w-full" onClick={onClose} data-testid="till-close">
              <X className="size-4" />
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
              {i.item_image && (
                <img
                  src={i.item_image}
                  alt=""
                  className="size-14 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {i.brand || "—"}
                </p>
                <p
                  className="truncate text-sm font-semibold text-foreground"
                  data-testid="till-item-title"
                >
                  {i.title}
                </p>
                <p className="text-[11px] text-muted-foreground">SKU {i.sku.slice(-6)}</p>
              </div>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tag price
              </p>
              <p
                className="font-mono text-4xl font-extrabold tabular-nums text-foreground"
                data-testid="till-tag-price"
              >
                {gbp(i.recommended_price)}
              </p>
            </div>

            <Button
              size="lg"
              className="h-14 w-full text-base"
              onClick={() => sell.mutate()}
              disabled={sell.isPending}
              data-testid="till-confirm-sell"
            >
              {sell.isPending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Check className="size-5" />
              )}
              Mark sold · {gbp(i.recommended_price)}
            </Button>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={onClose}
                disabled={sell.isPending}
                data-testid="till-cancel"
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={sell.isPending}
                onClick={() => {
                  onClose();
                  navigate(`/tag/${i.id}`);
                }}
                data-testid="till-open-item"
              >
                <ExternalLink className="size-4" />
                Open item
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
