"""IMDb HTML scraper built around the embedded ``__NEXT_DATA__`` JSON payload.

No official (paid) IMDb API is used. Every page we scrape — title pages,
parental guides, /find/ search results and person profiles — embeds a rich
JSON blob inside::

    <script id="__NEXT_DATA__" type="application/json">{...}</script>

Strategy (per the project's core scraping rule):

1. Fetch the page with browser-like headers (User-Agent + Accept-Language).
2. Locate the ``__NEXT_DATA__`` script tag and parse its JSON.
3. Walk the ``props.pageProps.serverApp.data`` normalized GraphQL cache and
   resolve the interesting nodes by their GraphQL fragment names
   ("TitleTitleName", "TitleMainDetails", "TitleParentalGuideTypesAndAdvisories",
   "NameMainDetails", ...). The cache keys are opaque hashes that change
   between deployments, so we never hard-code ids — only stable fragments.
4. Fall back to plain HTML parsing (BeautifulSoup) when the JSON node or the
   whole payload is missing.

Public helpers return the same canonical dict shape as ``imdb_client``
(see ``_normalize_live``) so the ingest pipeline stays provider-agnostic.
"""
import contextlib
import json
import logging
import os
import re
import threading
import time
import urllib.parse

import requests
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)


class ScrapeLogCollector(logging.Handler):
    """Captures imdb_scraper/imdb_client log records into an in-memory list.

    Used by the scraper diagnostic endpoint so the frontend can show detailed
    per-request logs (HTTP status, WAF detection, __NEXT_DATA__ presence ...).
    """

    def __init__(self, level=logging.DEBUG):
        super().__init__(level=level)
        self.records = []
        self.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s",
                              datefmt="%H:%M:%S"))

    def emit(self, record):
        try:
            self.records.append(self.format(record))
        except Exception:  # noqa: BLE001 - never break logging
            pass


@contextlib.contextmanager
def scrape_log_capture(level=logging.DEBUG):
    """Attach a collector to this module's logger; yields the collector."""
    collector = ScrapeLogCollector(level)
    for name in ("media.imdb_scraper", "media.imdb_client"):
        logging.getLogger(name).addHandler(collector)
    try:
        yield collector
    finally:
        for name in ("media.imdb_scraper", "media.imdb_client"):
            logging.getLogger(name).removeHandler(collector)

BASE_URL = "https://www.imdb.com"
TITLE_URL = BASE_URL + "/title/{imdb_id}/"
PARENTAL_URL = BASE_URL + "/title/{imdb_id}/parentalguide/"
NAME_URL = BASE_URL + "/name/{nm_id}/"
FIND_URL = BASE_URL + "/find/?q={query}&s=tt&exact=true&ttype=ft,tv"

# Browser-like headers; without these IMDb's AWS WAF answers 202/403.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
}

TIMEOUT = 20
RETRIES = 3
BACKOFF = 1.6

_IMDB_ID_RE = re.compile(r"^(tt\d{7,10})$")
_NM_ID_RE = re.compile(r"^(nm\d{6,9})$")

# Parental-guide advisory categories shown on IMDb's certificate page.
PG_CATEGORY_KEYS = [
    "sex_nudity",
    "violence_gore",
    "profanity",
    "alcohol_drugs",
    "frightening_intense",
]
PG_CATEGORY_LABELS = {
    "sex_nudity": "Sex & Nudity",
    "violence_gore": "Violence & Gore",
    "profanity": "Profanity",
    "alcohol_drugs": "Alcohol, Drugs & Smoking",
    "frightening_intense": "Frightening & Intense Scenes",
}
_SEVERITY_RANK = {"none": 0, "mild": 3, "moderate": 6, "severe": 9}


class ImdbScrapeError(Exception):
    """Raised when a page could not be fetched/parsed at all."""


# ---------------------------------------------------------------------------
# HTTP layer
# ---------------------------------------------------------------------------
_session = None
_tls = threading.local()


def set_request_credentials(aws_waf_token=None, user_agent=None):
    """Install per-thread scraper credentials for the next requests.

    Manual workaround for IMDb's AWS WAF (``aws-waf-token`` cookie) block:
    the user pastes the token copied from their browser's IMDB response
    cookies plus the matching User-Agent; every subsequent scrape request on
    this thread is sent with that cookie/UA. Pass ``None`` values to clear.
    Returns the active credential dict (for logging).
    """
    creds = getattr(_tls, "creds", None)
    if creds is None:
        creds = _tls.creds = {}
    if aws_waf_token is not None:
        tok = str(aws_waf_token).strip()
        # Tolerate users pasting "aws-waf-token=..." or a full cookie header.
        tok = re.sub(r"^aws-waf-token\s*=\s*", "", tok)
        tok = tok.split(";")[0].strip().strip('"')
        if tok:
            creds["aws_waf_token"] = tok
        else:
            creds.pop("aws_waf_token", None)
    if user_agent is not None:
        ua = str(user_agent).strip()
        if ua:
            creds["user_agent"] = ua
        else:
            creds.pop("user_agent", None)
    return dict(creds)


def get_request_credentials():
    return dict(getattr(_tls, "creds", {}) or {})


def clear_request_credentials():
    _tls.creds = {}


