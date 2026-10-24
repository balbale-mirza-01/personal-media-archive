import React, { useState } from "react";
import { ChevronDown, ChevronRight, Eye, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/StoreContext";

export function SeriesTree({ media }) {
  const [openSeasons, setOpenSeasons] = useState(() => {
    const map = {};
    (media.seasons || []).forEach((s) => (map[s.id] = true));
    return map;
  });

  const toggle = (id) => setOpenSeasons((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {(media.seasons || []).map((season) => {
        const sProg = seasonProgress(season);
        const open = openSeasons[season.id];
        return (
          <div key={season.id} className="border-b border-border last:border-0">
            <button
              onClick={() => toggle(season.id)}
              className="flex w-full items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
              <span className="font-medium text-foreground">
                {season.title}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {season.release_year}
              </span>
              <div className="ml-auto flex items-center gap-3">
                {sProg.avgRating && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{" "}
                    {sProg.avgRating}
                  </span>
                )}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {sProg.watched}/{sProg.total}
                </span>
                <div className="h-1.5 w-16 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-teal-500"
                    style={{ width: `${sProg.pct}%` }}
                  />
                </div>
              </div>
            </button>
            {open && (
              <div className="divide-y divide-border border-t border-border">
                {(season.episodes || []).map((ep) => (
                  <EpisodeRow key={ep.id} mediaId={media.id} episode={ep} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EpisodeRow({ mediaId, episode }) {
  const { setEpisodeStatus } = useStore();
  const watched = episode.watch_status === "watched";
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 pl-12 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
      <button
        onClick={() =>
          setEpisodeStatus(
            mediaId,
            episode.id,
            watched ? "unwatched" : "watched",
          )
        }
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
          watched
            ? "bg-teal-500 border-teal-500 text-white"
            : "border-slate-300 dark:border-slate-600 text-transparent hover:border-teal-400",
        )}
      >
        <Eye className={cn("h-3.5 w-3.5", watched ? "text-white" : "hidden")} />
      </button>
      <span className="text-xs font-mono text-slate-400 dark:text-slate-500 w-8 shrink-0">
        E{String(episode.number).padStart(2, "0")}
      </span>
      <span className="text-sm text-foreground flex-1 truncate">
        {episode.title}
      </span>
      {episode.imdb_rating && (
        <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{" "}
          {episode.imdb_rating}
        </span>
      )}
      <span className="text-xs text-slate-400 dark:text-slate-500">
        {episode.runtime}m
      </span>
      <span className="text-xs text-slate-400 dark:text-slate-500 font-mono hidden sm:inline">
        {episode.imdb_id}
      </span>
    </div>
  );
}

function seasonProgress(season) {
  const eps = season.episodes || [];
  const watched = eps.filter((e) => e.watch_status === "watched").length;
  const rated = eps.filter((e) => e.imdb_rating);
  const avg = rated.length
    ? +(rated.reduce((s, e) => s + e.imdb_rating, 0) / rated.length).toFixed(1)
    : null;
  return {
    watched,
    total: eps.length,
    pct: eps.length ? Math.round((watched / eps.length) * 100) : 0,
    avgRating: avg,
  };
}
