import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Film,
  Tv,
  HardDrive,
  Eye,
  EyeOff,
  AlertTriangle,
  ArrowRight,
  Clapperboard,
  ScanSearch,
  Tags,
  Users,
} from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import { StatusBadge, ContextBadge, MpaBadge } from "@/components/Badge";
import { RatingPill } from "@/components/Stars";
import { seriesProgress } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function Home() {
  const { db } = useStore();

  const stats = useMemo(() => {
    const movies = db.media.filter((m) => m.type === "movie").length;
    const series = db.media.filter((m) => m.type === "series").length;
    const watched = db.media.filter((m) => m.watch_status === "watched").length;
    const unwatched = db.media.filter(
      (m) => m.watch_status === "unwatched" || m.watch_status === "watching",
    ).length;
    const missing = db.media.filter((m) => m.watch_status === "missing").length;
    const drives = db.hardDrives.length;
    const connected = db.hardDrives.filter((h) => h.is_connected).length;
    return {
      movies,
      series,
      watched,
      unwatched,
      missing,
      drives,
      connected,
      total: db.media.length,
    };
  }, [db]);

  const recent = db.media.slice(0, 5);

  const cards = [
    {
      label: "Total Titles",
      value: stats.total,
      icon: Clapperboard,
      tone: "teal",
    },
    { label: "Movies", value: stats.movies, icon: Film, tone: "blue" },
    { label: "TV Series", value: stats.series, icon: Tv, tone: "violet" },
    {
      label: "Hard Drives",
      value: `${stats.connected}/${stats.drives}`,
      icon: HardDrive,
      tone: "slate",
    },
    { label: "Watched", value: stats.watched, icon: Eye, tone: "green" },
    { label: "Unwatched", value: stats.unwatched, icon: EyeOff, tone: "amber" },
    {
      label: "Missing Files",
      value: stats.missing,
      icon: AlertTriangle,
      tone: "rose",
    },
  ];

  const toneClasses = {
    teal: "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    violet:
      "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    slate:
      "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",
    green:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    amber:
      "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-teal-700 dark:from-teal-600 dark:to-teal-800 p-6 lg:p-8 text-white">
        <h2 className="text-2xl lg:text-3xl font-bold tracking-tight">
          Your media archive, organised.
        </h2>
        <p className="mt-2 text-teal-50/90 max-w-xl">
          Track every film and series across your hard drives, match IMDb
          metadata, and manage your watchlist with parents-guide context.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/catalog"
            className="inline-flex items-center gap-2 rounded-lg bg-white text-teal-700 px-4 py-2 text-sm font-semibold hover:bg-teal-50 transition-colors"
          >
            Browse Catalog <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/scan"
            className="inline-flex items-center gap-2 rounded-lg bg-teal-500/30 ring-1 ring-white/30 text-white px-4 py-2 text-sm font-semibold hover:bg-teal-500/40 transition-colors"
          >
            <ScanSearch className="h-4 w-4" /> Scan a Drive
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                toneClasses[c.tone],
              )}
            >
              <c.icon className="h-5 w-5" />
            </div>
            <p className="mt-3 text-2xl font-bold text-foreground">{c.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {c.label}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Recently Added</h3>
            <Link
              to="/catalog"
              className="text-xs text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recent.map((m) => {
              const prog = m.type === "series" ? seriesProgress(m) : null;
              return (
                <Link
                  key={m.id}
                  to={`/media/${m.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                    {m.type === "series" ? (
                      <Tv className="h-4 w-4" />
                    ) : (
                      <Film className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {m.title_english}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {m.release_year} ·{" "}
                      {prog
                        ? `${prog.watched}/${prog.total} eps`
                        : `${m.runtime}m`}
                    </p>
                  </div>
                  <RatingPill value={m.imdb_rating} />
                  <div className="hidden sm:flex items-center gap-1.5">
                    <MpaBadge mpa={m.mpa_rating} />
                    <StatusBadge status={m.watch_status} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Quick links */}
        <div className="space-y-4">
          <QuickLink
            to="/scan"
            icon={ScanSearch}
            title="Scan & Import"
            desc="Match filenames to IMDb"
          />
          <QuickLink
            to="/genres"
            icon={Tags}
            title="Manage Genres"
            desc={`${db.genres.length} genres · hierarchical tree`}
          />
          <QuickLink
            to="/persons"
            icon={Users}
            title="Manage Persons"
            desc={`${db.persons.length} directors & actors`}
          />
          <QuickLink
            to="/settings"
            icon={HardDrive}
            title="Backup & Export"
            desc="JSON / CSV export & import"
          />
        </div>
      </div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, title, desc }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-teal-400 hover:shadow-md transition-all group"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400">
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex-1">
        <p className="font-medium text-foreground group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
          {title}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-teal-500 transition-colors" />
    </Link>
  );
}
