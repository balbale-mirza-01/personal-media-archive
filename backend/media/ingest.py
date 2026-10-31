"""Ingest: turn verified scan groups + IMDb metadata into database entities.

A "selection" is one scanned group the user verified against a chosen IMDb id:
    {imdb_id, kind: "movie"|"series", title_guess, year, files | seasons}

Rules:
  - MediaItem keyed by imdb_id; existing items are enriched, never duplicated.
  - Persons keyed by nm id; credits written as director/creator/actor rows.
  - Genres/Tags get_or_create by name.
  - Series -> Season + Episode rows; episode rollups recomputed via selectors.
  - MediaFile rows created per file (deduped by media_item + file_path);
    episode-linked files attach to their Episode row.
  - Files whose path starts with a HardDrive.mount_path are linked to that drive.
"""
import os

from django.db import transaction

from . import imdb_scraper
from .imdb_client import get_title_details
from .models import (
    Credit,
    Episode,
    Genre,
    HardDrive,
    MediaFile,
    MediaItem,
    Person,
    Season,
)
from .selectors import recompute_series


def _split_name(name):
    """Split a full IMDb person name into (first_name, last_name)."""
    parts = (name or "").strip().split(" ", 1)
    first = parts[0] if parts else ""
    last = parts[1] if len(parts) > 1 else ""
    return first, last


def _get_person(nm, name, extra=None):
    """Get/create a Person keyed by nm#######; enrich from scraped profile data."""
    if not nm:
        return None
    extra = extra or {}
    first, last = _split_name(name)
    first = extra.get("first_name") or first
    last = extra.get("last_name") or last
    person, created = Person.objects.get_or_create(
        imdb_person_id=nm,
        defaults={"first_name": first or nm, "last_name": last},
    )
    dirty = set()
    if name and not created:
        new_first, new_last = _split_name(name)
        if extra.get("first_name"):
            new_first = extra["first_name"]
        if extra.get("last_name"):
            new_last = extra["last_name"]
        if (new_first, new_last) != (person.first_name, person.last_name) \
                and (new_first or new_last):
            person.first_name, person.last_name = new_first, new_last
            dirty.update(["first_name", "last_name"])
    if extra.get("original_name") and not person.original_name:
        person.original_name = extra["original_name"][:255]
        dirty.add("original_name")
    if extra.get("bio") and not person.bio:
        person.bio = extra["bio"]
        dirty.add("bio")
    if extra.get("profile_image_url") and not person.profile_image_url:
        person.profile_image_url = extra["profile_image_url"][:500]
        dirty.add("profile_image_url")
    roles = set(person.roles or [])
    for r in (extra.get("roles") or []):
        roles.add(r)
    if roles != set(person.roles or []):
        person.roles = sorted(roles)
        dirty.add("roles")
    if dirty:
        person.save(update_fields=sorted(dirty) + ["updated_at"])
    return person


def _link_drive(file_path):
    norm = os.path.abspath(file_path)
    for drive in HardDrive.objects.exclude(mount_path=""):
        mount = os.path.abspath(os.path.expanduser(drive.mount_path))
        if norm == mount or norm.startswith(mount + os.sep):
            return drive
    return None


def _add_credits(item, details):
    """Write director/creator/actor Credit rows (+ character names) and keep
    Person.roles in sync. Idempotent: existing rows are updated, not duplicated."""
    order = 0
    for role_key, role in (("directors", "director"), ("creators", "creator"),
                           ("stars", "actor")):
        for p in details.get(role_key) or []:
            person = _get_person(p.get("nm"), p.get("name"), extra=p)
            if not person:
                continue
            characters = [c for c in (p.get("characters") or []) if c]
            credit_defaults = {"order": order}
            if characters:
                credit_defaults["character_name"] = characters[0][:255]
            credit, _c = Credit.objects.get_or_create(
                media_item=item, person=person, role=role,
                character_name="" if not characters else None,
                defaults=credit_defaults,
            ) if False else (None, False)
            # get_or_create with unique(media,person,role,character_name):
            char = characters[0] if characters else ""
            credit, created = Credit.objects.get_or_create(
                media_item=item, person=person, role=role,
                character_name=char[:255], defaults=credit_defaults,
            )
            if not created and characters and not credit.character_name:
                credit.character_name = char[:255]
                credit.save(update_fields=["character_name", "updated_at"])
            roles = set(person.roles or [])
            if role not in roles:
                roles.add(role)
                person.roles = sorted(roles)
                person.save(update_fields=["roles", "updated_at"])
            order += 1


