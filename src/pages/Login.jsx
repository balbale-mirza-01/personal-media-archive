import React, { useEffect, useState } from "react";
import {
  Clapperboard,
  Shield,
  User,
  ArrowRight,
  Database,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { authApi } from "@/api/endpoints";
import { setToken } from "@/api/client";
import { pingBackend } from "@/lib/backendStatus";
import { cn } from "@/lib/utils";

const ACCOUNTS = [
  {
    role: "admin",
    name: "Admin User",
    desc: "Full access — manage all archive data",
    icon: Shield,
  },
  {
    role: "user",
    name: "Regular User",
    desc: "Browse and manage the catalog",
    icon: User,
  },
];

export default function Login() {
  const { login } = useAuth();
  const [backendOnline, setBackendOnline] = useState(null); // null = checking

  useEffect(() => {
    let alive = true;
    pingBackend().then((ok) => alive && setBackendOnline(ok));
    return () => {
      alive = false;
    };
  }, []);

  const signIn = async (acc) => {
    // Try to obtain a DRF token from the Django backend (Phase 7).
    // Demo credentials match the seeded users: username = role, pass demo1234.
    // If the backend is offline we stay in local mode — the demo login page
    // keeps working exactly as before.
    try {
      const res = await authApi.token(acc.role, "demo1234");
      if (res?.token) setToken(res.token);
    } catch {
      setToken(null);
    }
    login({ role: acc.role, name: acc.name });
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 dark:bg-teal-500 text-white mb-4">
            <Clapperboard className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-bold text-foreground">Media Archive</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Sign in to your archive
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          {/* Backend connection indicator (Phase 7): shows whether the Django
              DRF API is reachable. Offline => app runs on the local demo store. */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium",
              backendOnline === null &&
                "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
              backendOnline === true &&
                "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400",
              backendOnline === false &&
                "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
            )}
          >
            {backendOnline === null && (
              <>
                <Database className="h-3.5 w-3.5 animate-pulse" />
                Checking backend…
              </>
            )}
            {backendOnline === true && (
              <>
                <Database className="h-3.5 w-3.5" />
                Connected to Django API — data will load from the server
              </>
            )}
            {backendOnline === false && (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                Backend offline — running in local demo mode. Start it with
                <code className="ml-1 rounded bg-amber-100 px-1 py-0.5 font-mono dark:bg-amber-900/50">
                  python manage.py runserver 8000
                </code>
              </>
            )}
          </div>

          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Choose an account
          </p>
          {ACCOUNTS.map((acc) => (
            <button
              key={acc.role}
              onClick={() => signIn(acc)}
              className="group flex w-full items-center gap-4 rounded-xl border border-border p-4 text-left hover:border-teal-400 hover:bg-teal-50/40 dark:hover:bg-teal-500/5 transition-colors"
            >
              <span
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl",
                  acc.role === "admin"
                    ? "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300",
                )}
              >
                <acc.icon className="h-5 w-5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">{acc.name}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
                      acc.role === "admin"
                        ? "bg-teal-600 text-white"
                        : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
                    )}
                  >
                    {acc.role}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {acc.desc}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-teal-500 transition-colors" />
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
          Demo mode — no real credentials needed.
        </p>
      </div>
    </div>
  );
}
