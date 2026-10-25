"""Recursive hard-drive folder scanner.

Walks a local path, collects MKV/MP4 files, parses each filename into
structured hints, and groups results per media item:
  - movies: grouped by (title_guess, year)
  - series: grouped by title, with seasons keyed by season number and
    episodes keyed by episode number (multi-part files merged per episode).
"""
import os
from collections import defaultdict

from .filename_parser import is_video_file, parse_filename


def scan_directory(root_path, max_files=5000):
    """Return (groups, stats). Raises ValueError if the path is invalid."""
    root_path = os.path.abspath(os.path.expanduser(root_path))
    if not os.path.isdir(root_path):
        raise ValueError(f"Path does not exist or is not a directory: {root_path}")

    stats = {"files_seen": 0, "video_files": 0, "skipped": 0, "errors": []}
    movie_groups = defaultdict(lambda: {"files": []})
    series_groups = {}

    for dirpath, dirnames, filenames in os.walk(root_path):
        # Skip hidden/system dirs
        dirnames[:] = [d for d in dirnames if not d.startswith((".", "$"))]
        for name in sorted(filenames):
            stats["files_seen"] += 1
            if stats["video_files"] >= max_files:
                stats["skipped"] += 1
                continue
            full = os.path.join(dirpath, name)
            if not is_video_file(name):
                continue
            try:
                size = os.path.getsize(full)
            except OSError as e:
                stats["errors"].append(f"{full}: {e}")
                continue
            parsed = parse_filename(name)
            entry = {
                "file_name": name,
                "file_path": full,
                "file_size_bytes": size,
                "quality": parsed["quality"],
                "source": parsed["source"],
                "codec": parsed["codec"],
                "part_number": parsed["part_number"],
                "is_multi_part": parsed["is_multi_part"],
                "parse": parsed,
            }
            stats["video_files"] += 1

            title = (parsed["title_guess"] or "").strip()
            if not title:
                stats["errors"].append(f"{full}: could not extract a title guess")
                continue

            if parsed["season"] is not None:
                key = title.lower()
                grp = series_groups.setdefault(
                    key, {"title_guess": title, "year": parsed["year"], "seasons": {}}
                )
                sdata = grp["seasons"].setdefault(parsed["season"], {})
                ep = sdata.setdefault(parsed["episode"], {"episode": parsed["episode"], "files": []})
                ep["files"].append(entry)
            else:
                mkey = (title.lower(), parsed["year"])
                grp = movie_groups[mkey]
                grp["title_guess"] = title
                grp["year"] = parsed["year"]
                grp["files"].append(entry)

    groups = []
    for grp in movie_groups.values():
        total = sum(f["file_size_bytes"] for f in grp["files"])
        groups.append({
            "kind": "movie",
            "title_guess": grp["title_guess"],
            "year": grp["year"],
            "total_size_bytes": total,
            "files": grp["files"],
        })
    for grp in sorted(series_groups.values(), key=lambda g: g["title_guess"]):
        seasons_out, total = [], 0
        for snum in sorted(grp["seasons"]):
            eps = []
            for enum in sorted(grp["seasons"][snum]):
                ep = grp["seasons"][snum][enum]
                ep_total = sum(f["file_size_bytes"] for f in ep["files"])
                total += ep_total
                eps.append({"episode": enum, "file_count": len(ep["files"]),
                            "size_bytes": ep_total, "files": ep["files"]})
            seasons_out.append({"season": snum, "episode_count": len(eps), "episodes": eps})
        groups.append({
            "kind": "series",
            "title_guess": grp["title_guess"],
            "year": grp["year"],
            "total_size_bytes": total,
            "seasons": seasons_out,
        })

    groups.sort(key=lambda g: (g["kind"], g["title_guess"]))
    return groups, stats
