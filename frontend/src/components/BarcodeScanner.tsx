import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Loader2, RefreshCw, ScanLine, X } from "lucide-react";
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

const DECODE_INTERVAL_MS = 220;

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
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handledRef = useRef(false);
  // Cooldown timer re-arms `handledRef` after each detection so the scanner can read the next
  // tag without the dialog being closed and reopened. Needed because the parent only closes the
  // dialog on a *resolved* scan — a 404 ("No item matches that barcode") toasts and leaves the
  // scanner open, previously stalling the decode loop forever (handledRef stuck true).
  const rearmTimerRef = useRef<number | null>(null);
  // Keep the callback in a ref so re-renders of the parent never tear down a live stream.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rearmTimerRef.current !== null) {
      window.clearTimeout(rearmTimerRef.current);
      rearmTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    handledRef.current = false;
    if (rearmTimerRef.current !== null) {
      window.clearTimeout(rearmTimerRef.current);
      rearmTimerRef.current = null;
    }
    setStatus("starting");
    setErrorMessage("");
    try {
      // Direct getUserMedia (same pattern as CameraCapture) instead of zxing's device wrapper:
      // zxing's auto-play path never pumped frames once React toggled the video's visibility,
      // which showed as a live camera indicator over a blank frame on mobile Chrome.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setStatus("scanning");

      // Manual decode loop: grab the current frame onto an offscreen canvas and hand it to zxing.
      const reader = new BrowserMultiFormatReader();
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      timerRef.current = window.setInterval(() => {
        const v = videoRef.current;
        if (!v || !v.videoWidth || handledRef.current) return;
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        try {
          const result = reader.decodeFromCanvas(canvas);
          const text = result?.getText();
          if (text && !handledRef.current) {
            handledRef.current = true;
            onDetectedRef.current(text);
            // Debounce + re-arm: block decoding for ~1.5s so a steady camera doesn't fire the
            // same barcode dozens of times, then re-arm so the next tag (even if the parent kept
            // the dialog open after a 404) is still readable without a manual close + reopen.
            if (rearmTimerRef.current !== null) window.clearTimeout(rearmTimerRef.current);
            rearmTimerRef.current = window.setTimeout(() => {
              handledRef.current = false;
              rearmTimerRef.current = null;
            }, 1500);
          }
        } catch {
          // NotFoundException on every frame without a barcode — expected, keep scanning.
        }
      }, DECODE_INTERVAL_MS);
    } catch (err: unknown) {
      if (import.meta.env.DEV) console.warn("barcode scanner start failed:", err);
      setStatus("error");
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError") {
        setErrorMessage("Camera permission denied — allow it in your browser settings or type the SKU below.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setErrorMessage("No camera found on this device — type the SKU below.");
      } else if (name === "NotReadableError") {
        setErrorMessage("Camera is in use by another app — close it and try again.");
      } else {
        setErrorMessage("Camera unavailable — type the SKU below instead.");
      }
    }
  }, []);

  useEffect(() => {
    if (open) {
      setManual("");
      void start();
    } else {
      stop();
      setStatus("idle");
    }
    return stop;
  }, [open, start, stop]);

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
          {/* The video element stays mounted and visible for the whole dialog lifetime — hiding it
              (visibility/display) suspends frame delivery on mobile Chrome. Overlays sit on top. */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            data-testid="scanner-video"
            className="size-full object-cover"
          />
          {status === "scanning" && (
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-gold/70 shadow-[0_0_12px_rgba(217,180,143,0.8)]" />
          )}
          {status === "starting" && (
            <div className="absolute inset-0 grid place-items-center bg-obsidian text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-gold" />
            </div>
          )}
          {status === "error" && (
            <div
              className="absolute inset-0 grid place-items-center gap-3 bg-obsidian p-6 text-center text-sm text-muted-foreground"
              data-testid="scanner-error"
            >
              <ScanLine className="mx-auto size-6 text-gold/70" />
              {errorMessage || "Camera unavailable — type the SKU below instead."}
              <button
                type="button"
                data-testid="scanner-retry"
                onClick={() => void start()}
                className="mx-auto inline-flex items-center gap-2 rounded-full border border-hairline bg-charcoal px-4 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-gold/60 hover:text-gold"
              >
                <RefreshCw className="size-4" />
                Try again
              </button>
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
