import { Routes, Route } from "react-router-dom";
import RequireAuth from "@/components/RequireAuth";
import Home from "@/pages/Home";
import Scan from "@/pages/Scan";
import Finds from "@/pages/Finds";
import More from "@/pages/More";
import Inventory from "@/pages/Inventory";
import TagPage from "@/pages/TagPage";
import PrintTags from "@/pages/PrintTags";
import Activity from "@/pages/Activity";
import Staff from "@/pages/Staff";
import SunroomDemo from "@/pages/SunroomDemo";
import SessionLocationDemo from "@/pages/SessionLocationDemo";
import ScanProgressDemo from "@/pages/ScanProgressDemo";

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
      <Route
        path="/scan"
        element={
          <RequireAuth>
            <Scan />
          </RequireAuth>
        }
      />
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
      <Route
        path="/inventory"
        element={
          <RequireAuth>
            <Inventory />
          </RequireAuth>
        }
      />
      <Route
        path="/tag/:id"
        element={
          <RequireAuth>
            <TagPage />
          </RequireAuth>
        }
      />
      <Route
        path="/print-tags"
        element={
          <RequireAuth>
            <PrintTags />
          </RequireAuth>
        }
      />
      <Route
        path="/activity"
        element={
          <RequireAuth>
            <Activity />
          </RequireAuth>
        }
      />
      <Route
        path="/volunteers"
        element={
          <RequireAuth>
            <Staff />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
