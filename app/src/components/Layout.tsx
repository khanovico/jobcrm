import { Link, Outlet } from "react-router-dom";

import { useAuth } from "../auth";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/companies", label: "Companies" },
  { to: "/profiles", label: "Profiles" },
  { to: "/applications", label: "Applications" }
];

export const Layout = () => {
  const { logout } = useAuth();

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", current === "dark" ? "light" : "dark");
  };

  return (
    <div className="drawer lg:drawer-open">
      <input id="main-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content min-h-screen bg-base-200">
        <div className="navbar bg-base-100 shadow-md">
          <div className="flex-1">
            <label htmlFor="main-drawer" className="btn btn-square btn-ghost lg:hidden">
              <span>≡</span>
            </label>
            <h1 className="ml-2 text-xl font-semibold">JobCRM</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm" onClick={toggleTheme}>
              Toggle Theme
            </button>
            <button className="btn btn-sm btn-outline" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
        <main className="p-4">
          <Outlet />
        </main>
      </div>
      <div className="drawer-side">
        <label htmlFor="main-drawer" className="drawer-overlay" />
        <aside className="min-h-full w-64 bg-base-100 p-4">
          <ul className="menu">
            {links.map((link) => (
              <li key={link.to}>
                <Link to={link.to}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
};
