import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { LoadingState, StateCard } from "../components/feedback/StateCard";
import { Button } from "../components/ui/Button";
import { AuthPage } from "../modules/auth/AuthPage";
import { useAuth } from "../modules/auth/AuthProvider";
import { WORKSPACE_PATH } from "../modules/auth/auth.constant";
import { VehicleCategoriesPage } from "../modules/vehicle-categories/VehicleCategoriesPage";
import { PersonalPage } from "../modules/users/PersonalPage";

export function App() {
  const auth = useAuth();
  if (!auth.ready) return <LoadingState />;
  if (auth.error)
    return (
      <div className="min-h-screen grid place-items-center bg-canvas p-6">
        <StateCard
          error
          title="Could not restore your workspace"
          message={auth.error}
        >
          <Button onClick={auth.retry}>Try again</Button>
        </StateCard>
      </div>
    );
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route
        element={auth.user ? <AppShell /> : <Navigate to="/login" replace />}
      >
        <Route path={WORKSPACE_PATH} element={<VehicleCategoriesPage />} />
        <Route path="/users" element={<PersonalPage />} />
        <Route path="/users/:userId/personal" element={<PersonalPage />} />
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
