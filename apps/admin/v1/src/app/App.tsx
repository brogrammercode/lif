import { RegistrationEmailsPage } from "../modules/admin-access/RegistrationEmailsPage";
import { TripReviewsPage } from "../modules/app-configuration/TripReviewsPage";
import { lazy, Suspense } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { LoadingState, StateCard } from "../components/feedback/StateCard";
import { Button } from "../components/ui/Button";
import { AuthPage } from "../modules/auth/AuthPage";
import { useAuth } from "../modules/auth/AuthProvider";
import { WORKSPACE_PATH } from "../modules/auth/auth.constant";
import { VehicleCategoriesPage } from "../modules/vehicle-categories/VehicleCategoriesPage";
import { VehicleVerificationPage } from "../modules/users/VehicleVerificationPage";
import { UserRidesPage } from "../modules/users/UserRidesPage";
import { useUsers } from "../modules/users/UsersProvider";
import { isDriverAccount } from "../modules/users/users.type";
import { PersonalPage } from "../modules/users/PersonalPage";
import { AdminAccessPage } from "../modules/admin-access/AdminAccessPage";
import { ADMIN_ACCESS_PATH } from "../modules/admin-access/admin-access.constant";
import { AdminActivityPage } from "../modules/admin-access/AdminActivityPage";
import { VehicleModelsPage } from "../modules/vehicle-models/VehicleModelsPage";
import { FarePolicyPage } from "../modules/app-configuration/FarePolicyPage";
import { SupportContactsPage } from "../modules/app-configuration/SupportContactsPage";
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

const PartnerExitsPage = lazy(() =>
  import("../modules/partner-program/PartnerExitsPage").then((module) => ({
    default: module.PartnerExitsPage,
  })),
);

function UserRidesRoute() {
  const { userId } = useParams();
  return <UserRidesPage key={userId} />;
}

export function App() {
  const auth = useAuth();
  const location = useLocation();
  if (!auth.ready)
    return (
      <LoadingState variant="workspace" label="Restoring your workspace" />
    );
  if (!auth.user && auth.restoreError)
    return (
      <StateCard
        error
        title="Connection interrupted"
        message={auth.restoreError}
      >
        <Button
          onClick={() => {
            void auth.retryRestore();
          }}
        >
          Retry connection
        </Button>
      </StateCard>
    );
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route
        element={
          auth.user ? (
            <AppShell />
          ) : (
            <Navigate
              to="/login"
              replace
              state={{
                returnTo: location.pathname + location.search + location.hash,
              }}
            />
          )
        }
      >
        <Route path={WORKSPACE_PATH} element={<VehicleCategoriesPage />} />
        <Route path="/app/user/ride-reviews" element={<TripReviewsPage />} />
        <Route path="/app/user/fare-policy" element={<FarePolicyPage />} />
        <Route
          path="/support/configure/contact"
          element={<SupportContactsPage />}
        />
        <Route
          path="/support"
          element={<Navigate to="/support/configure/contact" replace />}
        />
        <Route
          path="/support/configure"
          element={<Navigate to="/support/configure/contact" replace />}
        />
        <Route
          path="/app/user/vehicle-models"
          element={<VehicleModelsPage />}
        />
        <Route path="/users" element={<PersonalPage />} />
        <Route path="/users/:userId/personal" element={<PersonalPage />} />
        <Route path="/users/:userId/rides" element={<UserRidesRoute />} />
        <Route
          path="/users/:userId/driver-account"
          element={<DeferredDriverAccount />}
        />
        <Route
          path="/users/:userId/vehicle-verification"
          element={<DriverVehicleRoute />}
        />
        <Route path={ADMIN_ACCESS_PATH} element={<AdminAccessPage />} />
        <Route path="/admin/access/activity" element={<AdminActivityPage />} />
        <Route
          path="/admin/access/registration-emails"
          element={<RegistrationEmailsPage />}
        />
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
          path="/partner-program/applications/exit-requests"
          element={
            <Suspense fallback={<LoadingState />}>
              <PartnerExitsPage />
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

function DeferredDriverAccount() {
  const { userId } = useParams();
  return (
    <Navigate
      replace
      to={userId ? `/users/${encodeURIComponent(userId)}/personal` : "/users"}
    />
  );
}

function DriverVehicleRoute() {
  const { userId } = useParams();
  const { selectedUser, selectedLoading, selectedError } = useUsers();
  if (selectedLoading || (!selectedUser && !selectedError))
    return <LoadingState />;
  if (selectedError)
    return (
      <StateCard
        error
        title="Could not load this account"
        message={selectedError}
      />
    );
  return selectedUser && isDriverAccount(selectedUser) ? (
    <VehicleVerificationPage />
  ) : (
    <Navigate
      replace
      to={`/users/${encodeURIComponent(userId ?? "")}/personal`}
    />
  );
}