def _build_session(creds):
    """Fresh requests.Session configured with browser + optional WAF creds."""
    s = requests.Session()
    headers = dict(HEADERS)
    ua = creds.get("user_agent") or os.environ.get("IMDB_USER_AGENT") or ""
    if ua:
        headers["User-Agent"] = ua
    s.headers.update(headers)
    token = creds.get("aws_waf_token") or os.environ.get("IMDB_WAF_TOKEN") or ""
    if token:
        s.cookies.set("aws-waf-token", token, domain=".imdb.com")
        log.info("Using manual aws-waf-token (%d chars) + custom UA=%s",
                 len(token), bool(ua))
    elif ua:
        log.info("Using custom User-Agent only (no aws-waf-token supplied)")
    return s


def _get_session():
    global _session
    creds = get_request_credentials()
    if creds.get("aws_waf_token") or creds.get("user_agent"):
        # Manual credentials present -> dedicated session for this thread.
        return _build_session(creds)
    if os.environ.get("IMDB_WAF_TOKEN") or os.environ.get("IMDB_USER_AGENT"):
        return _build_session({})
    if _session is None:
        _session = _build_session({})
    return _session


def _looks_like_waf_challenge(resp):
    """True when the response is an AWS WAF interstitial / challenge page."""
    try:
        body = resp.text[:4000].lower()
    except Exception:  # noqa: BLE001
        return False
    return ("x-amzn-waf-action" in body or "aws waf" in body
            or "captcha" in body and "waf" in body)


def fetch_html(url, timeout=TIMEOUT, retries=RETRIES):
    """GET an IMDb page with retry/backoff. Returns HTML text or raises.

    Logs every attempt at INFO level (status, elapsed ms, bytes, verdict) so
    the frontend diagnostic panel can show whether scraping really works.
    """
    last_exc = None
    for attempt in range(retries):
        t0 = time.time()
        try:
            resp = _get_session().get(url, timeout=timeout, allow_redirects=True)
            ms = int((time.time() - t0) * 1000)
            has_nd = "__NEXT_DATA__" in resp.text
            log.info("GET %s -> HTTP %s in %dms, %d bytes, __NEXT_DATA__=%s",
                     url, resp.status_code, ms, len(resp.text), has_nd)
            # 202 = AWS WAF challenge interstitial -> retry with backoff.
            if resp.status_code == 202 or resp.status_code == 429:
                last_exc = ImdbScrapeError(
                    f"HTTP {resp.status_code} — AWS WAF bot challenge on {url}. "
                    "Paste a fresh 'aws-waf-token' cookie + matching User-Agent "
                    "in the Scraper Diagnostics panel.")
                log.warning("WAF challenge detected (HTTP %s, attempt %d/%d) for %s",
                            resp.status_code, attempt + 1, retries, url)
                time.sleep(BACKOFF ** (attempt + 1))
                continue
            if resp.status_code == 403:
                last_exc = ImdbScrapeError(
                    f"HTTP 403 — blocked by AWS WAF on {url}. The aws-waf-token "
                    "is missing/expired or the User-Agent does not match the "
                    "browser session it was captured from.")
                log.warning("HTTP 403 blocked (attempt %d/%d) for %s",
                            attempt + 1, retries, url)
                time.sleep(BACKOFF ** (attempt + 1))
                continue
            if resp.status_code == 404:
                log.info("HTTP 404 (title/person not found) for %s", url)
                raise ImdbScrapeError(f"HTTP 404 for {url}")
            resp.raise_for_status()
            text = resp.text
            if not has_nd and len(text) < 5000:
                last_exc = ImdbScrapeError(
                    f"WAF challenge page without content ({len(text)} bytes, "
                    f"no __NEXT_DATA__) for {url}")
                log.warning("Challenge-like response (attempt %d/%d): %s",
                            attempt + 1, retries, url)
                time.sleep(BACKOFF ** (attempt + 1))
                continue
            if _looks_like_waf_challenge(resp) and not has_nd:
                last_exc = ImdbScrapeError(
                    f"AWS WAF captcha interstitial returned for {url} "
                    "(aws-waf-token expired?)")
                log.warning("WAF captcha body detected for %s", url)
                time.sleep(BACKOFF ** (attempt + 1))
                continue
            return text
        except ImdbScrapeError as exc:
            if attempt == retries - 1 or "404" in str(exc):
                raise
            last_exc = exc
        except requests.RequestException as exc:
            last_exc = exc
            log.warning("Network error fetching %s (attempt %d/%d): %r",
                        url, attempt + 1, retries, exc)
            time.sleep(BACKOFF ** (attempt + 1))
    raise ImdbScrapeError(f"Failed to fetch {url}: {last_exc}")


# ---------------------------------------------------------------------------
# __NEXT_DATA__ extraction
# ---------------------------------------------------------------------------
_NEXT_RE = re.compile(
    r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL
)


def extract_next_data(html):
    """Parse the ``__NEXT_DATA__`` script tag into a dict (None if absent)."""
    m = _NEXT_RE.search(html)
    if not m:
        # Defensive fallback: some pages inline it differently.
        soup = BeautifulSoup(html, "html.parser")
        tag = soup.find("script", id="__NEXT_DATA__")
        if not tag or not tag.string:
            return None
        raw = tag.string
    else:
        raw = m.group(1)
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        log.warning("__NEXT_DATA__ JSON decode failed (%d bytes)", len(raw or ""))
        return None


