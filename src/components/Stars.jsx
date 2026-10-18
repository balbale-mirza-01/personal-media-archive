import React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stars({
  value = 0,
  max = 10,
  size = 14,
  className,
  interactive,
  onChange,
}) {
  // 10-point scale shown as 5 stars (each star = 2 points)
  const stars = 5;
  const filled = (value / max) * stars;
  return (
    <div className={cn("inline-flex items-center gap-0.5", className)}>
      {Array.from({ length: stars }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, filled - i));
        return (
          <Star
            key={i}
            style={{ width: size, height: size }}
            className={cn(
              "transition-colors",
              interactive && "cursor-pointer hover:scale-110",
              fill > 0.75
                ? "text-amber-400 fill-amber-400"
                : fill > 0.25
                  ? "text-amber-400 fill-amber-400/50"
                  : "text-slate-300 dark:text-slate-600",
            )}
            onClick={
              interactive
                ? () => onChange && onChange(((i + 1) / stars) * max)
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

export function RatingPill({ value, className }) {
  if (!value)
    return (
      <span className="text-slate-400 dark:text-slate-500 text-sm">—</span>
    );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm font-semibold",
        className,
      )}
    >
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      {Number(value).toFixed(1)}
    </span>
  );
}
