"""IMDb search & metadata engine with a layered provider strategy.

Primary provider — HTML scraping via ``imdb_scraper`` (no official/paid API):
  - Details: the title page's embedded ``__NEXT_DATA__`` JSON payload plus the
    parental-guide page (advisory categories + severity levels), person
    profiles (nm#######) and interest taxonomy links (in#######).
  - Search: IMDb's exact find URL
    ``https://www.imdb.com/find/?q=...&s=tt&exact=true&ttype=ft,tv`` parsed
    from its ``__NEXT_DATA__`` JSON (HTML fallback included).

Secondary providers (used only when scraping is blocked/unavailable):
  - IMDB_API_KEY set: imdb-api.com Title/CombinedCredits/ParentsGuide JSON.
  - Suggestion endpoint (v3.sg.media-imdb.com) for quick candidate lists.

Offline/demo mode (IMDB_FORCE_OFFLINE=1, or every provider failed):
  deterministic local pool so development and testing work without internet.

Provider order can be forced with IMDB_PROVIDER=scrape|api|offline.
"""
import logging
import os
import re
import json
import urllib.parse
import urllib.request

from . import imdb_scraper

log = logging.getLogger(__name__)

PROVIDER_ENV = "IMDB_PROVIDER"          # scrape (default) | api | offline

SEARCH_URL = "https://v3.sg.media-imdb.com/suggestion/x/{q}.json"
TITLE_URL = "https://imdb-api.com/en/API/Title/k_{key}/{tt}"
COMBINED_URL = "https://imdb-api.com/en/API/CombinedCredits/k_{key}/{tt}"
PARENTS_URL = "https://imdb-api.com/en/API/ParentalGuide/k_{key}/{tt}"
API_KEY_ENV = "IMDB_API_KEY"          # free tier: 100k calls/month
OFFLINE_FLAG = "IMDB_FORCE_OFFLINE"

_UA = {"User-Agent": "Mozilla/5.0 (MediaKArchive/1.0; self-hosted personal tool)"}

_SEVERITY_MAP = {"SEVERE": 9, "MODERATE": 6, "MILD": 3, "NONE": 0}


class ImdbError(Exception):
    pass


