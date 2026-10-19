import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Loader2, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function BarcodeScanner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (sku: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let handled = false;
    setStatus("starting");
    setErrorMessage("");
    setManual("");

    // Fallback timeout: if neither the resolved-controls callback nor an error fires within
    // 8 seconds the camera is wedged (common on mobile when the permission prompt is dismissed
    // or when a different app has the camera). Flip to the error state so the user can type the
    // SKU instead of staring at a spinner.
    const stuckTimer = window.setTimeout(() => {
      if (cancelled) return;
      setStatus((s) => (s === "starting" ? "error" : s));
      setErrorMessage((m) => m || "Camera didn't start — grant camera permission or type the SKU below.");
    }, 8000);

    const reader = new BrowserMultiFormatReader();
    // Prefer the back camera on phones (facingMode: environment). Without this, zxing's default
    // `decodeFromVideoDevice(undefined, …)` often picks the front camera (or on Android picks a
    // random one), which looked to the user like "the camera isn't activated" — the stream was
    // live but pointing the wrong way at a dark lens cover.
    const constraints: MediaStreamConstraints = {
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    };

    reader
      .decodeFromConstraints(constraints, videoRef.current ?? undefined, (result) => {
        if (result && !cancelled && !handled) {
          handled = true;
          onDetected(result.getText());
        }
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        // iOS Safari needs an explicit play() after srcObject is set — zxing handles this but
        // some WKWebView wrappers do not; a redundant call is cheap and never hurts.
        void videoRef.current?.play().catch(() => undefined);
        setStatus("scanning");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (import.meta.env.DEV) console.warn("barcode scanner start failed:", err);
        setStatus("error");
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError") {
          setErrorMessage("Camera permission denied — allow it in your browser settings or type the SKU below.");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setErrorMessage("No back camera found on this device — type the SKU below.");
        } else if (name === "NotReadableError") {
          setErrorMessage("Camera is in use by another app — close it and try again.");
        } else {
          setErrorMessage("Camera unavailable — type the SKU below instead.");
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(stuckTimer);
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onDetected]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-hairline bg-charcoal sm:max-w-lg" data-testid="scanner-dialog">
        <DialogHeader>
          <DialogTitle className="display-title text-sm text-gold">Scan a price tag</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Point the camera at the barcode to pull the item up at the till.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg border border-hairline bg-obsidian">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            data-testid="scanner-video"
            className={`size-full object-cover ${status === "scanning" ? "" : "invisible"}`}
          />
          {status === "scanning" && (
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-gold/70 shadow-[0_0_12px_rgba(217,180,143,0.8)]" />
          )}
          {status === "starting" && (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-gold" />
            </div>
          )}
          {status === "error" && (
            <div
              className="absolute inset-0 grid place-items-center gap-2 p-6 text-center text-sm text-muted-foreground"
              data-testid="scanner-error"
            >
              <ScanLine className="mx-auto size-6 text-gold/70" />
              {errorMessage || "Camera unavailable — type the SKU below instead."}
            </div>
          )}
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) onDetected(manual.trim());
          }}
        >
          <div className="flex-1 space-y-2">
            <Label htmlFor="manual-sku" className="text-xs uppercase tracking-widest">
              Or enter SKU
            </Label>
            <Input
              id="manual-sku"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="12-digit SKU"
              inputMode="numeric"
              data-testid="manual-sku-input"
              className="bg-obsidian font-mono"
            />
          </div>
          <Button
            type="submit"
            className="bg-gold text-gold-ink hover:bg-gold-dim"
            disabled={!manual.trim()}
            data-testid="manual-sku-submit"
          >
            <ScanLine className="size-4" />
            Find
          </Button>
        </form>

        <Button variant="ghost" className="self-end" data-testid="scanner-close" onClick={onClose}>
          <X className="size-4" />
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
