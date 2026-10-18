import React from "react";
import { Link } from "react-router-dom";
import { Film, Tv } from "lucide-react";
import { RatingPill } from "@/components/Stars";

export function TopMediaList({ items }) {
  const top = [...items]
    .filter((m) => m.imdb_rating)
    .sort((a, b) => (b.imdb_rating || 0) - (a.imdb_rating || 0))
    .slice(0, 5);
  if (!top.length)
    return (
      <p className="px-5 py-6 text-sm text-slate-400 dark:text-slate-500">
        No rated titles found.
      </p>
    );
  return (
    <div className="divide-y divide-border">
      {top.map((m) => (
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
          <div className="flex-1 min-w-0">
            <p className="truncate font-medium text-foreground">
              {m.title_english}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {m.release_year}
              {m.end_year ? `–${m.end_year}` : ""} ·{" "}
              {m.type === "series" ? "Series" : "Movie"}
            </p>
          </div>
          <RatingPill value={m.imdb_rating} />
        </Link>
      ))}
    </div>
  );
}
