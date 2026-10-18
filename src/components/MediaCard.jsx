import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Film, Tv, AlertTriangle, Pencil, Check } from "lucide-react";
import {
  QualityBadge,
  HardDriveBadge,
  MpaBadge,
  StatusBadge,
  ContextBadge,
} from "./Badge";
import { RatingPill } from "./Stars";
import { seriesProgress, formatFileSize } from "@/lib/store";
import { cn } from "@/lib/utils";

export function MediaCard({
  media,
  hardDrives,
  view = "grid",
  onEdit,
  selectMode,
  selected,
  onToggleSelect,
}) {
  const navigate = useNavigate();
  const primaryFile = media.files && media.files[0];
  const hd = primaryFile
    ? hardDrives.find((h) => h.id === primaryFile.hard_drive_id)
    : null;
  const quality = primaryFile?.version_tag
    ?.match(/(4K|2160p|1080p|720p|480p|UHD)/i)?.[1]
    ?.toUpperCase();
  const progress = media.type === "series" ? seriesProgress(media) : null;

  if (view === "table") {
    return (
      <tr className="border-b border-border last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
        {selectMode && (
          <td className="py-3 pl-4 pr-2">
            <SelectCheckbox
              checked={selectMode && selected.has(media.id)}
              onClick={() => onToggleSelect(media.id)}
            />
          </td>
        )}
        <td className="py-3 pl-4 pr-2">
          <div className="flex items-center gap-3">
            <Link
              to={`/media/${media.id}`}
              className="flex items-center gap-3 group"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                {media.type === "series" ? (
                  <Tv className="h-4 w-4" />
                ) : (
                  <Film className="h-4 w-4" />
                )}
              </span>
              <span className="font-medium text-foreground group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                {media.title_english}
              </span>
            </Link>
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(media);
                }}
                className="p-1.5 text-slate-400 hover:text-teal-500 rounded"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </td>
        <td className="px-2 text-slate-500 dark:text-slate-400">
          {media.release_year}
        </td>
        <td className="px-2">
          <RatingPill value={media.imdb_rating} />
        </td>
        <td className="px-2">
          {quality && (
            <QualityBadge
              quality={quality}
              to={`/catalog?quality=${encodeURIComponent(quality)}`}
            />
          )}
        </td>
        <td className="px-2">
          {hd && <HardDriveBadge label={hd.label} id={hd.id} />}
        </td>
        <td className="px-2">
          <MpaBadge
            mpa={media.mpa_rating}
            to={
              media.mpa_rating
                ? `/catalog?mpa=${encodeURIComponent(media.mpa_rating)}`
                : undefined
            }
          />
        </td>
        <td className="px-2">
          <StatusBadge
            status={media.watch_status}
            to={`/catalog?status=${media.watch_status}`}
          />
        </td>
        <td className="px-2">
          <ContextBadge
            context={media.watchlist_context}
            to={`/catalog?context=${media.watchlist_context}`}
          />
        </td>
        <td className="py-3 pl-2 pr-4 text-right text-slate-500 dark:text-slate-400 text-sm">
          {progress
            ? `${progress.watched}/${progress.total}`
            : formatFileSize(primaryFile?.file_size)}
        </td>
      </tr>
    );
  }

  const isSelected = selectMode && selected.has(media.id);
  return (
    <div
      onClick={() =>
        selectMode ? onToggleSelect?.(media.id) : navigate(`/media/${media.id}`)
      }
      className={cn(
        "group relative flex flex-col rounded-xl bg-card p-4 transition-all cursor-pointer",
        selectMode ? "border-2" : "border border-border",
        isSelected
          ? "border-teal-500 ring-2 ring-teal-500/30"
          : "hover:border-teal-400/60 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:border-teal-500/40 dark:hover:shadow-black/20",
        !selectMode &&
          media.watch_status === "missing" &&
          "border-rose-300/60 dark:border-rose-700/50",
      )}
    >
      {onEdit && !selectMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(media);
          }}
          className="absolute right-3 top-3 z-10 p-1.5 rounded-md bg-card/80 backdrop-blur text-slate-400 hover:text-teal-500 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {selectMode && (
            <SelectCheckbox
              checked={isSelected}
              onClick={() => onToggleSelect(media.id)}
            />
          )}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
            {media.type === "series" ? (
              <Tv className="h-5 w-5" />
            ) : (
              <Film className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-foreground group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
              {media.title_english}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {media.type === "series" ? "Series" : "Movie"} ·{" "}
              {media.release_year}
              {media.end_year ? `–${media.end_year}` : ""}
            </p>
          </div>
        </div>
        <RatingPill value={media.imdb_rating} />
      </div>

      {media.title_original && media.title_original !== media.title_english && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 italic">
          "{media.title_original}"
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {quality && (
          <QualityBadge
            quality={quality}
            to={`/catalog?quality=${encodeURIComponent(quality)}`}
          />
        )}
        {hd && <HardDriveBadge label={hd.label} id={hd.id} />}
        <MpaBadge
          mpa={media.mpa_rating}
          to={
            media.mpa_rating
              ? `/catalog?mpa=${encodeURIComponent(media.mpa_rating)}`
              : undefined
          }
        />
        <StatusBadge
          status={media.watch_status}
          to={`/catalog?status=${media.watch_status}`}
        />
        <ContextBadge
          context={media.watchlist_context}
          to={`/catalog?context=${media.watchlist_context}`}
        />
      </div>

      {progress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Watched</span>
            <span>
              {progress.watched}/{progress.total} · {progress.pct}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-500 transition-all"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>
      )}

      {media.watch_status === "missing" && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
          <AlertTriangle className="h-3.5 w-3.5" /> File missing on drive
        </div>
      )}
    </div>
  );
}

function SelectCheckbox({ checked, onClick }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
        checked
          ? "bg-teal-600 border-teal-600 text-white"
          : "border-slate-300 dark:border-slate-600 bg-card hover:border-teal-400",
      )}
    >
      {checked && <Check className="h-3.5 w-3.5" />}
    </button>
  );
}