def _resolve_genre(entry):
    """Map one scraped genre dict to a Genre row.

    Main genres (Action/Drama/...) become top-level Genre rows; interest-style
    sub-genres are attached under their closest main genre as parent_genre.
    """
    if isinstance(entry, str):
        name, imdb_gid, gtype = entry, "", "main"
    else:
        name = (entry or {}).get("name") or ""
        imdb_gid = (entry or {}).get("imdb_genre_id") or ""
        gtype = (entry or {}).get("genre_type") or "main"
    if not name:
        return None
    defaults = {"genre_type": gtype}
    if imdb_gid:
        defaults["imdb_genre_id"] = imdb_gid
    genre, _ = Genre.objects.get_or_create(name=name, defaults=defaults)
    changed = False
    if imdb_gid and genre.imdb_genre_id != imdb_gid:
        # Backfilling the IMDb interest id can collide with an existing row
        # that already owns it (e.g. seeded genres created without ids).
        # Merge into the existing row instead of crashing on the unique
        # constraint.
        clash = Genre.objects.filter(imdb_genre_id=imdb_gid).exclude(pk=genre.pk).first()
        if clash:
            for item in list(MediaItem.objects.filter(genres=genre)):
                item.genres.add(clash)
                item.genres.remove(genre)
            try:
                genre.subgenres.update(parent_genre=clash)
            except Exception:  # noqa: BLE001 - best-effort reparent
                pass
            genre.delete()
            return clash
        genre.imdb_genre_id = imdb_gid
        changed = True
    if gtype == "sub" and genre.parent_genre_id is None:
        # Try to hang the sub-genre under one of this title's main genres.
        pass
    if changed:
        genre.save(update_fields=["imdb_genre_id", "updated_at"])
    return genre


def _parents_guide_notes(details):
    """Convert scraped parental-guide categories into the UI's note shape.

    The ParentsGuide tab renders ``parents_guide_notes`` keyed by the IMDb
    category labels ("Sex & Nudity", "Violence & Gore", ...). We store a
    human-readable advisory string per category so existing UI keeps working,
    while the full structured payload lives in ``parents_guide``.
    """
    pg = details.get("parents_guide") or {}
    cats = pg.get("categories") if isinstance(pg, dict) else None
    notes = {}
    if isinstance(cats, dict):
        for key, cat in cats.items():
            if not isinstance(cat, dict):
                continue
            label = cat.get("label") or key
            severity = cat.get("severity") or "None"
            summary = (cat.get("summary") or "").strip()
            notes[label] = f"{severity}. {summary}".strip(". ")[:500]
    return notes


def _apply_details(item, details):
    """Copy verified IMDb metadata onto the item without clobbering user edits.

    Dynamic fields (IMDb rating/vote count, poster, synopsis, parental guide)
    are always refreshed; static fields only fill gaps.
    """
    fields = {
        "media_type": details.get("type") or item.media_type,
        "title_en": details.get("title") or item.title_en,
        "title_original": details.get("title_original") or item.title_original,
        "year": details.get("year") or item.year,
        "end_year": details.get("end_year") or item.end_year,
        "mpa_rating": details.get("mpa_rating") or item.mpa_rating,
        "runtime_minutes": details.get("runtime_minutes") or item.runtime_minutes,
        "aspect_ratio": details.get("aspect_ratio") or item.aspect_ratio,
        "synopsis": details.get("synopsis") or item.synopsis,
        "poster_url": details.get("poster_url") or item.poster_url,
        # Dynamic metrics: refresh whenever IMDb returns fresher values.
        "imdb_rating": details.get("imdb_rating") if details.get("imdb_rating") is not None else item.imdb_rating,
        "imdb_votes": details.get("imdb_votes") if details.get("imdb_votes") is not None else item.imdb_votes,
    }
    if details.get("languages"):
        fields["languages"] = details["languages"]
    if details.get("countries"):
        fields["countries"] = details["countries"]
    if details.get("parents_guide"):
        fields["parents_guide"] = details["parents_guide"]
        notes = _parents_guide_notes(details)
        if notes:
            # Merge (never clobber) into the UI-facing notes dict.
            merged = dict(item.parents_guide_notes or {})
            for k, v in notes.items():
                if v and not merged.get(k):
                    merged[k] = v
            fields["parents_guide_notes"] = merged

    for key, value in fields.items():
        setattr(item, key, value)
    item.save()

    # Taxonomy: main genres first (so sub-genres can resolve parents later),
    # then M2M link everything to the item.
    main_genres, sub_genres = [], []
    for g in details.get("genres") or []:
        genre = _resolve_genre(g)
        if not genre:
            continue
        (sub_genres if isinstance(g, dict) and g.get("genre_type") == "sub"
         else main_genres).append(genre)
    item.genres.add(*main_genres)
    for sub in sub_genres:
        if not sub.parent_genre_id and main_genres:
            # Attach the sub-interest under the first matching main genre when
            # its name shares a word with it (cheap heuristic, never overwrites).
            for mg in main_genres:
                if mg.name.lower().split()[0] in sub.name.lower():
                    sub.parent_genre = mg
                    sub.save(update_fields=["parent_genre", "updated_at"])
                    break
        item.genres.add(sub)


