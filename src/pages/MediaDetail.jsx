import React, { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Film,
  Tv,
  HardDrive,
  Globe,
  Clock,
  Ratio,
  Star,
  User,
  Users,
  Trash2,
  Pencil,
  ShieldAlert,
  Heart,
  User as UserIcon,
  Baby,
  Save,
  FileVideo,
  Layers,
  Tag,
} from "lucide-react";
import { MediaFormModal } from "@/components/MediaFormModal";
import { useStore } from "@/lib/StoreContext";
import { SeriesTree } from "@/components/SeriesTree";
import { WatchlistAddButton } from "@/components/WatchlistAddButton";
import {
  QualityBadge,
  HardDriveBadge,
  MpaBadge,
  StatusBadge,
  ContextBadge,
  Badge,
} from "@/components/Badge";
import { Stars, RatingPill } from "@/components/Stars";
import { formatFileSize, seriesProgress, fullName } from "@/lib/store";
import { cn } from "@/lib/utils";

const TABS = ["Overview", "Parents Guide", "Cast & Crew", "Physical Files"];
const CONTEXTS = [
  { value: "alone", label: "Alone", icon: UserIcon, tone: "violet" },
  { value: "with_wife", label: "With Wife", icon: Heart, tone: "rose" },
  {
    value: "family_with_kids",
    label: "Family with Kids",
    icon: Baby,
    tone: "green",
  },
];
const PARENT_CATEGORIES = [
  "Sex & Nudity",
  "Violence & Gore",
  "Profanity",
  "Alcohol, Drugs & Smoking",
  "Frightening & Intense Scenes",
];

