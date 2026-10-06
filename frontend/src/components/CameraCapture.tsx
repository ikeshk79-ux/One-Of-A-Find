import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CameraOff, Check, Flashlight, FlashlightOff, Loader2, RefreshCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function shrink(canvas: HTMLCanvasElement, max = 900) {
  const scale = Math.min(1, max / Math.max(canvas.width, canvas.height));
  if (scale === 1) return canvas.toDataURL("image/jpeg", 0.82);
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  out.getContext("2d")?.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", 0.82);
}

// Cheap quality heuristics on a downscaled copy: mean luminance (too dark) and mean absolute
// Laplacian (low = soft/out-of-focus). Thresholds are conservative so we only hint on clear cases.
function analyzeQuality(canvas: HTMLCanvasElement): { dark: boolean; blurry: boolean } {
  const w = 96;
  const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return { dark: false, blurry: false };
  ctx.drawImage(canvas, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float64Array(w * h);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = g;
    sum += g;
  }
  const mean = sum / (w * h);
  let lapSum = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const lap = 4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - w] - gray[idx + w];
      lapSum += Math.abs(lap);
      n++;
    }
  }
  const sharpness = n ? lapSum / n : 0;
  return { dark: mean < 50, blurry: sharpness < 6 };
}

export default function CameraCapture({
  open,
  title,
  onClose,
  onCapture,
  testid,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  testid: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "live" | "denied">("idle");
  const [shot, setShot] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fullFrame, setFullFrame] = useState(false);
  const [quality, setQuality] = useState<{ dark: boolean; blurry: boolean } | null>(null);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number; step: number } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // When the camera exposes a native hardware zoom range (ultra-wide phones report a min below 1,
  // e.g. 0.5), drive the slider from that range and apply it to the track. Otherwise fall back to a
  // 1x-4x digital crop zoom (which cannot go below 1 - there's no wider field of view to reveal).
  const hwZoom = zoomCaps !== null;
  const ZOOM_MIN = zoomCaps ? zoomCaps.min : 1;
  const ZOOM_MAX = zoomCaps ? zoomCaps.max : 4;
  const ZOOM_STEP = zoomCaps && zoomCaps.step > 0 ? zoomCaps.step : 0.1;
  const applyHwZoom = (z: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    track
      ?.applyConstraints({ advanced: [{ zoom: z }] } as unknown as MediaTrackConstraints)
      .catch(() => undefined);
  };
  const changeZoom = (z: number) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
    setZoom(clamped);
    if (hwZoom) applyHwZoom(clamped);
  };
  const stepZoom = (delta: number) => changeZoom(zoom + delta);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn]);

  const start = useCallback(async () => {
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1080 },
          height: { ideal: 1440 },
          aspectRatio: { ideal: 3 / 4 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      // Torch (flashlight) is a per-track capability; only rear cameras on phones expose it.
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as {
        torch?: boolean;
        zoom?: { min: number; max: number; step?: number };
      };
      setTorchSupported(!!caps.torch);
      // Native zoom range (incl. sub-1 ultra-wide on capable phones) → wire the slider to it.
      const zc = caps.zoom;
      if (zc && typeof zc.min === "number" && typeof zc.max === "number" && zc.min < zc.max) {
        const step = typeof zc.step === "number" && zc.step > 0 ? zc.step : 0.1;
        setZoomCaps({ min: zc.min, max: zc.max, step });
        const init = Math.min(zc.max, Math.max(zc.min, 1));
        setZoom(init);
        track
          ?.applyConstraints({ advanced: [{ zoom: init }] } as unknown as MediaTrackConstraints)
          .catch(() => undefined);
      } else {
        setZoomCaps(null);
      }
      if (!caps.torch) {
        // Some mobile browsers only populate the torch capability after the first frame renders.
        setTimeout(() => {
          const t = streamRef.current?.getVideoTracks()[0];
          const c2 = (t?.getCapabilities?.() ?? {}) as { torch?: boolean };
          if (c2.torch) setTorchSupported(true);
        }, 600);
      }
      setTorchOn(false);
      setStatus("live");
    } catch {
      setStatus("denied");
    }
  }, []);

  useEffect(() => {
    if (open) {
      setShot(null);
      setZoom(1);
      setFullFrame(false);
      setQuality(null);
      void start();
    } else {
      stop();
      setStatus("idle");
      setTorchOn(false);
      setTorchSupported(false);
      setZoomCaps(null);
    }
    return stop;
  }, [open, start, stop]);

  const take = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    // Digital zoom (>=1) crops a centred 1/zoom region; hardware zoom is already baked into the frame.
    const z = hwZoom ? 1 : zoom;
    let cw = vw / z;
    let ch = vh / z;
    // Default: crop to a 3:4 PORTRAIT, centred. Full-frame mode keeps the whole sensor region.
    if (!fullFrame) {
      const target = 3 / 4; // width / height
      if (cw / ch > target) cw = ch * target;
      else ch = cw / target;
    }
    const sx = (vw - cw) / 2;
    const sy = (vh - ch) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cw);
    canvas.height = Math.round(ch);
    canvas.getContext("2d")?.drawImage(video, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
    setQuality(analyzeQuality(canvas));
    setShot(shrink(canvas));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-hairline bg-charcoal sm:max-w-xl" data-testid={`${testid}-dialog`}>
        <DialogHeader>
          <DialogTitle className="display-title text-sm text-gold">{title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Hold the item steady in frame, then take the shot.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mx-auto aspect-3/4 w-full max-w-[340px] overflow-hidden rounded-lg border border-hairline bg-obsidian">
          <video
            ref={videoRef}
            playsInline
            muted
            data-testid={`${testid}-video`}
            style={{ transform: `scale(${hwZoom ? 1 : zoom})`, transformOrigin: "center" }}
            className={`size-full transition-transform duration-150 ${fullFrame ? "object-contain" : "object-cover"} ${shot || status !== "live" ? "invisible" : ""}`}
          />
          {shot && (
            <img
              src={shot}
              alt="Captured preview"
              className="absolute inset-0 size-full object-cover animate-shutter"
              data-testid={`${testid}-preview`}
            />
          )}
          {!shot && status === "live" && (
            <div
              className="pointer-events-none absolute inset-0"
              data-testid={`${testid}-grid`}
              aria-hidden="true"
            >
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/20" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/20" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/20" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/20" />
            </div>
          )}
          {!shot && status === "starting" && (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-gold" />
            </div>
          )}
          {!shot && status === "denied" && (
            <div
              className="absolute inset-0 grid place-items-center gap-3 p-8 text-center"
              data-testid={`${testid}-denied`}
            >
              <CameraOff className="mx-auto size-6 text-gold/70" />
              <p className="text-sm text-muted-foreground">
                No camera available, or access was blocked. Allow camera access in your browser and
                try again.
              </p>
              <Button variant="outline" size="sm" data-testid={`${testid}-retry`} onClick={() => void start()}>
                <RefreshCw className="size-4" />
                Try again
              </Button>
            </div>
          )}
          {!shot && status === "live" && (
            <button
              type="button"
              data-testid={`${testid}-frame-toggle`}
              aria-pressed={fullFrame}
              aria-label={fullFrame ? "Switch to portrait 3:4 capture" : "Switch to full-frame capture"}
              onClick={() => setFullFrame((v) => !v)}
              className="absolute left-3 top-3 rounded-full border border-hairline/70 bg-obsidian/70 px-3 py-1.5 text-[11px] font-medium text-muted-foreground backdrop-blur transition-colors hover:text-gold"
            >
              {fullFrame ? "Full frame" : "Portrait 3:4"}
            </button>
          )}
          {!shot && status === "live" && torchSupported && (
            <button
              type="button"
              data-testid={`${testid}-torch`}
              aria-pressed={torchOn}
              aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
              onClick={() => void toggleTorch()}
              className={`absolute right-3 top-3 grid size-10 place-items-center rounded-full border backdrop-blur transition-colors duration-150 ${
                torchOn
                  ? "border-gold bg-gold/20 text-gold"
                  : "border-hairline/70 bg-obsidian/70 text-muted-foreground hover:text-gold"
              }`}
            >
              {torchOn ? <Flashlight className="size-4" /> : <FlashlightOff className="size-4" />}
            </button>
          )}
          {!shot && status === "live" && (
            <div
              className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-lg border border-hairline/70 bg-obsidian/70 px-3 py-2 backdrop-blur"
              data-testid={`${testid}-zoom`}
            >
              <button
                type="button"
                data-testid={`${testid}-zoom-out`}
                onClick={() => stepZoom(-ZOOM_STEP * 5)}
                className="text-muted-foreground transition-colors hover:text-gold"
              >
                <ZoomOut className="size-4" />
              </button>
              <input
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={ZOOM_STEP}
                value={zoom}
                onChange={(e) => changeZoom(Number(e.target.value))}
                data-testid={`${testid}-zoom-slider`}
                aria-label="Zoom"
                className="h-1 flex-1 cursor-pointer accent-gold"
              />
              <button
                type="button"
                data-testid={`${testid}-zoom-in`}
                onClick={() => stepZoom(ZOOM_STEP * 5)}
                className="text-muted-foreground transition-colors hover:text-gold"
              >
                <ZoomIn className="size-4" />
              </button>
              <span className="w-9 text-right font-mono text-xs text-gold tabular-nums">
                {zoom.toFixed(1)}×
              </span>
            </div>
          )}
        </div>

        {shot && quality && (quality.dark || quality.blurry) && (
          <p
            className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500"
            data-testid={`${testid}-quality-hint`}
          >
            <AlertTriangle className="size-4 shrink-0" />
            This photo looks {quality.dark && quality.blurry
              ? "dark and a little blurry"
              : quality.dark
                ? "a little dark"
                : "a little blurry"}{" "}
            — consider retaking for a sharper appraisal.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" data-testid={`${testid}-cancel`} onClick={onClose}>
            <X className="size-4" />
            Cancel
          </Button>
          {shot ? (
            <>
              <Button variant="outline" data-testid={`${testid}-retake`} onClick={() => { setShot(null); changeZoom(1); setQuality(null); }}>
                <RefreshCw className="size-4" />
                Retake
              </Button>
              <Button
                className="bg-gold text-gold-ink hover:bg-gold-dim"
                data-testid={`${testid}-use`}
                onClick={() => {
                  onCapture(shot);
                  onClose();
                }}
              >
                <Check className="size-4" />
                Use photo
              </Button>
            </>
          ) : (
            <Button
              className="bg-gold text-gold-ink transition-transform duration-200 hover:bg-gold-dim active:scale-95"
              disabled={status !== "live"}
              data-testid={`${testid}-shutter`}
              onClick={take}
            >
              <Camera className="size-4" />
              Take photo
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
