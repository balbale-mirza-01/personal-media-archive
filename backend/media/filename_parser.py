"""Filename -> structured parse hints, ported from the prototype's Scan page.

Parses release-style filenames like:
    The.Matrix.1999.1080p.BluRay.x264-GROUP.mkv
    Interstellar (2014) [2160p WEB-DL] CD1.mkv
    Breaking.Bad.S01E03.720p.WEB-DL.x264-NTb.mkv
into {title_guess, year, season, episode, quality, source, codec, part, multi_part}.
"""
import os
import re

VIDEO_EXTENSIONS = {".mkv", ".mp4"}

_SEASON_EPISODE_RES = [
    re.compile(r"[sS](\d{1,2})[\s._-]?[eE](\d{1,3})"),   # S01E03
    re.compile(r"(\d{1,2})x(\d{2,3})"),                    # 1x03
]
_MULTI_PART_RE = re.compile(r"(?:cd|part|disk)[\s._-]*(\d{1,2})", re.IGNORECASE)

_QUALITY_MAP = {
    "2160p": "2160p", "4k": "2160p", "uhd": "2160p",
    "1080p": "1080p", "720p": "720p", "480p": "480p",
    "576p": "576p", "360p": "360p",
}
_SOURCE_SET = {
    "bluray", "bdrip", "brrip", "webdl", "web-dl", "webrip", "web", "hdtv",
    "hdrip", "dvdrip", "dvdscr", "screener", "telesync", "telecine",
    "remux", "hdcam", "cam",
}
_CODEC_SET = {"x264", "x265", "h264", "h265", "hevc", "avc", "av1", "vp9", "xvid", "divx", "mpeg2"}
_AUDIO_SET = {"aac", "ac3", "eac3", "dd", "ddp", "dts", "truehd", "atmos", "mp3", "flac"}
_RELEASE_GROUP_SPLIT = re.compile(r"-[A-Za-z][A-Za-z0-9]+$")   # trailing -GROUP


_PAREN_RE = re.compile(r"\((\d{4})\)")


def _tokenize(stem: str):
    """Split on separators. Bracketed noise is dropped; (YYYY) becomes a bare token."""
    stem = re.sub(r"\[.*?\]", " ", stem)
    stem = _PAREN_RE.sub(lambda m: " " + m.group(1) + " ", stem)
    stem = re.sub(r"[()]", " ", stem)
    parts = re.split(r"[\s._]+", stem)
    return [p for p in parts if p]


def _clean_title(raw_tokens) -> str:
    title = " ".join(raw_tokens)
    title = title.replace("_", " ").replace(".", " ")
    title = re.sub(r"\[.*?\]", " ", title)
    title = re.sub(r"[()]", " ", title)
    title = re.sub(r"\s+", " ", title).strip(" -")
    return title


def parse_filename(file_name: str) -> dict:
    """Return parse hints for a single video file name (with or without extension)."""
    stem = os.path.splitext(file_name)[0]
    result = {
        "title_guess": "", "year": None, "season": None, "episode": None,
        "quality": "", "source": "", "codec": "", "audio": [],
        "part_number": None, "is_multi_part": False,
    }

    # --- Season/Episode -----------------------------------------------------
    se_match = None
    for rx in _SEASON_EPISODE_RES:
        se_match = rx.search(stem)
        if se_match:
            result["season"] = int(se_match.group(1))
            result["episode"] = int(se_match.group(2))
            break

    # Work on a token list; drop the SxxExx span before title extraction.
    tokens = _tokenize(stem)
    if se_match:
        se_txt = se_match.group(0).lower().replace("-", ".").replace("_", ".")
        norm_tokens = [t.lower().replace("-", ".").replace("_", ".") for t in tokens]
        se_parts = [p for p in se_txt.split(".") if p]
        idx = next((i for i in range(len(norm_tokens))
                    if norm_tokens[i:i + len(se_parts)] == se_parts), None)
        if idx is not None:
            tokens = tokens[:idx] + tokens[idx + len(se_parts):]

    # --- Multi-part (CD1 / disk1) --------------------------------------------
    # Only match the suffix form ("... CD2.mp4"): require the token to be
    # dot/underscore-separated and followed by end-of-stem or another separator.
    m = re.search(r"[._\-\s](?:cd|disk)[\s._-]*(\d{1,2})(?=[\s._-]*$)", stem, re.IGNORECASE)
    if m:
        result["part_number"] = int(m.group(1))
        result["is_multi_part"] = True

    # --- Year: first token that is a bare 4-digit number in [1900, 2100] ----
    year_idx = None
    for i, t in enumerate(tokens):
        if re.fullmatch(r"\(?\d{4}\)?", t) and 1900 <= int(re.sub(r"\D", "", t)) <= 2100:
            result["year"] = int(re.sub(r"\D", "", t))
            year_idx = i
            break

    meta_tokens = tokens[year_idx + 1:] if year_idx is not None else tokens[len(tokens):]
    title_tokens = tokens[:year_idx] if year_idx is not None else tokens

    # If no year found, cut title at the first metadata token.
    if year_idx is None:
        for i, t in enumerate(title_tokens):
            low = t.lower().replace("-", "").replace(".", "")
            if (low in _QUALITY_MAP or low.replace("-", "") in _SOURCE_SET
                    or re.fullmatch(r"\d{3,4}p", t.lower())):
                title_tokens, meta_tokens = title_tokens[:i], title_tokens[i:]
                break

    # --- Quality / Source / Codec / Audio ------------------------------------
    # Scan the raw stem (before bracket stripping): tokens may sit inside
    # brackets ("[2160p WEB-DL HEVC]"). Splitting on both separators AND hyphens
    # handles "x264-NTb" -> X264; adjacent-token rejoining restores meaningful
    # hyphenated tags like "WEB-DL".
    raw_tokens = [t for t in re.split(r"[\s._\-\]\[]+", stem.lower()) if t]

    scan_tokens = []
    i = 0
    while i < len(raw_tokens):
        tok = raw_tokens[i]
        nxt = raw_tokens[i + 1] if i + 1 < len(raw_tokens) else None
        compound = f"{tok}-{nxt}" if nxt else None
        if compound and compound in _SOURCE_SET:      # web + dl -> web-dl
            scan_tokens.append(compound)
            i += 2
            continue
        scan_tokens.append(tok)
        i += 1

    for tok in scan_tokens:
        low = tok
        if not result["quality"] and low in _QUALITY_MAP:
            result["quality"] = _QUALITY_MAP[low]
        if not result["source"] and low in _SOURCE_SET:
            result["source"] = {
                "webdl": "WEB-DL", "web-dl": "WEB-DL", "web": "WEB",
                "bluray": "BluRay", "bdrip": "BDRip", "brrip": "BRRip",
                "webrip": "WEBRip", "remux": "REMUX", "hdtv": "HDTV",
                "dvdrip": "DVDRip",
            }.get(low, low.upper())
        if not result["codec"] and low in _CODEC_SET:
            result["codec"] = low.upper()
        if low in _AUDIO_SET and low.upper() not in result["audio"]:
            result["audio"].append(low.upper())

    # --- Title ----------------------------------------------------------------
    result["title_guess"] = _clean_title(title_tokens)
    return result


def is_video_file(path: str) -> bool:
    return os.path.splitext(path)[1].lower() in VIDEO_EXTENSIONS