def _get_json(url, timeout=15):
    req = urllib.request.Request(url, headers=_UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


# ---------------------------------------------------------------------------
# Offline demo pool (mirrors the prototype's mockImdbPool concept)
# ---------------------------------------------------------------------------
_POOL = [
    {
        "imdb_id": "tt0133093", "title": "The Matrix", "title_original": "The Matrix",
        "year": 1999, "type": "movie", "mpa_rating": "R", "runtime_minutes": 136,
        "genres": ["Action", "Sci-Fi"], "imdb_rating": 8.7, "imdb_votes": 1804000,
        "synopsis": "A computer hacker learns about the true nature of his reality.",
        "languages": ["English"], "countries": ["United States"],
        "aspect_ratio": "2.39 : 1",
        "directors": [{"nm": "nm0001735", "name": "Lana Wachowski"},
                      {"nm": "nm0001736", "name": "Lilly Wachowski"}],
        "stars": [{"nm": "nm0000206", "name": "Keanu Reeves"},
                  {"nm": "nm0000460", "name": "Laurence Fishburne"},
                  {"nm": "nm0005251", "name": "Carrie-Anne Moss"}],
        "parents_guide": {"violence": 8, "profanity": 6, "sexual_content": 3,
                          "alcohol_drugs": 4, "frightening_scenes": 7},
    },
    {
        "imdb_id": "tt0111161", "title": "The Shawshank Redemption",
        "title_original": "The Shawshank Redemption",
        "year": 1994, "type": "movie", "mpa_rating": "R", "runtime_minutes": 142,
        "genres": ["Drama"], "imdb_rating": 9.3, "imdb_votes": 2900000,
        "synopsis": "Two imprisoned men bond over a number of years.",
        "languages": ["English"], "countries": ["United States"],
        "aspect_ratio": "1.85 : 1",
        "directors": [{"nm": "nm0001104", "name": "Frank Darabont"}],
        "stars": [{"nm": "nm0000151", "name": "Tim Robbins"},
                  {"nm": "nm0000375", "name": "Morgan Freeman"}],
        "parents_guide": {"violence": 6, "profanity": 5, "sexual_content": 2,
                          "alcohol_drugs": 2, "frightening_scenes": 4},
    },
    {
        "imdb_id": "tt0903747", "title": "Breaking Bad", "title_original": "Breaking Bad",
        "year": 2008, "end_year": 2013, "type": "series", "mpa_rating": "TV-MA",
        "runtime_minutes": 49, "genres": ["Crime", "Drama", "Thriller"],
        "imdb_rating": 9.5, "imdb_votes": 2100000,
        "synopsis": "A chemistry teacher diagnosed with cancer turns to manufacturing meth.",
        "languages": ["English", "Spanish"], "countries": ["United States"],
        "aspect_ratio": "1.78 : 1",
        "creators": [{"nm": "nm0184897", "name": "Vince Gilligan"}],
        "stars": [{"nm": "nm0000422", "name": "Bryan Cranston"},
                  {"nm": "nm0722629", "name": "Aaron Paul"}],
        "parents_guide": {"violence": 8, "profanity": 8, "sexual_content": 5,
                          "alcohol_drugs": 9, "frightening_scenes": 6},
    },
    {
        "imdb_id": "tt0944947", "title": "Game of Thrones", "title_original": "Game of Thrones",
        "year": 2011, "end_year": 2019, "type": "series", "mpa_rating": "TV-MA",
        "runtime_minutes": 57, "genres": ["Action", "Adventure", "Drama", "Fantasy"],
        "imdb_rating": 9.2, "imdb_votes": 2200000,
        "synopsis": "Noble families wage war for control of Westeros.",
        "languages": ["English"], "countries": ["United Kingdom", "United States"],
        "aspect_ratio": "1.78 : 1",
        "creators": [{"nm": "nm0194854", "name": "David Benioff"},
                     {"nm": "nm0010434", "name": "D.B. Weiss"}],
        "stars": [{"nm": "nm0322513", "name": "Emilia Clarke"},
                  {"nm": "nm0362760", "name": "Kit Harington"}],
        "parents_guide": {"violence": 9, "profanity": 8, "sexual_content": 8,
                          "alcohol_drugs": 5, "frightening_scenes": 7},
    },
    {
        "imdb_id": "tt1375666", "title": "Inception", "title_original": "Inception",
        "year": 2010, "type": "movie", "mpa_rating": "PG-13", "runtime_minutes": 148,
        "genres": ["Action", "Adventure", "Sci-Fi"], "imdb_rating": 8.8, "imdb_votes": 2450000,
        "synopsis": "A thief who steals corporate secrets through dream-sharing technology.",
        "languages": ["English", "Japanese", "French"],
        "countries": ["United States", "United Kingdom"],
        "aspect_ratio": "2.39 : 1",
        "directors": [{"nm": "nm0000233", "name": "Christopher Nolan"}],
        "stars": [{"nm": "nm0000138", "name": "Leonardo DiCaprio"},
                  {"nm": "nm0001510", "name": "Tom Hardy"}],
        "parents_guide": {"violence": 6, "profanity": 4, "sexual_content": 1,
                          "alcohol_drugs": 2, "frightening_scenes": 5},
    },
]


def _offline_search(query, year=None, media_type=None):
    q = query.lower()
    out = []
    for it in _POOL:
        if media_type and it["type"] != media_type:
            continue
        if q in it["title"].lower():
            score = 1.0 if it["title"].lower() == q else 0.8
            if year and it.get("year") == int(year):
                score += 0.1
            out.append({
                "imdb_id": it["imdb_id"], "title": it["title"], "year": it.get("year"),
                "media_type": it["type"], "poster_url": "",
                "approx_match_score": round(score, 2),
            })
    return out


def _offline_details(imdb_id):
    for it in _POOL:
        if it["imdb_id"] == imdb_id:
            return dict(it)
    return None


# ---------------------------------------------------------------------------
# Live providers
# ---------------------------------------------------------------------------
def _live_search(query, year=None, media_type=None):
    data = _get_json(SEARCH_URL.format(q=urllib.parse.quote(query)))
    candidates = []
    for m in data.get("d", []):
        kind = m.get("q", "")
        t = "series" if kind == "TV series" else \
            "movie" if kind in ("Feature", "Movie", "TV movie", "Short") else None
        if not t or (media_type and t != media_type):
            continue
        y = m.get("y")
        if year and y and abs(int(y) - int(year)) > 1:
            continue
        candidates.append({
            "imdb_id": m.get("id"),
            "title": m.get("l", ""),
            "year": y,
            "media_type": t,
            "poster_url": m.get("i") or "",
        })
    ql = query.lower()
    candidates.sort(key=lambda c: c["title"].lower() != ql)
    return candidates[:10]


def _normalize_live(raw, credits=None, parents=None):
    """Map imdb-api.com payloads into our canonical details shape."""
    def people(rows):
        return [{"nm": p.get("id") or (p.get("n") or {}).get("id"),
                 "name": p.get("name") or (p.get("n") or {}).get("name")}
                for p in rows or []
                if (p.get("id") or (p.get("n") or {}).get("id"))]

    genres_field = raw.get("genresString") or raw.get("genres") or ""
    if isinstance(genres_field, str):
        genres = [g.strip() for g in re.split(r"[,;]", genres_field) if g.strip()]
    else:
        genres = [g.get("genre") for g in genres_field if g.get("genre")]

    directors, creators, stars = [], [], []
    if credits:
        directors = people([{"id": d.get("id"), "name": d.get("name")}
                            for d in (credits.get("directors") or [])])
        creators = people([{"id": c.get("id"), "name": c.get("name")}
                           for c in (credits.get("creators") or [])])
        stars = people([{"id": (c.get("actor") or {}).get("id"),
                         "name": (c.get("actor") or {}).get("name")}
                        for c in (credits.get("casts") or [])])
    else:
        directors = people(raw.get("directorList") or [])
        star_cards = raw.get("starCards") or []
        stars = people(star_cards[0].get("stars") if star_cards else [])

    pg = {}
    if parents:
        mapping = {"violence": "violence", "profanity": "profanity",
                   "sexualContent": "sexual_content", "alcoholAndDrugs": "alcohol_drugs",
                   "frighteningScenes": "frightening_scenes"}
        for src, dst in mapping.items():
            adv = parents.get(src)
            if isinstance(adv, dict):
                pg[dst] = _SEVERITY_MAP.get(str(adv.get("label", "")).upper(), 0)

    rating = raw.get("imdbRating") or {}
    cert = raw.get("certificateAge")
    runtime = raw.get("runtimesMinutes")
    image = raw.get("image")
    aspects = raw.get("aspects") or []
    langs = raw.get("languageCodes") or []
    countries = raw.get("countriesOfOrigin") or []
    return {
        "imdb_id": raw.get("id"),
        "title": raw.get("title", ""),
        "title_original": raw.get("originalTitle") or raw.get("title", ""),
        "year": raw.get("year"),
        "end_year": raw.get("endYear"),
        "type": "series" if raw.get("type") == "series" else "movie",
        "mpa_rating": cert.get("imdbRating", "") if isinstance(cert, dict) else raw.get("mpaaRated", ""),
        "runtime_minutes": runtime.get("value") if isinstance(runtime, dict) else raw.get("runtime"),
        "genres": genres,
        "imdb_rating": float(rating.get("value") or 0) if isinstance(rating, dict) else raw.get("rating"),
        "imdb_votes": int(rating.get("voteCount") or 0) if isinstance(rating, dict) else raw.get("votes"),
        "synopsis": raw.get("outline") or raw.get("synopsis") or "",
        "poster_url": image.get("url") if isinstance(image, dict) else "",
        "languages": [l.get("text") for l in langs if isinstance(l, dict)]
                     or raw.get("languagesOfOriginal") or [],
        "countries": [c.get("text") for c in countries if isinstance(c, dict)]
                     or raw.get("countryCodesOfOrigin") or [],
        "aspect_ratio": (aspects[0] if isinstance(aspects, list) and aspects else ""),
        "directors": directors[:10],
        "creators": creators[:5],
        "stars": stars[:15],
        "parents_guide": pg,
    }


def _live_details(imdb_id):
    key = os.environ.get(API_KEY_ENV, "")
    if not key:
        raise ImdbError(
            f"{API_KEY_ENV} is not set. Either provide an imdb-api.com key "
            f"or run with {OFFLINE_FLAG}=1 to use the offline demo pool.")
    raw = _get_json(TITLE_URL.format(key=key, tt=imdb_id))
    credits = parents = None
    try:
        credits = _get_json(COMBINED_URL.format(key=key, tt=imdb_id))
    except Exception:
        pass
    try:
        parents = _get_json(PARENTS_URL.format(key=key, tt=imdb_id))
    except Exception:
        pass
    return _normalize_live(raw, credits, parents)


# ---------------------------------------------------------------------------
# Provider selection
# ---------------------------------------------------------------------------
def forced_provider():
    return (os.environ.get(PROVIDER_ENV) or "").strip().lower()


def is_offline():
    if forced_provider() == "offline":
        return True
    return os.environ.get(OFFLINE_FLAG, "") == "1"


def scraping_enabled():
    provider = forced_provider()
    if provider == "offline":
        return False
    if provider == "api":
        return bool(os.environ.get(API_KEY_ENV)) and False  # api-only mode
    return not is_offline()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def search_titles(query, year=None, media_type=None):
    """Candidate list [{imdb_id,title,year,media_type,poster_url}] for user verification.

    Layered providers: __NEXT_DATA__ /find/ scrape -> suggestion endpoint ->
    imdb-api.com key -> offline demo pool. Each candidate carries a ``source``
    key so callers can tell whether the data is real scraped IMDb data.
    """
    if scraping_enabled():
        try:
            results = imdb_scraper.scrape_find(query, year, media_type)
            if results:
                for r in results:
                    r.setdefault("source", "next_data_scrape")
                return results
            log.warning("Find scrape returned 0 candidates for %r; trying next provider",
                        query)
        except Exception as exc:  # noqa: BLE001 - provider fallback chain
            log.warning("IMDb find scrape failed (%s); trying next provider", exc)
    if not is_offline():
        try:
            out = _live_search(query, year, media_type)
            for r in out or []:
                r.setdefault("source", "html_fallback")
            return out
        except Exception as exc:  # noqa: BLE001
            log.warning("IMDb live search failed (%s); falling back to offline pool", exc)
    out = _offline_search(query, year, media_type)
    for r in out or []:
        r.setdefault("source", "offline_pool")
    return out


def get_title_details(imdb_id):
    """Full canonical metadata for a verified imdb_id, or None if unknown.

    Layered providers: __NEXT_DATA__ title+parentalguide scrape ->
    imdb-api.com (key required) -> offline demo pool. The returned dict's
    ``source`` key identifies which provider answered.
    """
    if scraping_enabled():
        try:
            details = imdb_scraper.scrape_title_details(imdb_id)
            if details and details.get("title"):
                return details
            log.warning("Title scrape returned no usable data for %s", imdb_id)
        except Exception as exc:  # noqa: BLE001 - provider fallback chain
            log.warning("IMDb title scrape failed for %s (%s)", imdb_id, exc)
    if not is_offline() and os.environ.get(API_KEY_ENV):
        try:
            return _live_details(imdb_id)
        except Exception as exc:  # noqa: BLE001
            log.warning("IMDb api details failed for %s (%s)", imdb_id, exc)
    return _offline_details(imdb_id)