export default function MediaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { db, updateMedia, deleteMedia } = useStore();
  const [tab, setTab] = useState("Overview");
  const [editing, setEditing] = useState(false);
  const media = db.media.find((m) => m.id === id);

  if (!media) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400 dark:text-slate-500">Title not found.</p>
        <Link
          to="/catalog"
          className="mt-3 inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to catalog
        </Link>
      </div>
    );
  }

  const progress = media.type === "series" ? seriesProgress(media) : null;
  const primaryFile = media.files?.[0];
  const quality = primaryFile?.version_tag
    ?.match(/(4K|2160p|1080p|720p|480p|UHD)/i)?.[1]
    ?.toUpperCase();

  const handleDelete = () => {
    if (confirm(`Delete "${media.title_english}" from your archive?`)) {
      deleteMedia(media.id);
      navigate("/catalog");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/catalog"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400"
        >
          <ArrowLeft className="h-4 w-4" /> Back to catalog
        </Link>
        <div className="flex items-center gap-3">
          <WatchlistAddButton media={media} />
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-teal-500 transition-colors"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-rose-500 transition-colors"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex h-32 w-24 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 text-slate-400">
            {media.type === "series" ? (
              <Tv className="h-10 w-10" />
            ) : (
              <Film className="h-10 w-10" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge tone={media.type === "series" ? "violet" : "teal"}>
                {media.type === "series" ? "TV Series" : "Movie"}
              </Badge>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                {media.imdb_id}
              </span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              {media.title_english}
            </h1>
            {media.title_original &&
              media.title_original !== media.title_english && (
                <p className="text-slate-500 dark:text-slate-400 italic mt-0.5">
                  "{media.title_original}"
                </p>
              )}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
              <span>
                {media.release_year}
                {media.end_year ? `–${media.end_year}` : ""}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {media.runtime}m
              </span>
              <span className="inline-flex items-center gap-1">
                <Ratio className="h-3.5 w-3.5" /> {media.aspect_ratio}
              </span>
              <span className="inline-flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" />{" "}
                {(media.countries || []).join(", ")}
              </span>
              <span>{(media.languages || []).join(", ")}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {quality && (
                <QualityBadge
                  quality={quality}
                  to={`/catalog?quality=${encodeURIComponent(quality)}`}
                />
              )}
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
              {primaryFile && (
                <HardDriveBadge
                  label={
                    db.hardDrives.find(
                      (h) => h.id === primaryFile.hard_drive_id,
                    )?.label
                  }
                  id={primaryFile.hard_drive_id}
                />
              )}
            </div>
          </div>
          <div className="flex lg:flex-col gap-4 lg:items-end">
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                IMDb
              </p>
              <RatingPill value={media.imdb_rating} className="text-lg" />
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {(media.imdb_votes || 0).toLocaleString()} votes
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                Your Rating
              </p>
              <Stars
                value={media.personal_rating}
                interactive
                size={18}
                onChange={(v) =>
                  updateMedia(media.id, { personal_rating: Math.round(v) })
                }
              />
            </div>
          </div>
        </div>

        {progress && (
          <div className="mt-5 rounded-lg bg-slate-50 dark:bg-slate-800/40 p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium text-foreground">
                Series Progress
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {progress.watched}/{progress.total} episodes · {progress.pct}%
                {progress.avgRating ? ` · avg ${progress.avgRating}` : ""}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-teal-500 transition-all"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
              tab === t
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-slate-500 hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab media={media} db={db} />}
      {tab === "Parents Guide" && (
        <ParentsGuideTab media={media} updateMedia={updateMedia} />
      )}
      {tab === "Cast & Crew" && <CastCrewTab media={media} db={db} />}
      {tab === "Physical Files" && <FilesTab media={media} db={db} />}

      {editing && (
        <MediaFormModal media={media} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

function OverviewTab({ media, db }) {
  const genres = (media.genre_ids || [])
    .map((gid) => db.genres.find((g) => g.id === gid))
    .filter(Boolean);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {media.plot_summary && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold text-foreground mb-2">Plot Summary</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {media.plot_summary}
            </p>
          </div>
        )}
        {media.notes && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold text-foreground mb-2">
              Personal Notes
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
              {media.notes}
            </p>
          </div>
        )}
        {media.type === "series" && <SeriesTree media={media} />}
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <Tag className="h-4 w-4 text-teal-500" /> Genres
          </h3>
          <div className="flex flex-wrap gap-2">
            {genres.length ? (
              genres.map((g) => (
                <Badge key={g.id} tone="teal" to={`/catalog?genre=${g.id}`}>
                  {g.name}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-slate-400">No genres assigned.</p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold text-foreground mb-3">Details</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow label="IMDb ID" value={media.imdb_id} mono />
            <DetailRow label="Type" value={media.type} />
            <DetailRow label="Release" value={media.release_year} />
            {media.end_year && (
              <DetailRow label="Ended" value={media.end_year} />
            )}
            <DetailRow label="Runtime" value={`${media.runtime} min`} />
            <DetailRow label="Aspect Ratio" value={media.aspect_ratio} />
            <DetailRow
              label="Languages"
              value={(media.languages || []).join(", ")}
            />
            <DetailRow
              label="Countries"
              value={(media.countries || []).join(", ")}
            />
            <DetailRow label="MPA Rating" value={media.mpa_rating} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function ParentsGuideTab({ media, updateMedia }) {
  const [notes, setNotes] = useState(media.personal_parental_notes || "");
  const [saved, setSaved] = useState(false);
  const save = () => {
    updateMedia(media.id, { personal_parental_notes: notes });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold text-foreground mb-1 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500" /> IMDb Parents Guide
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Extracted evidence by category.
        </p>
        <div className="space-y-3">
          {PARENT_CATEGORIES.map((cat) => {
            const note = media.parents_guide_notes?.[cat];
            const severity = note ? severityOf(note) : "none";
            return (
              <div key={cat} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">
                    {cat}
                  </span>
                  {note && <SeverityDot severity={severity} />}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {note || "No notes recorded."}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold text-foreground mb-1">
            Watchlist Context
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Who is this suitable to watch with?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {CONTEXTS.map((c) => {
              const active = media.watchlist_context === c.value;
              return (
                <button
                  key={c.value}
                  onClick={() =>
                    updateMedia(media.id, { watchlist_context: c.value })
                  }
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-all",
                    active
                      ? "border-teal-500 bg-teal-50 dark:bg-teal-500/10"
                      : "border-border hover:border-teal-400",
                  )}
                >
                  <c.icon
                    className={cn(
                      "h-5 w-5",
                      active
                        ? "text-teal-600 dark:text-teal-400"
                        : "text-slate-400",
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium",
                      active
                        ? "text-teal-700 dark:text-teal-300"
                        : "text-slate-600 dark:text-slate-300",
                    )}
                  >
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold text-foreground mb-3">
            Personal Parental Notes
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="Add your own guidance for when to watch this…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
          <button
            onClick={save}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-sm font-medium"
          >
            <Save className="h-4 w-4" /> {saved ? "Saved!" : "Save Notes"}
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold text-foreground mb-3">Watch Status</h3>
          <div className="flex flex-wrap gap-2">
            {["watched", "watching", "unwatched", "missing"].map((s) => (
              <button
                key={s}
                onClick={() => updateMedia(media.id, { watch_status: s })}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
                  media.watch_status === s
                    ? "bg-teal-600 border-teal-600 text-white"
                    : "border-border text-slate-600 dark:text-slate-300 hover:border-teal-400",
                )}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CastCrewTab({ media, db }) {
  const cast = (media.cast || [])
    .map((c) => ({
      ...c,
      person: db.persons.find((p) => p.id === c.person_id),
    }))
    .filter((c) => c.person);
  const crew = (media.crew || [])
    .map((c) => ({
      ...c,
      person: db.persons.find((p) => p.id === c.person_id),
    }))
    .filter((c) => c.person);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-teal-500" /> Cast
        </h3>
        {cast.length ? (
          <div className="space-y-2">
            {cast.map((c, i) => (
              <PersonRow key={i} person={c.person} role={c.role} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No cast linked.</p>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <User className="h-4 w-4 text-teal-500" /> Crew
        </h3>
        {crew.length ? (
          <div className="space-y-2">
            {crew.map((c, i) => (
              <PersonRow key={i} person={c.person} role={c.role} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No crew linked.</p>
        )}
      </div>
    </div>
  );
}

function PersonRow({ person, role }) {
  return (
    <Link
      to={`/person/${person.id}`}
      className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700/50 text-slate-400">
        <User className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {fullName(person)}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          {person.imdb_person_id}
        </p>
      </div>
      <Badge tone="slate">{role}</Badge>
    </Link>
  );
}

function FilesTab({ media, db }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <FileVideo className="h-4 w-4 text-teal-500" />
          <h3 className="font-semibold text-foreground">Physical Files</h3>
          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            {media.files?.length || 0} file(s)
          </span>
        </div>
        {media.files?.length ? (
          <div className="divide-y divide-border">
            {media.files.map((f) => {
              const hd = db.hardDrives.find((h) => h.id === f.hard_drive_id);
              return (
                <div
                  key={f.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg",
                        f.is_multi_part
                          ? "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400"
                          : "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
                      )}
                    >
                      {f.is_multi_part ? (
                        <Layers className="h-4 w-4" />
                      ) : (
                        <FileVideo className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-mono text-foreground truncate">
                        {f.file_path}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {hd && <HardDriveBadge label={hd.label} id={hd.id} />}
                        {f.version_tag && (
                          <Badge tone="slate">{f.version_tag}</Badge>
                        )}
                        {f.is_multi_part && (
                          <Badge tone="violet">Part {f.part_number}</Badge>
                        )}
                        {media.watch_status === "missing" && (
                          <Badge tone="rose">Missing</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">
                      {formatFileSize(f.file_size)}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {hd?.is_connected ? "Drive connected" : "Drive offline"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-slate-400 text-center">
            No physical files recorded.
          </p>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={cn(
          "font-medium text-foreground text-right",
          mono && "font-mono text-sm",
        )}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function severityOf(note) {
  const n = note.toLowerCase();
  if (n.startsWith("severe")) return "severe";
  if (n.startsWith("moderate")) return "moderate";
  if (n.startsWith("mild")) return "mild";
  if (n.startsWith("none")) return "none";
  return "mild";
}

function SeverityDot({ severity }) {
  const colors = {
    severe: "bg-rose-500",
    moderate: "bg-amber-500",
    mild: "bg-yellow-400",
    none: "bg-emerald-500",
  };
  return <span className={cn("h-2.5 w-2.5 rounded-full", colors[severity])} />;
}
