"""DRF serializers for Media KArchive.

Nested writes are supported for MediaItem (genres/tags/credits/files/seasons)
so the frontend can save a full entity in one PUT, matching the shape it
already uses in localStorage today.
"""
from django.utils import timezone
from rest_framework import serializers

from .models import (
    Credit,
    Episode,
    Genre,
    HardDrive,
    MediaFile,
    MediaItem,
    Person,
    Season,
    Tag,
)


class HardDriveSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)

    class Meta:
        model = HardDrive
        fields = [
            "id", "label", "name", "mount_path", "is_connected",
            "total_size_gb", "free_size_gb", "created_at", "updated_at",
        ]


class GenreSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    parent_genre_id = serializers.PrimaryKeyRelatedField(
        source="parent_genre", queryset=Genre.objects.all(),
        allow_null=True, required=False,
    )

    class Meta:
        model = Genre
        fields = [
            "id", "imdb_genre_id", "name", "genre_type",
            "parent_genre_id", "created_at", "updated_at",
        ]


class TagSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)

    class Meta:
        model = Tag
        fields = ["id", "name", "color", "created_at", "updated_at"]


class PersonSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)

    class Meta:
        model = Person
        fields = [
            "id", "imdb_person_id", "name", "original_name",
            "roles", "bio", "profile_image_url", "created_at", "updated_at",
        ]


class CreditSerializer(serializers.ModelSerializer):
    person = PersonSerializer(read_only=True)
    person_id = serializers.PrimaryKeyRelatedField(
        source="person", queryset=Person.objects.all(), write_only=True, required=False
    )

    class Meta:
        model = Credit
        fields = ["id", "person", "person_id", "role", "character_name", "order"]


class EpisodeSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)

    class Meta:
        model = Episode
        fields = [
            "id", "episode_number", "imdb_id", "title", "air_date",
            "runtime_minutes", "overview", "still_url",
            "imdb_rating", "imdb_votes", "personal_rating", "watch_status",
        ]


class SeasonSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    episodes = EpisodeSerializer(many=True, read_only=True)

    class Meta:
        model = Season
        fields = [
            "id", "season_number", "imdb_id", "title", "year", "overview",
            "poster_url", "avg_imdb_rating", "watched_count", "episode_count",
            "episodes",
        ]


class MediaFileSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    hard_drive_id = serializers.PrimaryKeyRelatedField(
        source="hard_drive", queryset=HardDrive.objects.all(),
        allow_null=True, required=False,
    )

    class Meta:
        model = MediaFile
        fields = [
            "id", "file_path", "file_name", "file_size_bytes", "quality",
            "source", "codec", "version_tag", "is_multi_part", "part_number",
            "hard_drive_id", "episode",
        ]


class MediaItemSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    genres = GenreSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    credits = CreditSerializer(many=True, read_only=True)
    files = MediaFileSerializer(many=True, read_only=True)
    seasons = SeasonSerializer(many=True, read_only=True)

    # Write-side convenience fields (frontend sends ids / nested payloads)
    genre_ids = serializers.PrimaryKeyRelatedField(
        queryset=Genre.objects.all(), many=True, required=False, write_only=True
    )
    tag_ids = serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.all(), many=True, required=False, write_only=True
    )
    season_payloads = serializers.ListField(
        child=serializers.DictField(), required=False, write_only=True
    )

    class Meta:
        model = MediaItem
        fields = [
            "id", "imdb_id", "media_type", "title_en", "title_original",
            "year", "end_year", "mpa_rating", "runtime_minutes", "aspect_ratio",
            "languages", "countries", "synopsis", "poster_url",
            "genres", "genre_ids", "tags", "tag_ids", "credits",
            "imdb_rating", "imdb_votes", "personal_rating",
            "watch_status", "watchlist_context", "watchlist_added_at",
            "parents_guide", "parental_notes", "notes",
            "files", "seasons", "season_payloads",
            "created_at", "updated_at",
        ]

    def _apply_relations(self, instance):
        initial = self.initial_data or {}
        rel = getattr(self, "_relation_data", {})
        if "genre_ids" in initial:
            instance.genres.set(rel.get("genre_ids", []))
        if "tag_ids" in initial:
            instance.tags.set(rel.get("tag_ids", []))
        payload = rel.get("season_payloads") or initial.get("season_payloads")
        if payload:
            self._sync_seasons(instance, payload)

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        # Keep relation payloads for post-save handling; strip them from the
        # dict passed to Model.create()/update() by keeping a copy here.
        self._relation_data = {
            k: ret.pop(k) for k in ("genre_ids", "tag_ids", "season_payloads") if k in ret
        }
        return ret

    def _sync_seasons(self, item, payloads):
        """Replace season/episode tree from nested JSON payload."""
        item.seasons.all().delete()
        for sdata in payloads:
            season = Season.objects.create(
                media_item=item,
                season_number=sdata.get("season_number", 1),
                imdb_id=sdata.get("imdb_id", ""),
                title=sdata.get("title", ""),
                year=sdata.get("year"),
                overview=sdata.get("overview", ""),
                poster_url=sdata.get("poster_url", ""),
            )
            for edata in sdata.get("episodes", []):
                Episode.objects.create(
                    season=season,
                    episode_number=edata.get("episode_number", 0),
                    imdb_id=edata.get("imdb_id", ""),
                    title=edata.get("title", ""),
                    air_date=edata.get("air_date"),
                    runtime_minutes=edata.get("runtime_minutes"),
                    overview=edata.get("overview", ""),
                    still_url=edata.get("still_url", ""),
                    imdb_rating=edata.get("imdb_rating"),
                    imdb_votes=edata.get("imdb_votes"),
                    personal_rating=edata.get("personal_rating"),
                    watch_status=edata.get("watch_status", "unwatched"),
                )
            from .selectors import recompute_season
            recompute_season(season)

    def create(self, validated_data):
        validated_data.setdefault("watchlist_added_at", None)
        instance = super().create(validated_data)
        self._apply_relations(instance)
        return instance

    def update(self, instance, validated_data):
        if "watchlist_context" in validated_data and \
                validated_data["watchlist_context"] not in ("none", "", None) and \
                instance.watchlist_context != validated_data["watchlist_context"]:
            validated_data["watchlist_added_at"] = timezone.now()
        instance = super().update(instance, validated_data)
        self._apply_relations(instance)
        return instance


class BulkImportRowSerializer(serializers.Serializer):
    """One row of an Excel/CSV/clipboard bulk import."""

    imdb_id = serializers.CharField(required=False, allow_blank=True)
    title_en = serializers.CharField()
    title_original = serializers.CharField(required=False, allow_blank=True)
    year = serializers.IntegerField(required=False)
    media_type = serializers.ChoiceField(choices=MediaItem.MEDIA_TYPE_CHOICES, required=False)
    genres = serializers.ListField(child=serializers.CharField(), required=False)
    tags = serializers.ListField(child=serializers.CharField(), required=False)
    file_path = serializers.CharField(required=False, allow_blank=True)
    hard_drive_label = serializers.CharField(required=False, allow_blank=True)
    skip_duplicates = serializers.BooleanField(required=False, default=True)


class BulkImportSerializer(serializers.Serializer):
    rows = BulkImportRowSerializer(many=True)
