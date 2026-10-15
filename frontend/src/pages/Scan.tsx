import Appraise from "@/pages/Appraise";

// The Scan route is now a pure wrapper around the Appraise flow — the "Capture studio" hero
// that used to sit above the capture controls was moved to Home per the volunteer-facing spec
// (the hero only belongs on the home screen; once the volunteer has tapped "Open camera" they
// should see the capture steps alone, not the hero again).
export default function Scan() {
  return (
    <div className="animate-rise space-y-8 pb-6">
      <Appraise />
    </div>
  );
}
