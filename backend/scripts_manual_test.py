#!/usr/bin/env python
"""Manual smoke-test harness for the IMDb scraping / matching / bulk pipeline.

Run from backend/ with Django configured:
    python scripts_manual_test.py parse
    python scripts_manual_test.py scrape tt10370710
    python scripts_manual_test.py find "the matrix" 1999
    python scripts_manual_test.py match "tt10370710" "The.Matrix.1999.1080p.BluRay.x264-GRP.mkv"
    python scripts_manual_test.py ingest tt0133093
"""
import json
import os
import sys

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from media.bulk_match import bulk_match_lines            # noqa: E402
from media.filename_parser import parse_query_line       # noqa: E402
from media.imdb_client import get_title_details, search_titles  # noqa: E402


def show(obj):
    print(json.dumps(obj, indent=2, default=str))


def cmd_parse(lines):
    from media.filename_parser import normalize_imdb_id
    for line in lines or ["tt10370710",
                          "https://www.imdb.com/title/tt0133093/",
                          "The.Matrix.1999.1080p.BluRay.x264-GRP.mkv",
                          "Breaking.Bad.S01E03.720p.WEB-DL.mp4",
                          "Dune (2021) [2160p WEB-DL] CD1.mp4"]:
        print(f"\nLINE: {line!r}")
        show(parse_query_line(line))
        print("normalize_imdb_id ->", normalize_imdb_id(line))


def cmd_scrape(imdb_id):
    from media import imdb_scraper
    details = imdb_scraper.scrape_title_details(imdb_id)
    print(f"=== scrape_title_details({imdb_id}) ===")
    slim = {k: v for k, v in details.items()
            if k not in ("cast", "crew", "genres")}
    show(slim)
    print("cast:", [c["name"] for c in details.get("cast", [])][:8])
    print("genres:", details.get("genres"))
    try:
        pg = imdb_scraper.scrape_parental_guide(imdb_id)
        print(f"=== scrape_parental_guide({imdb_id}) ===")
        show(pg)
    except Exception as exc:
        print("parental guide failed:", exc)


def cmd_find(query, year=None):
    from media import imdb_scraper
    results = imdb_scraper.scrape_find(query, int(year) if year else None)
    show(results)


def cmd_match(lines):
    rows, summary = bulk_match_lines(lines or [
        "tt10370710",
        "The.Matrix.1999.1080p.BluRay.x264-GRP.mkv",
        "some totally unmatched gibberish zzz",
    ], delay_ms=300)
    for r in rows:
        print("\nROW:", r["query"], "->", r["status"],
              r.get("imdb_id"), r.get("match_title"),
              f"conf={r.get('confidence')}")
        for c in r.get("candidates", [])[:3]:
            print("   cand:", c["imdb_id"], c["title"], c.get("year"))
    print("\nSUMMARY:", summary)


def cmd_ingest(imdb_id):
    """Full DB round-trip: User Story 1 via the ingest service."""
    from django.db import transaction
    from media.ingest import ingest_selections
    from media.models import MediaItem
    results = ingest_selections([{
        "imdb_id": imdb_id,
        "kind": "movie",
        "title_guess": "",
        "files": [{"file_path": f"/tmp/test/{imdb_id}.mkv",
                   "file_name": f"{imdb_id}.mkv", "file_size_bytes": 12345}],
    }])
    show(results)
    item = MediaItem.objects.filter(imdb_id=imdb_id).first()
    print("DB row:", item, "| rating:", getattr(item, "user_rating", None),
          "| votes:", getattr(item, "vote_count", None),
          "| genres:", list(item.genres.values_list("name", flat=True)),
          "| credits:", item.credits.count() if hasattr(item, "credits") else "-")
    transaction.set_rollback(True)  # dry-run: don't persist unless you remove this


COMMANDS = {
    "parse": lambda a: cmd_parse(a),
    "scrape": lambda a: cmd_scrape(a[0]),
    "find": lambda a: cmd_find(a[0], a[1] if len(a) > 1 else None),
    "match": lambda a: cmd_match(a),
    "ingest": lambda a: cmd_ingest(a[0]),
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(1)
    COMMANDS[sys.argv[1]](sys.argv[2:])
