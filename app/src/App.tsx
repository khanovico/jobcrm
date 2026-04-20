import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { ApplicationDetailPage } from "./pages/ApplicationDetailPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { AuditPage } from "./pages/AuditPage";
import { CompaniesPage } from "./pages/CompaniesPage";
import { CompanyDetailPage } from "./pages/CompanyDetailPage";
import { DashboardPage } from "./pages/DashboardPage";
import { IndustriesPage } from "./pages/IndustriesPage";
import { LoginPage } from "./pages/LoginPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ProfileDetailPage } from "./pages/ProfileDetailPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SettingsPage } from "./pages/SettingsPage";

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
  );
}
