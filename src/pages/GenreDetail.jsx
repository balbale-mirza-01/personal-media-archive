import React from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Tags, ArrowRight } from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import { Badge } from "@/components/Badge";
import { TopMediaList } from "@/components/TopMediaList";

export default function GenreDetail() {
  const { id } = useParams();
  const { db } = useStore();
  const genre = db.genres.find((g) => g.id === id);

  if (!genre) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400 dark:text-slate-500">Genre not found.</p>
        <Link
          to="/genres"
          className="mt-3 inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to genres
        </Link>
      </div>
    );
  }

  const parent = genre.parent_genre_id
    ? db.genres.find((g) => g.id === genre.parent_genre_id)
    : null;
  const children = db.genres.filter((g) => g.parent_genre_id === genre.id);
  const related = db.media.filter((m) =>
    (m.genre_ids || []).includes(genre.id),
  );

  return (
    <div className="space-y-6">
      <Link
        to="/genres"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400"
      >
        <ArrowLeft className="h-4 w-4" /> Back to genres
      </Link>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge tone={genre.genre_type === "sub" ? "slate" : "teal"}>
            {genre.genre_type === "sub" ? "Subgenre" : "Main Genre"}
          </Badge>
          {parent && (
            <Badge tone="teal" to={`/genre/${parent.id}`}>
              {parent.name}
            </Badge>
          )}
        </div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Tags className="h-6 w-6 text-teal-500" /> {genre.name}
        </h1>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-1">
          {genre.imdb_genre_id}
        </p>
        {genre.description && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            {genre.description}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span>
            <b className="text-foreground">{related.length}</b> titles
          </span>
          {children.length > 0 && (
            <span>
              <b className="text-foreground">{children.length}</b> subgenres
            </span>
          )}
        </div>
        <Link
          to={`/catalog?genre=${genre.id}`}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-sm font-medium"
        >
          View all in Catalog <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {children.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold text-foreground mb-3">Subgenres</h3>
          <div className="flex flex-wrap gap-2">
            {children.map((c) => (
              <Badge key={c.id} tone="slate" to={`/genre/${c.id}`}>
                {c.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Top 5 Rated Titles</h3>
        </div>
        <TopMediaList items={related} />
      </div>
    </div>
  );
}
