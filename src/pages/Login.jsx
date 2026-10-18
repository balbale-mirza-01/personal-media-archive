import React from "react";
import { Clapperboard, Shield, User, ArrowRight } from "lucide-react";
import { setDemoUser } from "@/lib/demoAuth";
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
  const signIn = (acc) => {
    setDemoUser({ role: acc.role, name: acc.name });
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