def next_data_cache(next_data):
    """Return the GraphQL-ish entity cache dict (may be empty)."""
    try:
        return (
            next_data["props"]["pageProps"]["serverApp"]["data"]
            or {}
        )
    except (KeyError, TypeError):
        return {}


def iter_nodes(cache):
    if not isinstance(cache, dict):
        return
    for node in cache.values():
        if isinstance(node, dict):
            yield node


def find_node(cache, *fragments):
    """First cached node whose __typename contains one of ``fragments``."""
    for node in iter_nodes(cache):
        t = str(node.get("__typename", ""))
        if any(f in t for f in fragments):
            return node
    return None


def find_all_nodes(cache, *fragments):
    out = []
    for node in iter_nodes(cache):
        t = str(node.get("__typename", ""))
        if any(f in t for f in fragments):
            out.append(node)
    return out


def deref(cache, value):
    """Resolve a {'__ref': 'key'} pointer to its cached node."""
    if isinstance(value, dict) and "__ref" in value:
        return cache.get(value["__ref"])
    return value


def deref_list(cache, values):
    out = []
    for v in values or []:
        node = deref(cache, v)
        if isinstance(node, dict):
            out.append(node)
    return out


# ---------------------------------------------------------------------------
# Small normalizers
# ---------------------------------------------------------------------------
def norm_severity(label):
    low = (label or "").strip().lower()
    for key, rank in _SEVERITY_RANK.items():
        if low.startswith(key):
            return key, rank
    return "mild", 3


def year_from_date(date_str):
    m = re.match(r"\d{4}", date_str or "")
    return int(m.group(0)) if m else None


def runtime_minutes(runtime_node):
    if not isinstance(runtime_node, dict):
        return None
    secs = runtime_node.get("seconds") or runtime_node.get("totalTimeSeconds")
    if secs:
        try:
            return max(1, int(int(secs) / 60))
        except (TypeError, ValueError):
            return None
    txt = runtime_node.get("secondsText") or runtime_node.get("attribute") or ""
    m = re.search(r"(\d+)", str(txt))
    return int(m.group(1)) if m else None


def poster_url(image_node):
    if not isinstance(image_node, dict):
        return ""
    url = image_node.get("url") or ""
    if url:
        # Upgrade to a decent fixed width while keeping the CDN URL valid.
        base = url.split("._")[0]
        return f"{base}._V1_FMjpg_UX500_.jpg" if "/MV" in base or "@." in url else url
    return ""


def split_person_name(full_name):
    parts = (full_name or "").strip().split(" ", 1)
    first = parts[0] if parts else ""
    last = parts[1] if len(parts) > 1 else ""
    return first, last


