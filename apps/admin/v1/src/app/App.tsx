import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { LoadingState, StateCard } from "../components/feedback/StateCard";
import { AuthPage } from "../modules/auth/AuthPage";
import { useAuth } from "../modules/auth/AuthProvider";
import { WORKSPACE_PATH } from "../modules/auth/auth.constant";
import { VehicleCategoriesPage } from "../modules/vehicle-categories/VehicleCategoriesPage";
import { PersonalPage } from "../modules/users/PersonalPage";
import { AdminAccessPage } from "../modules/admin-access/AdminAccessPage";
import { ADMIN_ACCESS_PATH } from "../modules/admin-access/admin-access.constant";
import { AdminActivityPage } from "../modules/admin-access/AdminActivityPage";
import { VehicleModelsPage } from "../modules/vehicle-models/VehicleModelsPage";
import { RequirementsPage } from "../modules/partner-requirements/RequirementsPage";
const PartnerDocumentPage = lazy(() =>
  import("../modules/partner-program/PartnerDocumentPage").then((module) => ({
    default: module.PartnerDocumentPage,
  })),
);
const PartnerApplicationsPage = lazy(() =>
  import("../modules/partner-program/PartnerApplicationsPage").then(
    (module) => ({ default: module.PartnerApplicationsPage }),
  ),
);

export function App() {
  const auth = useAuth();
  if (!auth.ready) return <LoadingState />;
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route
        element={auth.user ? <AppShell /> : <Navigate to="/login" replace />}
      >
        <Route path={WORKSPACE_PATH} element={<VehicleCategoriesPage />} />
        <Route
          path="/app/user/vehicle-models"
          element={<VehicleModelsPage />}
        />
        <Route path="/users" element={<PersonalPage />} />
        <Route path="/users/:userId/personal" element={<PersonalPage />} />
        <Route path={ADMIN_ACCESS_PATH} element={<AdminAccessPage />} />
        <Route path="/admin/access/activity" element={<AdminActivityPage />} />
        <Route
          path="/partner-program/requirements/details"
          element={<RequirementsPage key="details" section="details" />}
        />
        <Route
          path="/partner-program/requirements/policy"
          element={
            <Suspense fallback={<LoadingState />}>
              <PartnerDocumentPage key="POLICY" kind="POLICY" />
            </Suspense>
          }
        />
        <Route
          path="/partner-program/requirements/confirmation"
          element={
            <Suspense fallback={<LoadingState />}>
              <PartnerDocumentPage key="CONFIRMATION" kind="CONFIRMATION" />
            </Suspense>
          }
        />
        <Route
          path="/partner-program/applications"
          element={
            <Suspense fallback={<LoadingState />}>
              <PartnerApplicationsPage
                key="applications"
                section="applications"
              />
            </Suspense>
          }
        />
        <Route
          path="/partner-program/applications/confirmations"
          element={
            <Suspense fallback={<LoadingState />}>
              <PartnerApplicationsPage
                key="confirmations"
                section="confirmations"
              />
            </Suspense>
          }
        />
        <Route
          path="/partner-program/requirements/documents"
          element={<RequirementsPage key="documents" section="documents" />}
        />
        <Route
          path="/partner-program"
          element={
            <Navigate to="/partner-program/requirements/details" replace />
          }
        />
        <Route
          path="/partner-program/requirements"
          element={
            <Navigate to="/partner-program/requirements/details" replace />
          }
        />
        <Route
          path="/admin"
          element={<Navigate to={ADMIN_ACCESS_PATH} replace />}
        />
        <Route
          path="/admin/access"
          element={<Navigate to={ADMIN_ACCESS_PATH} replace />}
        />
        <Route path="/app" element={<Navigate to={WORKSPACE_PATH} replace />} />
        <Route
          path="/app/user"
          element={<Navigate to={WORKSPACE_PATH} replace />}
        />
      </Route>
      <Route
        path="/"
        element={
          <Navigate to={auth.user ? WORKSPACE_PATH : "/login"} replace />
        }
      />
      <Route
        path="*"
        element={
          <div className="min-h-screen grid place-items-center bg-canvas p-6">
            <StateCard
              title="This page is off route"
              message="Return to your workspace to continue."
            >
              <a className="button button-primary" href={WORKSPACE_PATH}>
                Go to workspace
              </a>
            </StateCard>
          </div>
        }
      />
    </Routes>
  );
}
