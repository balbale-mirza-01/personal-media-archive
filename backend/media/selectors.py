"""Bottom-up rating / watch-status rollups for Episodes -> Seasons -> Series.

Call these after any episode/season mutation. Mirrors the frontend
`seriesProgress()` semantics so Phase-7 parity is preserved.
"""
from django.db.models import Avg

from .models import Episode, MediaItem, Season


def recompute_season(season: Season) -> Season:
    eps = season.episodes.all()
    count = eps.count()
    ratings = list(eps.values_list("imdb_rating", flat=True))
    ratings = [r for r in ratings if r is not None]
    personal = [p for p in eps.values_list("personal_rating", flat=True) if p is not None]

    source = ratings or personal
    season.episode_count = count
    season.avg_imdb_rating = round(sum(source) / len(source), 2) if source else None
    season.watched_count = eps.filter(watch_status="watched").count()
    season.save(update_fields=["episode_count", "avg_imdb_rating", "watched_count", "updated_at"])
    return season


def recompute_series(item: MediaItem) -> MediaItem:
    """Roll season data up to the series-level status/rating fields."""
    seasons = item.seasons.all()
    total_eps = sum(s.episode_count for s in seasons)
    watched_eps = sum(s.watched_count for s in seasons)

    # Series average rating from all episodes
    avg = Episode.objects.filter(season__media_item=item, imdb_rating__isnull=False).aggregate(
        Avg("imdb_rating")
    )["imdb_rating__avg"]
    if avg is not None:
        item.imdb_rating = round(avg, 2)

    # Bottom-up watch status: none -> unwatched, all -> watched, some -> watching
    if total_eps == 0 or watched_eps == 0:
        derived = "unwatched"
    elif watched_eps >= total_eps:
        derived = "watched"
    else:
        derived = "watching"
    # Never downgrade a manually-dropped/on-hold series automatically
    if item.watch_status not in ("dropped", "on_hold"):
        item.watch_status = derived
    item.save(update_fields=["imdb_rating", "watch_status", "updated_at"])
    return item


def touch_chain(episode: Episode) -> None:
    season = recompute_season(episode.season)
    recompute_series(season.media_item)
