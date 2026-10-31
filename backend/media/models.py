"""Media KArchive data model (PRD §4).

Mirrors the frontend entity shapes so the Phase-7 adapter can map fields
almost 1:1. IDs are exposed as string `id` in the API for frontend parity.
"""
from django.db import models


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class HardDrive(TimestampedModel):
    label = models.CharField(max_length=50, unique=True)  # HDD1, LAPTOP
    name = models.CharField(max_length=200, blank=True)
    mount_path = models.CharField(max_length=500, blank=True)
    is_connected = models.BooleanField(default=False)
    total_size_gb = models.FloatField(null=True, blank=True)
    free_size_gb = models.FloatField(null=True, blank=True)

    def __str__(self):
        return self.label


class Genre(TimestampedModel):
    GENRE_TYPE_CHOICES = [("main", "Main"), ("sub", "Sub")]

    imdb_genre_id = models.CharField(max_length=20, unique=True)  # in#######
    name = models.CharField(max_length=100)
    genre_type = models.CharField(max_length=10, choices=GENRE_TYPE_CHOICES, default="main")
    parent_genre = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="subgenres"
    )

    def __str__(self):
        return self.name


class Tag(TimestampedModel):
    """Free-form tags (Phase 3/4 addition)."""

    name = models.CharField(max_length=100, unique=True)
    color = models.CharField(max_length=30, default="teal")

    def __str__(self):
        return self.name


class Person(TimestampedModel):
    imdb_person_id = models.CharField(max_length=20, unique=True)  # nm#######
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True)
    original_name = models.CharField(max_length=200, blank=True)
    roles = models.JSONField(default=list, blank=True)  # ["director", "actor", ...]
    bio = models.TextField(blank=True)
    profile_image_url = models.URLField(max_length=500, blank=True)

    @property
    def full_name(self):
        """Convenience "First Last" string (frontend renders from parts)."""
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self):
        return self.full_name


class MediaItem(TimestampedModel):
    MEDIA_TYPE_CHOICES = [("movie", "Movie"), ("series", "Series")]
    WATCH_STATUS_CHOICES = [
        ("unwatched", "Unwatched"),
        ("watching", "Watching"),
        ("watched", "Watched"),
        ("dropped", "Dropped"),
        ("on_hold", "On Hold"),
    ]
    WATCHLIST_CONTEXT_CHOICES = [
        ("none", "None"),
        ("alone", "Alone"),
        ("with_wife", "With Wife"),
        ("family_with_kids", "Family With Kids"),
    ]

    imdb_id = models.CharField(max_length=20, unique=True)  # tt#######
    media_type = models.CharField(max_length=10, choices=MEDIA_TYPE_CHOICES, default="movie")
    title_en = models.CharField(max_length=300)
    title_original = models.CharField(max_length=300, blank=True)
    year = models.IntegerField(null=True, blank=True)
    end_year = models.IntegerField(null=True, blank=True)
    mpa_rating = models.CharField(max_length=20, blank=True)  # PG-13, R...
    runtime_minutes = models.IntegerField(null=True, blank=True)
    aspect_ratio = models.CharField(max_length=20, blank=True)
    languages = models.JSONField(default=list, blank=True)
    countries = models.JSONField(default=list, blank=True)
    synopsis = models.TextField(blank=True)
    poster_url = models.URLField(max_length=500, blank=True)

    genres = models.ManyToManyField(Genre, blank=True, related_name="media_items")
    tags = models.ManyToManyField(Tag, blank=True, related_name="media_items")

    # Credits are stored on the Credit through-model (role: director/creator/actor).
    # Convenience M2M proxies removed to avoid duplicate through-relation errors;
    # access via item.credits.select_related("person").filter(role=...).

    # IMDb metadata
    imdb_rating = models.FloatField(null=True, blank=True)
    imdb_votes = models.IntegerField(null=True, blank=True)
    personal_rating = models.FloatField(null=True, blank=True)

    # Watchlist context
    watch_status = models.CharField(
        max_length=20, choices=WATCH_STATUS_CHOICES, default="unwatched"
    )
    watchlist_context = models.CharField(
        max_length=20, choices=WATCHLIST_CONTEXT_CHOICES, default="none"
    )
    watchlist_added_at = models.DateTimeField(null=True, blank=True)

    # Parents guide (structured categories + personal notes)
    parents_guide = models.JSONField(default=dict, blank=True)
    parents_guide_notes = models.JSONField(default=dict, blank=True)
    parental_notes = models.TextField(blank=True)

    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.title_en} ({self.year})"