# ---------------------------------------------------------------------------
# Title details (User Story 1)
# ---------------------------------------------------------------------------
def scrape_title_details(imdb_id):
    """Scrape ``https://www.imdb.com/title/tt…/`` (+ parental guide) fully.

    Returns the canonical details dict, or None when the title does not exist.
    Raises ImdbScrapeError on unrecoverable network/parse failures.
    """
    imdb_id = (imdb_id or "").strip()
    if not _IMDB_ID_RE.match(imdb_id):
        raise ImdbScrapeError(f"Invalid IMDb title id: {imdb_id!r}")

    html = fetch_html(TITLE_URL.format(imdb_id=imdb_id))
    nd = extract_next_data(html)
    if nd is None:
        log.warning("No __NEXT_DATA__ payload on title page %s -> HTML fallback", imdb_id)
        return _scrape_title_details_html(imdb_id, html)

    cache = next_data_cache(nd)
    title = find_node(cache, "TitleName")
    if not title:
        log.warning("__NEXT_DATA__ present but no TitleName node for %s (%d cache keys)"
                    " -> HTML fallback", imdb_id, len(cache))
        return _scrape_title_details_html(imdb_id, html)

    meta = title.get("titleText") or {}
    if not isinstance(meta, dict):
        meta = {}
    release = title.get("releaseYear") or {}
    title_year = release.get("year") if isinstance(release, dict) else None
    end_year = release.get("endYear") if isinstance(release, dict) else None

    main = find_node(cache, "TitleMainDetails") or {}
    plot_node = main.get("plot") or title.get("plot") or {}
    synopsis = (
        (plot_node.get("simpleText") or plot_node.get("text"))
        if isinstance(plot_node, dict) else None
    ) or title.get("outline") or ""

    genres = []
    genre_refs = []
    gnode = main.get("genres") or title.get("genres") or {}
    if isinstance(gnode, dict):
        genre_refs = gnode.get("edges") or gnode.get("genreList") or gnode.get("values") or []
    elif isinstance(gnode, list):
        genre_refs = gnode
    for edge in genre_refs:
        if isinstance(edge, dict):
            node = edge.get("node") if "node" in edge else edge
            name = (node or {}).get("text") or (node or {}).get("genre") or ""
            href = ((node or {}).get("url") or "") + (edge.get("href") or "")
            if name:
                m = re.search(r"(in\d+)", href or "")
                genres.append({"name": name, "imdb_genre_id": m.group(1) if m else "",
                               "genre_type": "main"})

    # Sub-genres / interests (IMDb interest taxonomy links /interest/in#######/).
    interest_edges = []
    inode = main.get("interests") or title.get("interests") or {}
    if isinstance(inode, dict):
        interest_edges = inode.get("edges") or []
    seen = {g["name"].lower() for g in genres}
    for edge in interest_edges[:8]:
        node = (edge or {}).get("node") or {}
        name = node.get("name") or ""
        href = node.get("url") or ""
        m = re.search(r"(in\d+)", href)
        if name and name.lower() not in seen:
            seen.add(name.lower())
            genres.append({"name": name,
                           "imdb_genre_id": m.group(1) if m else "",
                           "genre_type": "sub"})

    ratings = title.get("ratingsMetadata") or main.get("ratingsMetadata") or {}
    rating_summary = ratings.get("ratingCount") or ratings
    user_rating = None
    votes = None
    if isinstance(rating_summary, dict):
        ur = rating_summary.get("meanRating")
        if isinstance(ur, dict):
            ur = ur.get("original")
        if ur is not None:
            try:
                user_rating = round(float(ur), 1)
            except (TypeError, ValueError):
                user_rating = None
        vc = rating_summary.get("count")
        if isinstance(vc, dict):
            vc = vc.get("original") or vc.get("extended")
        if vc is not None:
            try:
                votes = int(str(vc).replace(",", ""))
            except (TypeError, ValueError):
                votes = None
    if user_rating is None:
        rm = find_node(cache, "TitleRatingsCategory") or {}
        ar = rm.get("aggregateRating") or {}
        try:
            user_rating = round(float(ar.get("ratingValue")), 1)
            votes = int(str(ar.get("ratingCount")).replace(",", ""))
        except (TypeError, ValueError):
            pass

    certificate = ""
    cert_node = main.get("certificate") or title.get("certificate") or {}
    if isinstance(cert_node, dict):
        inner = cert_node.get("certificate") or cert_node
        certificate = inner.get("impalaRate") or inner.get("label") or ""
        if isinstance(certificate, dict):
            certificate = certificate.get("value") or ""

    rt_min = runtime_minutes(main.get("runtime") or title.get("runtime"))

    languages = []
    lnode = main.get("languageQuality") or main.get("languages") or {}
    for edge in (lnode.get("edges") if isinstance(lnode, dict) else []) or []:
        text = ((edge or {}).get("node") or {}).get("text") or (edge or {}).get("language")
        if text:
            languages.append(text)
    countries = []
    cnode = main.get("countryOfOriginQuality") or main.get("countries") or {}
    for edge in (cnode.get("edges") if isinstance(cnode, dict) else []) or []:
        text = ((edge or {}).get("node") or {}).get("text") or (edge or {}).get("country")
        if text:
            countries.append(text)

    aspect = ""
    anode = main.get("aspectRatio") or title.get("aspectRatio") or {}
    if isinstance(anode, dict):
        aspect = anode.get("attribute") or anode.get("text") or ""

    directors, creators, stars = [], [], []
    credit_edge_root = (
        title.get("credits") or main.get("credits")
        or find_node(cache, "TitleCredits") or {}
    )
    edges = credit_edge_root.get("edges") if isinstance(credit_edge_root, dict) else []
    for edge in edges or []:
        node = (edge or {}).get("node") or {}
        name_node = node.get("name") or {}
        nm = name_node.get("id") or ""
        person_name = name_node.get("name") or ""
        category = (node.get("category") or {}).get("text", "").lower() \
            if isinstance(node.get("category"), dict) else ""
        characters = [c.get("name") for c in (node.get("characters") or [])
                      if isinstance(c, dict) and c.get("name")]
        entry = {"nm": nm, "name": person_name, "characters": characters}
        if not nm:
            continue
        if category == "director":
            directors.append(entry)
        elif category == "creator":
            creators.append(entry)
        elif category == "actor" and len(stars) < 15:
            stars.append(entry)

    # Fallback credits from the summary blocks when the big credits blob
    # isn't referenced from the title page cache.
    if not directors and not stars:
        for key, target in (("directors", directors), ("creator", creators),
                           ("stars", stars)):
            block = main.get(key) or title.get(key) or {}
            rows = []
            if isinstance(block, dict):
                rows = block.get("edges") or block.get("credits") or block.get("values") or []
            for row in rows:
                node = (row or {}).get("node") or row or {}
                nm = node.get("id") or ((node.get("name") or {}).get("id")) or ""
                pname = (node.get("name") if isinstance(node.get("name"), str)
                         else (node.get("name") or {}).get("name")) or ""
                if nm:
                    target.append({"nm": nm, "name": pname, "characters": []})

    ttype = title.get("titleType") or {}
    tt_id = ttype.get("id") if isinstance(ttype, dict) else ""
    tt_text = str(ttype.get("text", "")).lower() if isinstance(ttype, dict) else ""
    media_type = "series" if tt_id in ("tvSeries", "tvMiniSeries") or "series" in tt_text else "movie"

    orig = title.get("originalTitleText")
    log.info("__NEXT_DATA__ parsed OK for %s: title=%r year=%s rating=%s votes=%s "
             "genres=%d directors=%d stars=%d cache_nodes=%d",
             imdb_id, meta.get("text"), title_year, user_rating, votes,
             len(genres), len(directors), len(stars), len(cache))
    details = {
        "imdb_id": title.get("id") or imdb_id,
        "title": meta.get("text") or "",
        "title_original": orig.get("text") if isinstance(orig, dict) else (orig or ""),
        "year": title_year,
        "end_year": end_year,
        "type": media_type,
        "mpa_rating": certificate,
        "runtime_minutes": rt_min,
        "genres": genres,
        "imdb_rating": user_rating,
        "imdb_votes": votes,
        "synopsis": synopsis,
        "poster_url": poster_url(title.get("titleImage") or main.get("titleImage") or {}),
        "languages": languages,
        "countries": countries,
        "aspect_ratio": aspect,
        "directors": directors[:10],
        "creators": creators[:5],
        "stars": stars[:15],
        "parents_guide": {},
        "source": "next_data_scrape",
    }
    # Enrich persons (first/last/original name, bio, photo) via /name/nm…/.
    _enrich_people(details)

    # Parental guide page.
    try:
        pg = scrape_parental_guide(imdb_id)
        details["parents_guide"] = pg
        log.info("Parental guide for %s: %d categor(y/ies) extracted (%s)",
                 imdb_id, len(pg.get("categories") or {}),
                 ", ".join((pg.get("categories") or {}).keys()) or "none")
    except Exception as exc:  # noqa: BLE001 - advisory data is optional
        log.warning("Parental guide scrape failed for %s: %s", imdb_id, exc)

    return details


