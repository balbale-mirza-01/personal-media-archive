"""Batch query processing & matching (User Story 3).

Takes a mixed bulk list — one item per line, each line being an IMDb id,
an IMDb URL, a clean title (optionally with year) or a messy release-style
filename — and produces a review table of suggested matches:

    {query, parsed_title, year, status, confidence, imdb_id, match_title,
     match_year, imdb_url, candidates[]}

Matching strategy per line:
  1. Exact IMDb id/URL  -> verified immediately (confidence 1.0); we still
     fetch lightweight details so the UI can show the real title/year.
  2. Title (+year)      -> User-Story-2 search (IMDb /find/ __NEXT_DATA__
     scrape with layered fallbacks). The top candidate is auto-accepted when
     its normalized title equals the guess (and the year matches within ±1):
     confidence >= 0.95 -> "auto_matched". Otherwise the ranked candidate
     list is returned for manual review ("needs_review").
  3. Nothing found      -> "no_match" (the UI lets the user paste an exact
     tt####### id which flows back through ingest as User Story 1).

Nothing is written to the database here; confirmed rows are imported via the
existing /ingest/ endpoint (bulk import/update = User Story 1 applied in
batch).
"""
import logging
import re
import time

from . import imdb_scraper
from .filename_parser import parse_query_line
from .imdb_client import get_title_details, search_titles

log = logging.getLogger(__name__)

IMDB_TITLE_URL = "https://www.imdb.com/title/{imdb_id}/"

# Confidence at/above which a suggestion is auto-confirmed in the UI.
AUTO_CONFIDENCE = 0.9


def _norm(s):
    """Normalize a title for comparison: lowercase, alnum-only."""
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _candidate_row(c):
    imdb_id = c.get("imdb_id") or ""
    return {
        "imdb_id": imdb_id,
        "title": c.get("title") or "",
        "year": c.get("year"),
        "media_type": c.get("media_type") or "movie",
        "poster_url": c.get("poster_url") or "",
        "imdb_url": IMDB_TITLE_URL.format(imdb_id=imdb_id) if imdb_id else "",
        "score": c.get("approx_match_score"),
    }


def _verify_imdb_id(imdb_id):
    """Best-effort title/year lookup for an explicit IMDb id (offline-safe)."""
    try:
        details = get_title_details(imdb_id)
    except Exception as exc:  # noqa: BLE001 - verification is advisory only
        log.warning("Details lookup failed for %s: %s", imdb_id, exc)
        details = None
    if not details:
        return {"title": "", "year": None, "media_type": "movie", "source": ""}
    return {
        "title": details.get("title") or "",
        "year": details.get("year"),
        "media_type": details.get("type") or "movie",
        "source": details.get("source") or "",
    }


def match_line(parsed):
    """Resolve one parsed query line into a review row."""
    raw = parsed["raw"]
    row = {
        "query": raw,
        "parsed_title": parsed.get("title_guess") or "",
        "year": parsed.get("year"),
        "kind": parsed.get("kind") or "title",
        "status": "no_match",
        "confidence": 0.0,
        "imdb_id": "",
        "match_title": "",
        "match_year": None,
        "media_type": parsed.get("season") is not None and "series" or "movie",
        "imdb_url": "",
        "candidates": [],
        "source": "",  # which provider answered (next_data_scrape / offline ...)
    }

    # --- 1) Explicit IMDb id / URL ------------------------------------------
    if parsed.get("kind") == "imdb_id" and parsed.get("imdb_id"):
        imdb_id = parsed["imdb_id"]
        info = _verify_imdb_id(imdb_id)
        row.update(
            status="verified_id",
            confidence=1.0,
            imdb_id=imdb_id,
            match_title=info["title"],
            match_year=info["year"],
            media_type=info["media_type"],
            imdb_url=IMDB_TITLE_URL.format(imdb_id=imdb_id),
            source=info.get("source") or "",
        )
        row["candidates"] = [_candidate_row({
            "imdb_id": imdb_id, "title": info["title"], "year": info["year"],
            "media_type": info["media_type"], "approx_match_score": 1.0,
        })]
        return row

    # --- 2) Title search ------------------------------------------------------
    guess = parsed.get("title_guess") or raw
    if not guess:
        return row
    year = parsed.get("year")
    media_type = "series" if parsed.get("season") is not None else None
    try:
        candidates = search_titles(guess, year, media_type) or []
    except Exception as exc:  # noqa: BLE001 - keep the batch going
        log.warning("Search failed for %r: %s", guess, exc)
        candidates = []
    if candidates:
        row["source"] = str(candidates[0].get("source") or "")
    # For episode lines without explicit series type, also allow series hits.
    if not candidates and parsed.get("season") is not None:
        try:
            candidates = search_titles(guess, year, "series") or []
        except Exception:  # noqa: BLE001
            candidates = []

    row["candidates"] = [_candidate_row(c) for c in candidates[:10]]
    if not row["candidates"]:
        return row

    best = row["candidates"][0]
    norm_guess, norm_best = _norm(guess), _norm(best["title"])
    score = 0.0
    if norm_guess and norm_best:
        if norm_guess == norm_best:
            score = 0.9
        elif norm_best.startswith(norm_guess) or norm_guess.startswith(norm_best):
            score = 0.75
        elif set(norm_guess.split()) <= set(norm_best.split()):
            score = 0.6
    if year:
        if best["year"] == year:
            score += 0.1
        elif best["year"] and abs(int(best["year"]) - int(year)) <= 1:
            score += 0.04
        elif best["year"]:
            score -= 0.25  # clear year mismatch demotes confidence
    score = max(0.0, min(1.0, round(score, 2)))

    row["confidence"] = score
    if score >= AUTO_CONFIDENCE:
        row.update(status="auto_matched", imdb_id=best["imdb_id"],
                   match_title=best["title"], match_year=best["year"],
                   media_type=best["media_type"], imdb_url=best["imdb_url"])
    else:
        row.update(status="needs_review",
                   match_title=best["title"], match_year=best["year"],
                   media_type=best.get("media_type") or "movie")
    return row


def bulk_match_lines(lines, delay_ms=0):
    """Process a mixed list of query strings -> review rows (in order).

    Also returns ``scrape_logs``: the scraper's own DEBUG/INFO log lines
    captured during the batch (one HTTP attempt per line), so callers/UI can
    verify whether real IMDb scraping worked or every request hit the WAF.
    """
    rows = []
    with imdb_scraper.scrape_log_capture() as collector:
        for i, line in enumerate(lines):
            parsed = parse_query_line(line)
            if not parsed["raw"]:
                continue
            rows.append(match_line(parsed))
            if delay_ms and i < len(lines) - 1:
                time.sleep(delay_ms / 1000.0)
    summary = {
        "total": len(rows),
        "auto_matched": sum(1 for r in rows if r["status"] == "auto_matched"),
        "verified_id": sum(1 for r in rows if r["status"] == "verified_id"),
        "needs_review": sum(1 for r in rows if r["status"] == "needs_review"),
        "no_match": sum(1 for r in rows if r["status"] == "no_match"),
        "real_scraped": sum(1 for r in rows if "next_data" in str(r.get("source", ""))),
    }
    return rows, summary, list(collector.records)
