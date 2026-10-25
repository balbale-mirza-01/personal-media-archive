"""Hard-drive folder scanner management command.

Usage:
    python manage.py scan --path /mnt/hdd1 [--dry-run] [--max-files 5000]

Scans the given path recursively for MKV/MP4 files, groups them into movie /
series candidates (with IMDb search hints), and - unless --dry-run - ingests
verified matches. In non-interactive dry runs nothing is written to the DB.
"""
from django.core.management.base import BaseCommand, CommandError

from media.imdb_client import search_titles
from media.ingest import ingest_selections
from media.scanner import scan_directory


class Command(BaseCommand):
    help = "Recursively scan a folder for video files and optionally ingest matches."

    def add_arguments(self, parser):
        parser.add_argument("--path", required=True, help="Folder to scan")
        parser.add_argument("--dry-run", action="store_true",
                            help="Only report scan results; do not write to the DB")
        parser.add_argument("--max-files", type=int, default=5000)
        parser.add_argument("--auto-match", action="store_true",
                            help="Auto-ingest groups whose IMDb search returns an "
                                 "exact title+year match (single candidate confidence)")

    def handle(self, *args, **opts):
        try:
            groups, stats = scan_directory(opts["path"], max_files=opts["max_files"])
        except ValueError as e:
            raise CommandError(str(e))

        movies = [g for g in groups if g["kind"] == "movie"]
        series = [g for g in groups if g["kind"] == "series"]
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"Scan of {opts['path']}: {stats['video_files']} video files "
            f"-> {len(movies)} movie groups, {len(series)} series groups"))
        for err in stats["errors"]:
            self.stderr.write(f"  ! {err}")

        if opts["dry_run"]:
            for g in groups:
                size_gb = g["total_size_bytes"] / 1e9
                extra = (f"{len(g['files'])} files" if g["kind"] == "movie"
                         else f"{sum(s['episode_count'] for s in g['seasons'])} episodes")
                self.stdout.write(f"  [{g['kind']:6}] {g['title_guess']} "
                                  f"({g['year'] or '?'}) - {extra}, {size_gb:.2f} GB")
            self.stdout.write(self.style.WARNING("Dry run: no changes written."))
            return

        if not opts["auto_match"]:
            self.stdout.write(self.style.WARNING(
                "No --auto-match given; use the web Scan page (or POST /api/ingest/) "
                "to verify candidates interactively. Nothing was written."))
            return

        selections = []
        for g in groups:
            cands = search_titles(g["title_guess"], g.get("year"), g["kind"])
            exact = [c for c in cands
                     if c["title"].lower() == g["title_guess"].lower()
                     and (not g.get("year") or c.get("year") == g["year"])]
            if len(exact) == 1:
                sel = {"imdb_id": exact[0]["imdb_id"], "kind": g["kind"],
                       "title_guess": g["title_guess"], "year": g.get("year")}
                if g["kind"] == "movie":
                    sel["files"] = g["files"]
                else:
                    sel["seasons"] = [
                        {"season": s["season"],
                         "episodes": [{"episode": e["episode"], "files": e["files"]}
                                      for e in s["episodes"]]}
                        for s in g["seasons"]]
                selections.append(sel)
            else:
                self.stdout.write(self.style.WARNING(
                    f"  ambiguous/no match for '{g['title_guess']}' "
                    f"({len(cands)} candidates) - skipped"))

        if not selections:
            self.stdout.write("Nothing auto-matched.")
            return

        results = ingest_selections(selections)
        created = sum(1 for r in results if r["item_created"])
        enriched = len(results) - created
        files = sum(r["files_created"] for r in results)
        eps = sum(r["episodes_created"] for r in results)
        self.stdout.write(self.style.SUCCESS(
            f"Ingested {len(results)} items ({created} new, {enriched} enriched), "
            f"{files} files, {eps} episodes."))
