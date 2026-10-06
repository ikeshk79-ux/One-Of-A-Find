import { Camera, ScanLine, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// A one-time "how to appraise" tour for new volunteers. Shown once (persisted by the caller) and
// reopenable anytime from the "How it works" button on the Appraise screen.
const STEPS = [
  {
    icon: Camera,
    title: "1 · Capture",
    text: "Take a clear photo of the item and a second of its brand label. Good light and a steady, filled frame give the best appraisal.",
  },
  {
    icon: ScanLine,
    title: "2 · Appraise",
    text: "Tap Appraise — the AI identifies the item, finds its peak retail price and suggests a fair charity resale price. Pick a price panel or set your own.",
  },
  {
    icon: TagIcon,
    title: "3 · Save & tag",
    text: "Save the item to your branch's inventory and print its price tag (barcode + QR). Then tap \u201CAppraise another item\u201D for the next donation.",
  },
];

export default function FirstRunGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-hairline bg-charcoal" data-testid="first-run-guide">
        <DialogHeader>
          <DialogTitle className="display-title text-base text-gold">How appraising works</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            A quick three-step tour — reopen it anytime from &ldquo;How it works&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-4">
          {STEPS.map((s) => (
            <li key={s.title} className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
                <s.icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{s.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <Button
          className="mt-2 w-full bg-gold text-gold-ink hover:bg-gold-dim"
          data-testid="first-run-guide-dismiss"
          onClick={onClose}
        >
          Got it — let&rsquo;s go
        </Button>
      </DialogContent>
    </Dialog>
  );
}