def _attach_file(item, f, episode=None):
    drive = _link_drive(f["file_path"])
    obj, created = MediaFile.objects.get_or_create(
        media_item=item,
        file_path=f["file_path"],
        defaults={
            "hard_drive": drive,
            "episode": episode,
            "file_name": f.get("file_name") or os.path.basename(f["file_path"]),
            "file_size_bytes": f.get("file_size_bytes"),
            "quality": f.get("quality") or "",
            "source": f.get("source") or "",
            "codec": f.get("codec") or "",
            "is_multi_part": bool(f.get("is_multi_part")),
            "part_number": f.get("part_number"),
        },
    )
    if not created:
        obj.hard_drive = obj.hard_drive or drive
        if episode is not None:
            obj.episode = episode
        obj.save()
    return obj


@transaction.atomic
def ingest_selections(selections, aws_waf_token=None, user_agent=None):
    """Process verified selections. Returns a per-selection result list.

    ``aws_waf_token``/``user_agent`` (optional): manual IMDb WAF credentials
    pasted in the Scan & Bulk Import UI; installed on this thread so every
    scrape request in the batch uses them.
    """
    if aws_waf_token is not None or user_agent is not None:
        imdb_scraper.set_request_credentials(
            aws_waf_token=aws_waf_token, user_agent=user_agent)
    results = []
    for sel in selections:
        imdb_id = (sel.get("imdb_id") or "").strip()
        entry = {"imdb_id": imdb_id, "status": "ok", "item_id": None,
                 "files_created": 0, "episodes_created": 0, "warnings": []}
        results.append(entry)
        if not imdb_id:
            entry.update(status="error", error="missing imdb_id")
            continue

        details = get_title_details(imdb_id)
        if not details:
            entry.update(status="error", error=f"IMDb metadata not found for {imdb_id}")
            continue

        kind = sel.get("kind") or details.get("type") or "movie"
        if kind != details.get("type"):
            entry["warnings"].append(
                f"scanned as '{kind}' but IMDb says '{details.get('type')}'; using IMDb type")
            kind = details.get("type")

        item, created = MediaItem.objects.get_or_create(
            imdb_id=imdb_id,
            defaults={"title_en": sel.get("title_guess") or details.get("title") or imdb_id,
                      "media_type": kind},
        )
        entry["item_id"] = item.id
        entry["item_created"] = created
        _apply_details(item, details)
        _add_credits(item, details)

        entry["title"] = item.title_en
        entry["year"] = item.year
        if kind == "movie":
            files = list(sel.get("files") or [])
            if sel.get("file_path") and not files:
                files.append({"file_path": sel["file_path"],
                              "file_size_bytes": sel.get("file_size_bytes")})
            for f in files:
                _attach_file(item, f)
                entry["files_created"] += 1
            if not files:
                entry["warnings"].append("no files attached")
        else:  # series
            for season_data in sel.get("seasons") or []:
                season, s_created = Season.objects.get_or_create(
                    media_item=item, season_number=season_data["season"],
                    defaults={"title": f"Season {season_data['season']}"},
                )
                for ep_data in season_data.get("episodes") or []:
                    episode, e_created = Episode.objects.get_or_create(
                        season=season, episode_number=ep_data["episode"],
                        defaults={"title": f"Episode {ep_data['episode']}"},
                    )
                    entry["episodes_created"] += int(e_created)
                    for f in ep_data.get("files") or []:
                        _attach_file(item, f, episode=episode)
                        entry["files_created"] += 1
            recompute_series(item)
    return results
