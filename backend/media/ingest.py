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


def _get_person(nm, name):
    if not nm:
        return None
    person, created = Person.objects.get_or_create(
        imdb_person_id=nm, defaults={"name": name or nm}
    )
    if not created and name and person.name != name:
        person.name = name
        person.save(update_fields=["name", "updated_at"])
    return person


def _link_drive(file_path):
    norm = os.path.abspath(file_path)
    for drive in HardDrive.objects.exclude(mount_path=""):
        mount = os.path.abspath(os.path.expanduser(drive.mount_path))
        if norm == mount or norm.startswith(mount + os.sep):
            return drive
    return None


def _add_credits(item, details):
    order = 0
    for role_key, role in (("directors", "director"), ("creators", "creator"), ("stars", "actor")):
        for p in details.get(role_key) or []:
            person = _get_person(p.get("nm"), p.get("name"))
            if not person:
                continue
            Credit.objects.get_or_create(
                media_item=item, person=person, role=role, character_name="",
                defaults={"order": order},
            )
            roles = set(person.roles or [])
            roles.add(role)
            person.roles = sorted(roles)
            person.save(update_fields=["roles", "updated_at"])
            order += 1


def _apply_details(item, details):
    """Copy verified IMDb metadata onto the item without clobbering user edits."""
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
        "imdb_rating": details.get("imdb_rating") if details.get("imdb_rating") is not None else item.imdb_rating,
        "imdb_votes": details.get("imdb_votes") if details.get("imdb_votes") is not None else item.imdb_votes,
    }
    if details.get("languages"):
        fields["languages"] = details["languages"]
    if details.get("countries"):
        fields["countries"] = details["countries"]
    if details.get("parents_guide"):
        fields["parents_guide"] = details["parents_guide"]

    for key, value in fields.items():
        setattr(item, key, value)
    item.save()

    for gname in details.get("genres") or []:
        genre, _ = Genre.objects.get_or_create(
            name=gname, defaults={"imdb_genre_id": f"in{abs(hash(gname)) % 10**7:07d}"}
        )
        item.genres.add(genre)


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
def ingest_selections(selections):
    """Process verified selections. Returns a per-selection result list."""
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

        if kind == "movie":
            files = sel.get("files") or []
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