def _enrich_people(details):
    """Fetch each credited person's profile page for name/bio/photo split."""
    todo = []
    for key in ("directors", "creators", "stars"):
        for p in details.get(key) or []:
            if p.get("nm") and p["nm"] not in {t[0] for t in todo}:
                todo.append((p["nm"], p))
    for nm, p in todo[:20]:
        try:
            info = scrape_person_profile(nm)
        except Exception:  # noqa: BLE001 - enrichment is best-effort
            continue
        if not info:
            continue
        p["first_name"] = info.get("first_name") or p.get("first_name") or ""
        p["last_name"] = info.get("last_name") or p.get("last_name") or ""
        p["original_name"] = info.get("original_name") or ""
        p["bio"] = info.get("bio") or ""
        p["profile_image_url"] = info.get("profile_image_url") or ""
        p["roles"] = info.get("roles") or []


def scrape_person_profile(nm_id):
    """Scrape ``https://www.imdb.com/name/nm…/`` for a person's core data."""
    nm_id = (nm_id or "").strip()
    if not _NM_ID_RE.match(nm_id):
        return None
    html = fetch_html(NAME_URL.format(nm_id=nm_id))
    nd = extract_next_data(html)
    cache = next_data_cache(nd or {})
    node = find_node(cache, "NameMainDetails") or find_node(cache, "NamePlus") \
        or find_node(cache, "NameBase")
    result = {"nm_id": nm_id}
    if node:
        display = node.get("name") or {}
        name_txt = display.get("text") if isinstance(display, dict) else None
        name_txt = name_txt or node.get("nameText") or ""
        aka = node.get("otherWorks") or {}
        first = split_person_name(name_txt)
        result["name"] = name_txt
        result["first_name"] = first[0]
        result["last_name"] = first[1]
        result["original_name"] = (node.get("birthName") or {}).get("text") \
            if isinstance(node.get("birthName"), dict) else ""
        bio_node = node.get("bio") or node.get("miniBio") or {}
        result["bio"] = (bio_node.get("text") or "") if isinstance(bio_node, dict) else ""
        img = node.get("image") or node.get("headshot") or {}
        result["profile_image_url"] = poster_url(img if isinstance(img, dict) else {})
        known = node.get("knownFor") or node.get("knownForCategory") or {}
        cats = known.get("edges") if isinstance(known, dict) else []
        roles = []
        for e in cats or []:
            cat = ((e or {}).get("node") or {}).get("category") or {}
            text = (cat.get("text") if isinstance(cat, dict) else "") or ""
            if text:
                roles.append(text.lower())
        result["roles"] = sorted(set(roles))
    else:
        soup = BeautifulSoup(html, "html.parser")
        h1 = soup.find("h1")
        name_txt = h1.get_text(strip=True) if h1 else ""
        name_txt = re.sub(r"\s*\(I+\)\s*$", "", name_txt).strip()
        first = split_person_name(name_txt)
        result["name"] = name_txt
        result["first_name"] = first[0]
        result["last_name"] = first[1]
        img = soup.find("img")
        result["profile_image_url"] = (img.get("src") if img else "") or ""
        result["bio"] = ""
        result["roles"] = []
    if not result.get("first_name"):
        return None
    return result


