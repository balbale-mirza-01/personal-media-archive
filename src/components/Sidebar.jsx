import React from "react";
import { NavLink, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Clapperboard,
  ScanSearch,
  Tags,
  Users,
  Settings,
  HardDrive,
  X,
  Bookmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/StoreContext";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/catalog", label: "Catalog", icon: Clapperboard },
  { to: "/watchlist", label: "Watchlist", icon: Bookmark },
  { to: "/scan", label: "Scan & Import", icon: ScanSearch },
  { to: "/genres", label: "Genres", icon: Tags },
  { to: "/persons", label: "Persons", icon: Users },
  { to: "/settings", label: "Settings & Backup", icon: Settings },
];

export function Sidebar({ open, onClose }) {
  const { db } = useStore();
  const connected = db.hardDrives.filter((h) => h.is_connected).length;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar-background transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-2 px-5 h-16 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 dark:bg-teal-500 text-white">
              <Clapperboard className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="font-semibold text-foreground text-sm">
                Media Archive
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Knowledge Base
              </p>
            </div>
          </Link>
          <button onClick={onClose} className="lg:hidden text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto scrollbar-thin">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50",
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
              <HardDrive className="h-3.5 w-3.5" /> Hard Drives
            </div>
            <div className="space-y-1.5">
              {db.hardDrives.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-slate-600 dark:text-slate-300">
                    {h.label}
                  </span>
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      h.is_connected
                        ? "bg-emerald-500"
                        : "bg-slate-300 dark:bg-slate-600",
                    )}
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              {connected} connected · {db.media.length} titles
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
