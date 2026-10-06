import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const MIN = 1;
const MAX = 5;
const STEP = 0.5;

// A zoomable, pannable photo viewer with next/prev paging. Zoom via scroll wheel, pinch (touch),
// or the on-screen +/− buttons; drag to pan once zoomed in; reset returns to a centred 1× fit.
export default function ImageLightbox({
  open,
  images,
  startIndex = 0,
  onClose,
}: {
  open: boolean;
  images: string[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, []);

  const count = images.length;

  // Reset paging + zoom when the viewer opens.
  useEffect(() => {
    if (open) {
      setIndex(startIndex);
      reset();
    }
  }, [open, startIndex, reset]);

  // Reset zoom whenever the shown photo changes.
  useEffect(() => {
    reset();
  }, [index, reset]);

  // Keyboard paging.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => (count ? (i + 1) % count : 0));
      else if (e.key === "ArrowLeft") setIndex((i) => (count ? (i - 1 + count) % count : 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, count]);

  const clampScale = (s: number) => Math.min(MAX, Math.max(MIN, Math.round(s * 10) / 10));
  const zoomBy = (d: number) =>
    setScale((s) => {
      const n = clampScale(s + d);
      if (n === 1) setPos({ x: 0, y: 0 });
      return n;
    });

  const go = (dir: number) => setIndex((i) => (count ? (i + dir + count) % count : 0));

  const onWheel = (e: React.WheelEvent) => zoomBy(e.deltaY < 0 ? STEP : -STEP);

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({
      x: drag.current.px + (e.clientX - drag.current.x),
      y: drag.current.py + (e.clientY - drag.current.y),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const dist = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) pinch.current = { dist: dist(e.touches), scale };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      setScale(clampScale((pinch.current.scale * dist(e.touches)) / pinch.current.dist));
    }
  };
  const onTouchEnd = () => {
    pinch.current = null;
  };

  const current = images[index];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-4xl overflow-hidden border-hairline bg-charcoal p-0"
        data-testid="image-lightbox"
      >
        <DialogHeader className="flex-row items-center justify-between gap-2 border-b border-hairline px-4 py-3 pr-12">
          <DialogTitle className="display-title text-xs text-gold">
            Photo <span data-testid="lightbox-index">{count ? index + 1 : 0}</span> / {count}
          </DialogTitle>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              data-testid="lightbox-zoom-out"
              disabled={scale <= MIN}
              onClick={() => zoomBy(-STEP)}
            >
              <ZoomOut className="size-4" />
            </Button>
            <span className="w-10 text-center font-mono text-xs text-gold tabular-nums">
              {scale.toFixed(1)}×
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              data-testid="lightbox-zoom-in"
              disabled={scale >= MAX}
              onClick={() => zoomBy(STEP)}
            >
              <ZoomIn className="size-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" data-testid="lightbox-reset" onClick={reset}>
              <RotateCcw className="size-4" />
            </Button>
          </div>
        </DialogHeader>

        <div
          className="relative flex h-[70vh] touch-none items-center justify-center overflow-hidden bg-obsidian"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {current ? (
            <img
              src={current}
              alt={`Photo ${index + 1}`}
              draggable={false}
              data-testid="lightbox-image"
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
                cursor: scale > 1 ? "grab" : "default",
              }}
              className="max-h-full max-w-full select-none object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">No photo</p>
          )}

          {count > 1 && (
            <>
              <button
                type="button"
                data-testid="lightbox-prev"
                onClick={() => go(-1)}
                aria-label="Previous photo"
                className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-hairline/70 bg-obsidian/70 text-foreground backdrop-blur transition-colors duration-200 hover:text-gold"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                data-testid="lightbox-next"
                onClick={() => go(1)}
                aria-label="Next photo"
                className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-hairline/70 bg-obsidian/70 text-foreground backdrop-blur transition-colors duration-200 hover:text-gold"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </div>

        {count > 1 && (
          <div
            className="flex gap-2 overflow-x-auto border-t border-hairline bg-charcoal px-4 py-3"
            data-testid="lightbox-thumbs"
          >
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                data-testid={`lightbox-thumb-${i}`}
                aria-label={`Show photo ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`size-14 shrink-0 overflow-hidden rounded-md border transition-colors duration-200 ${
                  i === index ? "border-gold" : "border-hairline hover:border-gold/50"
                }`}
              >
                <img src={src} alt={`Thumbnail ${i + 1}`} className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
