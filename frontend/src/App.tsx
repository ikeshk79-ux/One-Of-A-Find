import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import Home from "@/pages/Home";
import Finds from "@/pages/Finds";
import More from "@/pages/More";
import SunroomDemo from "@/pages/SunroomDemo";
import SessionLocationDemo from "@/pages/SessionLocationDemo";
import ScanProgressDemo from "@/pages/ScanProgressDemo";

// Heavy routes split off so the Home chunk stays small on mobile networks.
// Scan contains the full Appraise capture + valuation flow and loads only when the user taps
// into the camera studio; Inventory + PrintTags + TagPage include barcode/QR/print tooling that
// isn't needed for the home surface; Activity and Staff are master-only.
const Scan = lazy(() => import("@/pages/Scan"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const TagPage = lazy(() => import("@/pages/TagPage"));
const PrintTags = lazy(() => import("@/pages/PrintTags"));
const Activity = lazy(() => import("@/pages/Activity"));
const Staff = lazy(() => import("@/pages/Staff"));

function RouteFallback() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground"
      data-testid="route-fallback"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" />
      Loading…
    </div>
  );
}

function lazyGated(element: React.ReactElement): React.ReactElement {
  return (
    <RequireAuth>
      <Suspense fallback={<RouteFallback />}>{element}</Suspense>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Ungated previews — standalone mocks, do not touch the live login/theme/inventory flows. */}
      <Route path="/demo/sunroom" element={<SunroomDemo />} />
      <Route path="/demo/session-location" element={<SessionLocationDemo />} />
      <Route path="/demo/scan-progress" element={<ScanProgressDemo />} />

      {/* Forest Thrift Vision shell — Home / Scan / Finds / More */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
      <Route
        path="/home"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
      <Route path="/scan" element={lazyGated(<Scan />)} />
      <Route
        path="/finds"
        element={
          <RequireAuth>
            <Finds />
          </RequireAuth>
        }
      />
      <Route
        path="/more"
        element={
          <RequireAuth>
            <More />
          </RequireAuth>
        }
      />

      {/* Legacy routes — kept so bookmarks and deep links continue to work. */}
      <Route path="/inventory" element={lazyGated(<Inventory />)} />
      <Route path="/tag/:id" element={lazyGated(<TagPage />)} />
      <Route path="/print-tags" element={lazyGated(<PrintTags />)} />
      <Route path="/activity" element={lazyGated(<Activity />)} />
      <Route path="/volunteers" element={lazyGated(<Staff />)} />
    </Routes>
  );
}