# ---------------------------------------------------------------------------
# Plain-HTML fallback for title pages (no/broken __NEXT_DATA__)
# ---------------------------------------------------------------------------
def _scrape_title_details_html(imdb_id, html=None):
    """BeautifulSoup fallback extractor for a title page."""
    if html is None:
        html = fetch_html(TITLE_URL.format(imdb_id=imdb_id))
    soup = BeautifulSoup(html, "html.parser")
    h1 = soup.find("h1")
    title_txt = h1.get_text(strip=True) if h1 else ""
    year = None
    yt = soup.select_one('a[href*="/calendar/?year="], a[href^="/release/rz"]')
    ym = re.search(r"\b(19|20)\d{2}\b", yt.get_text() if yt else title_txt)
    if ym:
        year = int(ym.group(0))
    if year is None:
        t = soup.select_one("[data-testid='base-title-subline']")
        ym2 = re.search(r"\((\d{4})\)", t.get_text() if t else "")
        if ym2:
            year = int(ym2.group(1))
    rating_el = soup.select_one("[data-testid='aggregate-rating-level-score'], .star-box__average-rating-wrapper strong")
    votes_el = soup.select_one("[data-testid='aggregate-rating-level-count'], .star-box__average-rating-wrapper span")
    def num(el, cast=float):
        if not el:
            return None
        m = re.search(r"[\d.,]+", el.get_text().replace("\u00a0", ","))
        if not m:
            return None
        try:
            return cast(m.group(0).replace(",", ""))
        except ValueError:
            return None
    plot_el = soup.select_one('[data-testid="storyline-text"], .ipc-html-content-inner-div')
    genres = []
    for a in soup.select('a[href^="/search/title/?genres="]'):
        name = a.get_text(strip=True)
        if name:
            genres.append({"name": name, "imdb_genre_id": "", "genre_type": "main"})
    img = soup.select_one('[data-testid="poster"] img, .desktop-poster-and-secondary-toolbar__body img')
    sm = soup.select_one('time[datetime]')
    type_txt = (yt.get_text() if yt else "").lower()
    return {
        "imdb_id": imdb_id,
        "title": title_txt,
        "title_original": "",
        "year": year,
        "end_year": None,
        "type": "series" if "series" in type_txt else "movie",
        "mpa_rating": "",
        "runtime_minutes": None,
        "genres": genres,
        "imdb_rating": num(rating_el, float),
        "imdb_votes": num(votes_el, int),
        "synopsis": plot_el.get_text(" ", strip=True) if plot_el else "",
        "poster_url": (img.get("src") if img else "") or "",
        "languages": [],
        "countries": [],
        "aspect_ratio": "",
        "directors": [],
        "creators": [],
        "stars": [],
        "parents_guide": {},
        "release_date": sm.get("datetime") if sm else "",
        "source": "html_fallback",
    }


# ---------------------------------------------------------------------------
# Parental guide (advisory categories + severities)
# ---------------------------------------------------------------------------
def scrape_parental_guide(imdb_id):
    """Scrape ``/title/tt…/parentalguide/`` -> structured advisories.

    Shape::

        {"categories": {"sex_nudity": {"label": "Sex & Nudity",
                                       "severity": "Severe", "score": 9,
                                       "summary": "..."}, ...}}
    """
    html = fetch_html(PARENTAL_URL.format(imdb_id=imdb_id))
    out = {"categories": {}}
    nd = extract_next_data(html)
    cache = next_data_cache(nd or {})

    node = find_node(cache, "TitleParentalGuideTypesAndAdvisories")
    if node:
        for key, label in PG_CATEGORY_LABELS.items():
            cat = node.get(key) or {}
            if not isinstance(cat, dict):
                continue
            status = (cat.get("status") or {})
            severity_txt = status.get("label") or status.get("advisorySeverity") or ""
            sev_key, score = norm_severity(severity_txt)
            examples = []
            for e in (cat.get("contentDescriptions") or [])[:5]:
                txt = e.get("text") if isinstance(e, dict) else str(e)
                if txt:
                    examples.append(txt)
            out["categories"][key] = {
                "label": label,
                "severity": severity_txt.title() if severity_txt else "None",
                "severity_key": sev_key,
                "score": score,
                "summary": " ".join(examples)[:500],
                "evidence": examples,
            }
        if out["categories"]:
            return out

    # --- HTML fallback -----------------------------------------------------
    soup = BeautifulSoup(html, "html.parser")
    for heading in soup.select("div.parental-guide-v2__category-block, div[class*=category]"):
        h = heading.find(["h3", "h4", "h5"])
        if not h:
            continue
        label = h.get_text(strip=True)
        key = next((k for k, lbl in PG_CATEGORY_LABELS.items()
                    if lbl.split(" & ")[0].lower() in label.lower()), None)
        if not key:
            continue
        sev_el = heading.select_one(".ipl-severity-table__cell-selected, [class*=severity]")
        sev_txt = sev_el.get_text(strip=True) if sev_el else ""
        sev_key, score = norm_severity(sev_txt)
        paras = [p.get_text(" ", strip=True) for p in heading.find_all("p")][:3]
        out["categories"][key] = {
            "label": label,
            "severity": sev_txt.title() or "None",
            "severity_key": sev_key,
            "score": score,
            "summary": " ".join(paras)[:500],
            "evidence": paras,
        }
    return out


