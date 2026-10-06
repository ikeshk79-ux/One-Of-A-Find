import { Routes, Route } from "react-router-dom";
import RequireAuth from "@/components/RequireAuth";
import Appraise from "@/pages/Appraise";
import Inventory from "@/pages/Inventory";
import TagPage from "@/pages/TagPage";
import PrintTags from "@/pages/PrintTags";
import Activity from "@/pages/Activity";
import Staff from "@/pages/Staff";
import SunroomDemo from "@/pages/SunroomDemo";
import SessionLocationDemo from "@/pages/SessionLocationDemo";

export default function App() {
  return (
    <Routes>
      {/* Ungated previews — standalone mocks, do not touch the live login/theme/inventory flows. */}
      <Route path="/demo/sunroom" element={<SunroomDemo />} />
      <Route path="/demo/session-location" element={<SessionLocationDemo />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Appraise />
          </RequireAuth>
        }
      />
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
