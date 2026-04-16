import { Link, NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../auth";

const links = [
  { to: "/", label: "Dashboard", emoji: "📊" },
  { to: "/companies", label: "Companies", emoji: "🏢" },
  { to: "/profiles", label: "Profiles", emoji: "👤" },
  { to: "/applications", label: "Applications", emoji: "📋" },
  { to: "/industries", label: "Industries", emoji: "🏭" },
  { to: "/audit", label: "Audit", emoji: "📜" },
  { to: "/notifications", label: "Notifications", emoji: "🔔" },
  { to: "/settings", label: "Settings", emoji: "⚙️" }
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
      <div className="drawer-content flex min-h-screen flex-col bg-base-200">
        <header className="navbar border-b border-base-300 bg-base-100 shadow-sm lg:z-10 lg:border-l-0">
          <div className="flex-1">
            <label htmlFor="main-drawer" className="btn btn-square btn-ghost lg:hidden" aria-label="Open menu">
              <span className="text-lg" aria-hidden>
                ≡
              </span>
            </label>
            <h1 className="ml-2 text-xl font-semibold tracking-tight">JobCRM</h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-sm" onClick={toggleTheme}>
              Toggle Theme
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={logout}>
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 p-4">
          <Outlet />
        </main>
      </div>
      <div className="drawer-side z-40">
        <label htmlFor="main-drawer" className="drawer-overlay" />
        <aside className="flex min-h-full w-64 flex-col border-r border-base-300 bg-base-100 lg:shadow-[inset_-1px_0_0_0_hsl(var(--b3))]">
          <div className="border-b border-base-300 px-4 py-4 lg:flex lg:h-[4.25rem] lg:items-center lg:border-b lg:border-base-300">
            <Link to="/" className="text-lg font-semibold tracking-tight">
              JobCRM
            </Link>
          </div>
          <nav className="flex-1 p-3" aria-label="Main">
            <ul className="menu menu-md gap-1 rounded-lg bg-base-200/60 p-2">
              {links.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.to === "/"}
                    className={({ isActive }) =>
                      [
                        "flex items-center gap-3 rounded-lg py-3 transition-colors",
                        isActive
                          ? "active bg-primary text-primary-content font-medium shadow-sm"
                          : "hover:bg-base-300/50"
                      ].join(" ")
                    }
                  >
                    <span className="text-lg leading-none" aria-hidden>
                      {link.emoji}
                    </span>
                    <span>{link.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
};
