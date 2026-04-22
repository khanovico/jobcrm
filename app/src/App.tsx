import { Suspense, lazy } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth";
import { Layout } from "./components/Layout";

const DashboardPage = lazy(async () => ({ default: (await import("./pages/DashboardPage")).DashboardPage }));
const CompaniesPage = lazy(async () => ({ default: (await import("./pages/CompaniesPage")).CompaniesPage }));
const CompanyDetailPage = lazy(async () => ({ default: (await import("./pages/CompanyDetailPage")).CompanyDetailPage }));
const ProfilesPage = lazy(async () => ({ default: (await import("./pages/ProfilesPage")).ProfilesPage }));
const ProfileDetailPage = lazy(async () => ({ default: (await import("./pages/ProfileDetailPage")).ProfileDetailPage }));
const ApplicationsPage = lazy(async () => ({ default: (await import("./pages/ApplicationsPage")).ApplicationsPage }));
const ApplicationDetailPage = lazy(
  async () => ({ default: (await import("./pages/ApplicationDetailPage")).ApplicationDetailPage })
);
const IndustriesPage = lazy(async () => ({ default: (await import("./pages/IndustriesPage")).IndustriesPage }));
const AuditPage = lazy(async () => ({ default: (await import("./pages/AuditPage")).AuditPage }));
const SettingsPage = lazy(async () => ({ default: (await import("./pages/SettingsPage")).SettingsPage }));
const NotificationsPage = lazy(async () => ({ default: (await import("./pages/NotificationsPage")).NotificationsPage }));
const LoginPage = lazy(async () => ({ default: (await import("./pages/LoginPage")).LoginPage }));

const PageFallback = () => <div className="p-4 text-sm opacity-70">Loading page…</div>;

const PrivateOutlet = () => {
  const { token, isUserLoading } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (isUserLoading) return <div className="p-4 text-sm opacity-70">Loading account…</div>;
  return <Outlet />;
};

const AdminOnlyOutlet = () => {
  const { user, isUserLoading } = useAuth();
  if (isUserLoading) return <div className="p-4 text-sm opacity-70">Loading account…</div>;
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;
  return <Outlet />;
};

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<PrivateOutlet />}>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/companies/:companyId" element={<CompanyDetailPage />} />
            <Route path="/profiles" element={<ProfilesPage />} />
            <Route path="/profiles/:profileId" element={<ProfileDetailPage />} />
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
            <Route path="/industries" element={<IndustriesPage />} />
            <Route element={<AdminOnlyOutlet />}>
              <Route path="/audit" element={<AuditPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