# ---------------------------------------------------------------------------
# /find/ search (User Story 2)
# ---------------------------------------------------------------------------
def _find_title_rows(next_data):
    """Walk the /find/ __NEXT_DATA__ *result tree* (not just the flat cache).

    IMDb's find page nests its sections ("Exact Matches", "Titles") inside
    ``props.pageProps.serverApp.graphQL.cachedData.queries`` as a tree of
    lists/dicts/refs. We walk every node with a TitleName-ish fragment so
    both exact and fuzzy sections are captured, resolving ``__ref`` pointers
    against the entity cache. Returns [] when nothing is found (callers then
    fall back to the flat-cache scan / HTML parsing).
    """
    cache = next_data_cache(next_data or {})
    if not cache:
        return []

    root = None
    try:
        sa = next_data["props"]["pageProps"]["serverApp"]
        queries = sa["graphQL"]["cachedData"]["queries"]
        # Prefer the FindTitles query; otherwise merge all query trees.
        best = None
        for q in queries if isinstance(queries, list) else []:
            name = str(q.get("operationName") or q.get("metadata", {}).get("operationName") or "") \
                if isinstance(q, dict) else ""
            res = q.get("result") if isinstance(q, dict) else None
            if res is None:
                continue
            if "FindTitles" in name:
                best = res
                break
            if best is None:
                best = res
        root = best if best is not None else sa.get("data")
    except (KeyError, TypeError, AttributeError):
        root = cache

    rows, seen = [], set()

    def visit(value, depth=0):
        if depth > 60 or value is None:
            return
        if isinstance(value, list):
            for v in value:
                visit(v, depth + 1)
            return
        if not isinstance(value, dict):
            return
        if "__ref" in value:
            visit(cache.get(value["__ref"]), depth + 1)
            return
        typename = str(value.get("__typename") or "")
        node_id = str(value.get("id") or "")
        if "TitleName" in typename and _IMDB_ID_RE.match(node_id) \
                and node_id not in seen:
            seen.add(node_id)
            rows.append(value)
        for k, v in value.items():
            if k in ("__typename", "id"):
                continue
            if isinstance(v, (list, dict)):
                visit(v, depth + 1)

    visit(root)
    return rows


def scrape_find(query, year=None, media_type=None, limit=10):
    """Scrape IMDb's exact-title find page and return candidate matches.

    [{imdb_id, title, year, media_type, poster_url, approx_match_score}]
    """
    query = (query or "").strip()
    if not query:
        return []
    url = FIND_URL.format(query=urllib.parse.quote_plus(query))
    html = fetch_html(url)
    candidates = []

    nd = extract_next_data(html)
    cache = next_data_cache(nd or {})
    if nd is None:
        log.warning("No __NEXT_DATA__ on /find/ page for %r -> HTML fallback", query)

    def collect(nodes):
        for t in nodes:
            tt = t.get("id") or ""
            if not _IMDB_ID_RE.match(str(tt)):
                continue
            meta = t.get("titleText") or {}
            title = meta.get("text") if isinstance(meta, dict) else ""
            title = title or t.get("title") or ""
            ry = t.get("releaseYear") or {}
            yr = ry.get("year") if isinstance(ry, dict) else None
            ttype_node = t.get("titleType") or {}
            ttype = str(ttype_node.get("text", "")).lower() if isinstance(ttype_node, dict) else ""
            tt_id = str(ttype_node.get("id", "")) if isinstance(ttype_node, dict) else ""
            mtype = "series" if ("series" in ttype or tt_id in ("tvSeries", "tvMiniSeries")) else "movie"
            img = t.get("titleImage") or t.get("primaryImage") or {}
            if not isinstance(img, dict):
                img = {}
            poster = poster_url(img)
            if not poster:
                # Newer payloads only carry width/height on the image node.
                raw = img.get("url") or img.get("original") or ""
                poster = raw if isinstance(raw, str) else ""
            candidates.append({
                "imdb_id": tt,
                "title": title,
                "year": yr,
                "media_type": mtype,
                "poster_url": poster,
            })

    # 1) Walk the find-result tree first (exact + fuzzy sections), then the
    #    flat GraphQL cache; dedupe keeps the tree order (exact matches first).
    collect(_find_title_rows(nd))
    collect(find_all_nodes(cache, "TitleName"))

    # 2) HTML fallback / supplement: links under the find results list.
    if not candidates:
        soup = BeautifulSoup(html, "html.parser")
        for a in soup.select('a[href^="/title/tt"]'):
            href = a.get("href", "")
            m = re.search(r"/(tt\d{7,10})", href)
            if not m:
                continue
            img = a.find("img")
            text_rows = [s.get_text(" ", strip=True) for s in a.select("div, span")
                         if s.get_text(strip=True)]
            title = ""
            yr = None
            for row in text_rows:
                if not title and 2 <= len(row) <= 200 and not row.startswith(("(", "–")):
                    title = row
                ym = re.search(r"\b(19|20)\d{2}\b", row)
                if ym and yr is None:
                    yr = int(ym.group(0))
            if title:
                candidates.append({
                    "imdb_id": m.group(1), "title": title, "year": yr,
                    "media_type": "movie",
                    "poster_url": (img.get("src") if img else "") or "",
                })

    # Dedupe by imdb_id (keep first occurrence).
    uniq, seen = [], set()
    for c in candidates:
        if c["imdb_id"] in seen:
            continue
        seen.add(c["imdb_id"])
        uniq.append(c)
    candidates = uniq

    # Filter/score.
    ql = query.lower()
    scored = []
    for c in candidates:
        if media_type and c.get("media_type") != media_type:
            continue
        if year and c.get("year") and abs(int(c["year"]) - int(year)) > 1:
            continue
        score = 0.95 if c["title"].lower() == ql else 0.75
        if year and c.get("year") == year:
            score += 0.05
        c["approx_match_score"] = round(score, 2)
        scored.append(c)
    scored.sort(key=lambda c: -c["approx_match_score"])
    log.info("scrape_find(%r): %d candidate(s) extracted (%s)",
             query, len(scored[:limit]),
             ", ".join(f"{c['imdb_id']}:{c['title']}" for c in scored[:3]) or "none")
    return scored[:limit]


