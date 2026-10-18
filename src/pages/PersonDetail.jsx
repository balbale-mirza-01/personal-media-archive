import React from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Users, ArrowRight, Calendar, Globe } from "lucide-react";
import { useStore } from "@/lib/StoreContext";
import { Badge } from "@/components/Badge";
import { TopMediaList } from "@/components/TopMediaList";
import { fullName } from "@/lib/store";

export default function PersonDetail() {
  const { id } = useParams();
  const { db } = useStore();
  const person = db.persons.find((p) => p.id === id);

  if (!person) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400 dark:text-slate-500">Person not found.</p>
        <Link
          to="/persons"
          className="mt-3 inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to persons
        </Link>
      </div>
    );
  }

  const related = db.media.filter(
    (m) =>
      (m.cast || []).some((c) => c.person_id === person.id) ||
      (m.crew || []).some((c) => c.person_id === person.id),
  );

  return (
    <div className="space-y-6">
      <Link
        to="/persons"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400"
      >
        <ArrowLeft className="h-4 w-4" /> Back to persons
      </Link>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-teal-200 dark:from-teal-500/20 dark:to-teal-600/20 text-teal-600 dark:text-teal-400 text-xl font-semibold">
            {person.first_name?.[0]}
            {person.last_name?.[0]}
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Users className="h-6 w-6 text-teal-500" /> {fullName(person)}
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-1">
              {person.imdb_person_id}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(person.roles || []).map((r) => (
                <Badge key={r} tone="teal">
                  {r}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {person.birth_date && (
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Calendar className="h-4 w-4" /> {person.birth_date}
              {person.death_date ? ` – ${person.death_date}` : ""}
            </div>
          )}
          {person.nationality && (
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Globe className="h-4 w-4" /> {person.nationality}
            </div>
          )}
        </div>
        {person.biography && (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {person.biography}
          </p>
        )}
        <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          <b className="text-foreground">{related.length}</b> titles in your
          archive
        </div>
        <Link
          to={`/catalog?person=${person.id}`}
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
