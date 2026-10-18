import React from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const tones = {
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300 ring-teal-600/20 dark:ring-teal-400/20",
  slate:
    "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300 ring-slate-400/20",
  amber:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 ring-amber-600/20",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300 ring-rose-600/20",
  violet:
    "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300 ring-violet-600/20",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300 ring-blue-600/20",
  green:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 ring-emerald-600/20",
  red: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300 ring-red-600/20",
};

export function Badge({ children, tone = "slate", className, icon: Icon, to }) {
  const navigate = useNavigate();
  const cls = cn(
    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
    tones[tone] || tones.slate,
    to && "cursor-pointer hover:opacity-80 transition-opacity",
    className,
  );
  const inner = (
    <>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </>
  );
  if (to) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          navigate(to);
        }}
        className={cls}
      >
        {inner}
      </button>
    );
  }
  return <span className={cls}>{inner}</span>;
}

export function QualityBadge({ quality, to }) {
  if (!quality) return null;
  const tone =
    quality === "4K" || quality === "2160P" || quality === "UHD"
      ? "violet"
      : quality === "1080P"
        ? "teal"
        : "slate";
  return (
    <Badge tone={tone} to={to}>
      {quality}
    </Badge>
  );
}

export function HardDriveBadge({ label, id }) {
  if (!label) return null;
  return (
    <Badge
      tone="blue"
      icon={HardDriveIcon}
      to={id ? `/catalog?hdd=${id}` : undefined}
    >
      {label}
    </Badge>
  );
}

const mpaTone = (mpa) => {
  if (!mpa) return "slate";
  if (["R", "NC-17", "TV-MA"].includes(mpa)) return "red";
  if (["PG-13", "TV-14"].includes(mpa)) return "amber";
  if (["PG", "TV-PG"].includes(mpa)) return "blue";
  if (["G", "TV-G", "TV-Y"].includes(mpa)) return "green";
  return "slate";
};

export function MpaBadge({ mpa, to }) {
  if (!mpa) return null;
  return (
    <Badge tone={mpaTone(mpa)} to={to}>
      {mpa}
    </Badge>
  );
}

const statusTone = (s) =>
  ({
    watched: "green",
    unwatched: "slate",
    watching: "amber",
    missing: "rose",
  })[s] || "slate";

export function StatusBadge({ status, to }) {
  if (!status) return null;
  return (
    <Badge tone={statusTone(status)} to={to}>
      {status}
    </Badge>
  );
}

const contextTone = (c) =>
  ({ alone: "violet", with_wife: "rose", family_with_kids: "green" })[c] ||
  "slate";

export function ContextBadge({ context, to }) {
  if (!context) return null;
  const label =
    { alone: "Alone", with_wife: "With Wife", family_with_kids: "Family" }[
      context
    ] || context;
  return (
    <Badge tone={contextTone(context)} to={to}>
      {label}
    </Badge>
  );
}

function HardDriveIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="22" y1="12" x2="2" y2="12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      <line x1="6" y1="16" x2="6.01" y2="16" />
      <line x1="10" y1="16" x2="10.01" y2="16" />
    </svg>
  );
}