# ---------------------------------------------------------------------------
# Diagnostics (used by /api/imdb/diagnose/ — Scan & Bulk Import page panel)
# ---------------------------------------------------------------------------
def run_diagnostics(imdb_id="tt1375666", search_query=None, use_offline_fallback=False):
    """Live-test every IMDb scraping path and return a structured report.

    Checks performed:
      1. Title page scrape        https://www.imdb.com/title/{imdb_id}/
      2. Parental guide scrape    https://www.imdb.com/title/{imdb_id}/parentalguide/
      3. /find/ search scrape     https://www.imdb.com/find/?q=...&s=tt&exact=true
      4. Person profile scrape    https://www.imdb.com/name/nm.../ (from #1 credits)

    Each check records ok/error status, timing, HTTP-level detail and the full
    captured DEBUG log lines from the scraper so the UI can show exactly what
    happened (WAF challenge, missing __NEXT_DATA__, parse results, ...).
    """
    checks = []
    creds = get_request_credentials()

    def _record(name, url, fn, extract=None):
        t0 = time.time()
        with scrape_log_capture() as collector:
            try:
                data = fn()
                ms = int((time.time() - t0) * 1000)
                summary = extract(data) if extract else {}
                checks.append({
                    "name": name, "url": url, "ok": True, "duration_ms": ms,
                    "error": "", "summary": summary,
                    "logs": list(collector.records),
                })
                return data
            except Exception as exc:  # noqa: BLE001 - report every failure
                ms = int((time.time() - t0) * 1000)
                checks.append({
                    "name": name, "url": url, "ok": False, "duration_ms": ms,
                    "error": f"{type(exc).__name__}: {exc}",
                    "summary": {}, "logs": list(collector.records),
                })
                return None

    imdb_id = (imdb_id or "tt1375666").strip()
    title_details = _record(
        "Title page scrape (__NEXT_DATA__)", TITLE_URL.format(imdb_id=imdb_id),
        lambda: scrape_title_details(imdb_id),
        extract=lambda d: {
            "title": d.get("title"), "year": d.get("year"),
            "rating": d.get("imdb_rating"), "votes": d.get("imdb_votes"),
            "genres": len(d.get("genres") or []),
            "directors": len(d.get("directors") or []),
            "stars": len(d.get("stars") or []),
            "source": d.get("source"),
        },
    )

    _record(
        "Parental guide scrape", PARENTAL_URL.format(imdb_id=imdb_id),
        lambda: scrape_parental_guide(imdb_id),
        extract=lambda d: {"categories": {
            k: v.get("severity") for k, v in (d.get("categories") or {}).items()}},
    )

    q = (search_query or (title_details or {}).get("title") or "the matrix").strip()
    _record(
        "Find/search scrape (/find/)", FIND_URL.format(query=urllib.parse.quote_plus(q)),
        lambda: scrape_find(q),
        extract=lambda rows: {"query": q, "candidates": len(rows),
                              "top": [f"{r['imdb_id']} {r['title']} ({r['year']})"
                                      for r in rows[:3]]},
    )

    nm = ""
    for key in ("directors", "stars"):
        for p in (title_details or {}).get(key) or []:
            if p.get("nm"):
                nm = p["nm"]
                break
        if nm:
            break
    if nm:
        _record(
            "Person profile scrape (/name/)", NAME_URL.format(nm_id=nm),
            lambda: scrape_person_profile(nm),
            extract=lambda d: {"nm_id": nm, "name": (d or {}).get("name"),
                               "bio_len": len((d or {}).get("bio") or "")},
        )
    else:
        checks.append({"name": "Person profile scrape (/name/)", "url": "(skipped)",
                       "ok": False, "duration_ms": 0,
                       "error": "No nm id available — title scrape did not return credits.",
                       "summary": {}, "logs": []})

    # Which provider would actually serve real-time requests?
    try:
        from . import imdb_client
        provider_mode = ("offline-forced" if imdb_client.is_offline()
                        else "scrape" if imdb_client.scraping_enabled() else "api")
    except Exception:  # noqa: BLE001
        provider_mode = "unknown"

    ok_count = sum(1 for c in checks if c["ok"])
    blocked = any("WAF" in (c["error"] or "") or "challenge" in (c["error"] or "").lower()
                  for c in checks if not c["ok"])
    return {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S %Z", time.gmtime()),
        "provider_mode": provider_mode,
        "credentials": {
            "aws_waf_token_set": bool(creds.get("aws_waf_token")),
            "aws_waf_token_len": len(creds.get("aws_waf_token") or ""),
            "user_agent": creds.get("user_agent") or HEADERS["User-Agent"],
            "custom_user_agent": bool(creds.get("user_agent")),
        },
        "checks": checks,
        "verdict": ("all_ok" if ok_count == len(checks) else
                    "waf_blocked" if blocked and ok_count == 0 else
                    "partial" if ok_count else "failed"),
        "hint": (None if ok_count == len(checks) else
                 "IMDb's AWS WAF is challenging this server. Open imdb.com in your "
                 "browser (DevTools → Application → Cookies or Network tab), copy the "
                 "'aws-waf-token' cookie value and your exact User-Agent, paste both "
                 "into the fields above, then re-run diagnostics / matching."),
    }
