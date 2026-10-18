import React from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, HardDrive, ArrowRight } from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import { Badge } from "@/components/Badge";
import { TopMediaList } from "@/components/TopMediaList";
import { formatFileSize, driveUsedSpace } from "@/lib/store";

export default function HardDriveDetail() {
  const { id } = useParams();
  const { db } = useStore();
  const hd = db.hardDrives.find((h) => h.id === id);

  if (!hd) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400 dark:text-slate-500">
          Hard drive not found.
        </p>
        <Link
          to="/settings"
          className="mt-3 inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to settings
        </Link>
      </div>
    );
  }

  const related = db.media.filter((m) =>
    (m.files || []).some((f) => f.hard_drive_id === hd.id),
  );
  const usedSpace = driveUsedSpace(db, hd.id);
  const freeSpace = Math.max(0, (hd.total_space || 0) - usedSpace);
  const usedPct = hd.total_space
    ? Math.round((usedSpace / hd.total_space) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400"
      >
        <ArrowLeft className="h-4 w-4" /> Back to settings
      </Link>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <HardDrive className="h-7 w-7" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge tone="blue">{hd.label}</Badge>
              <span
                className={`h-2.5 w-2.5 rounded-full ${hd.is_connected ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {hd.is_connected ? "Connected" : "Offline"}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mt-1">
              {hd.name}
            </h1>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SpaceCard
            label="Total Space"
            value={formatFileSize(hd.total_space)}
          />
          <SpaceCard label="Used Space" value={formatFileSize(usedSpace)} />
          <SpaceCard label="Free Space" value={formatFileSize(freeSpace)} />
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Used space is calculated automatically from the sizes of files stored
          on this drive.
        </p>

        {hd.total_space > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span>Usage</span>
              <span>{usedPct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-teal-500"
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          <b className="text-foreground">{related.length}</b> titles stored on
          this drive
        </div>
        <Link
          to={`/catalog?hdd=${hd.id}`}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-sm font-medium"
        >
          View all in Catalog <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Top 5 Rated Titles</h3>
        </div>
        <TopMediaList items={related} />
      </div>
    </div>
  );
}

function SpaceCard({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-slate-50 dark:bg-slate-800/40 p-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
