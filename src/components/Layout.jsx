import React, { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, LogOut } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { getDemoUser, clearDemoUser } from "@/lib/demoAuth";

const titles = {
  "/": "Dashboard",
  "/catalog": "Media Catalog",
  "/watchlist": "Watchlist",
  "/scan": "Scan & Import",
  "/genres": "Genres",
  "/persons": "Persons & Crew",
  "/settings": "Settings & Backup",
};

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const demoUser = getDemoUser();
  const title = titles[location.pathname] || "Media Archive";

  const handleLogout = () => {
    clearDemoUser();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 backdrop-blur px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-slate-600 dark:text-slate-300"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <div className="ml-auto flex items-center gap-3">
            {demoUser && (
              <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300 text-xs font-semibold uppercase">
                  {demoUser.role[0]}
                </span>
                <div className="leading-tight hidden sm:block">
                  <p className="text-xs font-medium text-foreground">
                    {demoUser.name}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">
                    {demoUser.role}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-rose-500"
                  title="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-4 lg:px-6 py-6 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
