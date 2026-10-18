import React, { useState, useRef, useEffect } from "react";
import { Bookmark, ChevronDown, Check, X } from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "alone", label: "Alone" },
  { value: "with_wife", label: "With Wife" },
  { value: "family_with_kids", label: "Family with Kids" },
];

export function WatchlistAddButton({ media }) {
  const { updateMedia } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const onList = media.watchlist_context && media.watch_status !== "watched";

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pick = (ctx) => {
    updateMedia(media.id, {
      watchlist_context: ctx,
      watchlist_added_at: new Date().toISOString().slice(0, 10),
      watch_status:
        media.watch_status === "watched" ? "unwatched" : media.watch_status,
    });
    setOpen(false);
  };

  const remove = () => {
    updateMedia(media.id, {
      watchlist_context: null,
      watchlist_added_at: null,
    });
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm transition-colors",
          onList
            ? "text-teal-600 dark:text-teal-400"
            : "text-slate-400 hover:text-teal-500",
        )}
      >
        <Bookmark
          className={cn("h-4 w-4", onList && "fill-teal-500 text-teal-500")}
        />
        {onList ? "On Watchlist" : "Add to Watchlist"}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-56 rounded-xl border border-border bg-card shadow-lg py-1">
          <p className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400">
            Set watchlist context
          </p>
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => pick(o.value)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              {o.label}
              {media.watchlist_context === o.value && (
                <Check className="h-4 w-4 text-teal-500" />
              )}
            </button>
          ))}
          {onList && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                onClick={remove}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-800/30"
              >
                <X className="h-4 w-4" /> Remove from watchlist
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