class Credit(TimestampedModel):
    CREDIT_ROLE_CHOICES = [
        ("director", "Director"),
        ("creator", "Creator"),
        ("actor", "Actor"),
    ]

    media_item = models.ForeignKey(MediaItem, on_delete=models.CASCADE, related_name="credits")
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="credits")
    role = models.CharField(max_length=20, choices=CREDIT_ROLE_CHOICES, default="actor")
    character_name = models.CharField(max_length=200, blank=True)
    order = models.IntegerField(default=0)

    class Meta:
        unique_together = [("media_item", "person", "role", "character_name")]
        ordering = ["role", "order"]


class Season(TimestampedModel):
    media_item = models.ForeignKey(MediaItem, on_delete=models.CASCADE, related_name="seasons")
    season_number = models.IntegerField()
    imdb_id = models.CharField(max_length=20, blank=True)
    title = models.CharField(max_length=300, blank=True)
    year = models.IntegerField(null=True, blank=True)
    overview = models.TextField(blank=True)
    poster_url = models.URLField(max_length=500, blank=True)

    # Bottom-up rollups (recomputed whenever episodes change)
    avg_imdb_rating = models.FloatField(null=True, blank=True)
    watched_count = models.IntegerField(default=0)
    episode_count = models.IntegerField(default=0)

    class Meta:
        unique_together = [("media_item", "season_number")]
        ordering = ["season_number"]


class Episode(TimestampedModel):
    WATCH_STATUS_CHOICES = MediaItem.WATCH_STATUS_CHOICES

    season = models.ForeignKey(Season, on_delete=models.CASCADE, related_name="episodes")
    episode_number = models.IntegerField()
    imdb_id = models.CharField(max_length=20, blank=True)
    title = models.CharField(max_length=300, blank=True)
    air_date = models.DateField(null=True, blank=True)
    runtime_minutes = models.IntegerField(null=True, blank=True)
    overview = models.TextField(blank=True)
    still_url = models.URLField(max_length=500, blank=True)
    imdb_rating = models.FloatField(null=True, blank=True)
    imdb_votes = models.IntegerField(null=True, blank=True)
    personal_rating = models.FloatField(null=True, blank=True)
    watch_status = models.CharField(
        max_length=20, choices=WATCH_STATUS_CHOICES, default="unwatched"
    )

    class Meta:
        unique_together = [("season", "episode_number")]
        ordering = ["episode_number"]


class MediaFile(TimestampedModel):
    VERSION_TAG_CHOICES = [
        ("theatrical", "Theatrical"),
        ("extended", "Extended"),
        ("imax", "IMAX"),
        ("remastered", "Remastered"),
        ("other", "Other"),
    ]

    media_item = models.ForeignKey(MediaItem, on_delete=models.CASCADE, related_name="files")
    hard_drive = models.ForeignKey(
        HardDrive, null=True, blank=True, on_delete=models.SET_NULL, related_name="files"
    )
    file_path = models.CharField(max_length=1000)
    file_name = models.CharField(max_length=300, blank=True)
    file_size_bytes = models.BigIntegerField(null=True, blank=True)
    quality = models.CharField(max_length=20, blank=True)  # 1080p, 2160p...
    source = models.CharField(max_length=50, blank=True)  # WEB-DL, BluRay...
    codec = models.CharField(max_length=50, blank=True)
    version_tag = models.CharField(
        max_length=20, choices=VERSION_TAG_CHOICES, blank=True, default=""
    )
    is_multi_part = models.BooleanField(default=False)
    part_number = models.IntegerField(null=True, blank=True)
    episode = models.ForeignKey(
        Episode, null=True, blank=True, on_delete=models.SET_NULL, related_name="files"
    )

    class Meta:
        ordering = ["part_number", "file_name"]

    def __str__(self):
        return self.file_name or self.file_path
