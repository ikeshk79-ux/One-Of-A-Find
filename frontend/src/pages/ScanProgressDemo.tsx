import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import ProcessingSteps from "@/components/common/ProcessingSteps";
import { Button } from "@/components/ui/button";

// Ungated preview of the 4-step scan progress animation. Hit /demo/scan-progress
// to watch it play through without triggering a real Gemini appraisal — useful for
// stakeholder review and for the testing subagent to assert the step cadence.
export default function ScanProgressDemo() {
  const [key, setKey] = useState(0);
  const [active, setActive] = useState(true);
  // Auto-stop after 10 seconds so step 4 doesn't spin forever in a static preview;
  // "Replay" restarts the clock.
  useEffect(() => {
    const t = setTimeout(() => setActive(false), 10_000);
    return () => clearTimeout(t);
  }, [key]);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-10 sm:px-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        data-testid="scan-progress-demo-back"
      >
        <ArrowLeft className="size-3.5" /> Back to app
      </Link>
      <header className="space-y-2">
        <p className="display-title text-[10px] text-muted-foreground">Preview</p>
        <h1 className="heading-title text-2xl text-foreground sm:text-3xl">
          Scan progress animation
        </h1>
        <p className="text-sm text-muted-foreground">
          The four steps users see while an appraisal is in flight. Milestones trigger at 0 s, 1.6 s,
          3.6 s and 6.2 s; step 4 holds "working" until the API returns (10 s in this demo).
        </p>
      </header>
      <ProcessingSteps key={key} active={active} testid="demo-scan-progress" />
      <Button
        variant="outline"
        onClick={() => {
          setKey((k) => k + 1);
          setActive(true);
        }}
        data-testid="scan-progress-demo-replay"
        className="self-start"
      >
        <RefreshCw className="size-4" />
        Replay
      </Button>
    </div>
  );
}
