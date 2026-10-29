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
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Person
        fields = [
            "id", "imdb_person_id", "first_name", "last_name", "full_name",
            "original_name",
            "roles", "bio", "profile_image_url", "created_at", "updated_at",
        ]
        extra_kwargs = {
            "first_name": {"allow_blank": False},
        }

    def validate(self, attrs):
        """Require at least one of first/last name to be non-blank."""
        data = super().validate(attrs)
        instance = self.instance
        first = (data.get("first_name")
                 if "first_name" in data
                 else getattr(instance, "first_name", "") or "")
        last = (data.get("last_name")
                if "last_name" in data
                else getattr(instance, "last_name", "") or "")
        if not (first.strip() or last.strip()):
            raise serializers.ValidationError(
                {"first_name": ["This field may not be blank."]}
            )
        return data


class CreditSerializer(serializers.ModelSerializer):
    person = PersonSerializer(read_only=True)

    class Meta:
        model = Credit
        fields = ["id", "person", "role", "character_name", "order"]


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
    file_payloads = serializers.ListField(
        child=serializers.DictField(), required=False, write_only=True
    )
    credit_payloads = serializers.ListField(
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
            "file_payloads", "credit_payloads",
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
        fpayload = rel.get("file_payloads")
        if fpayload is not None:
            self._sync_files(instance, fpayload)
        cpayload = rel.get("credit_payloads")
        if cpayload is not None:
            self._sync_credits(instance, cpayload)

    def _sync_files(self, instance, payloads):
        """Replace the item's physical file rows from a nested payload."""
        episode_map = {}
        for season in instance.seasons.prefetch_related("episodes"):
            for ep in season.episodes.all():
                episode_map[f"{season.season_number}x{ep.episode_number}"] = ep
        instance.files.all().delete()
        for fdata in payloads:
            ep_key = fdata.get("episode_ref")  # e.g. "1x03" (optional)
            episode = None
            if ep_key and ep_key in episode_map:
                episode = episode_map[ep_key]
            elif fdata.get("episode"):
                try:
                    episode = Episode.objects.get(pk=fdata["episode"])
                except (Episode.DoesNotExist, ValueError, TypeError):
                    episode = None
            MediaFile.objects.create(
                media_item=instance,
                hard_drive_id=fdata.get("hard_drive_id"),
                file_path=fdata.get("file_path", ""),
                file_name=fdata.get("file_name", ""),
                file_size_bytes=fdata.get("file_size_bytes"),
                quality=fdata.get("quality", "") or "",
                source=fdata.get("source", "") or "",
                codec=fdata.get("codec", "") or "",
                version_tag=(fdata.get("version_tag") or "").lower()
                if (fdata.get("version_tag") or "").lower()
                in dict(MediaFile.VERSION_TAG_CHOICES)
                else "",
                is_multi_part=bool(fdata.get("is_multi_part")),
                part_number=fdata.get("part_number") or 1,
                episode=episode,
            )

    def _sync_credits(self, instance, payloads):
        """Replace cast/crew from [{person, role, character_name, order}]"""
        from .models import Credit

        instance.credits.all().delete()
        valid_roles = dict(Credit.CREDIT_ROLE_CHOICES)
        for i, cdata in enumerate(payloads):
            person_id = cdata.get("person") or cdata.get("person_id")
            if not person_id:
                continue
            try:
                person = Person.objects.get(pk=person_id)
            except (Person.DoesNotExist, ValueError, TypeError):
                continue
            role = cdata.get("role", "actor")
            if role not in valid_roles:
                role = "actor"
            Credit.objects.create(
                media_item=instance,
                person=person,
                role=role,
                character_name=cdata.get("character_name", "") or "",
                order=cdata.get("order", i),
            )

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        # Keep relation payloads for post-save handling; strip them from the
        # dict passed to Model.create()/update() by keeping a copy here.
        self._relation_data = {
            k: ret.pop(k)
            for k in (
                "genre_ids",
                "tag_ids",
                "season_payloads",
                "file_payloads",
                "credit_payloads",
            )
            if k in ret
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
    """One row of an Excel/CSV/clipboard bulk import.

    Accepts both API-style keys (title_en/year) and the frontend store's
    keys (title_english/release_year); aliases are normalized in validate().
    """

    imdb_id = serializers.CharField(required=False, allow_blank=True)
    title_en = serializers.CharField(required=False)
    title_english = serializers.CharField(required=False)
    title_original = serializers.CharField(required=False, allow_blank=True)
    year = serializers.IntegerField(required=False)
    release_year = serializers.IntegerField(required=False)
    media_type = serializers.ChoiceField(choices=MediaItem.MEDIA_TYPE_CHOICES, required=False)
    type = serializers.CharField(required=False)
    genres = serializers.ListField(child=serializers.CharField(), required=False)
    tags = serializers.ListField(child=serializers.CharField(), required=False)
    file_path = serializers.CharField(required=False, allow_blank=True)
    hard_drive_label = serializers.CharField(required=False, allow_blank=True)
    skip_duplicates = serializers.BooleanField(required=False, default=True)
    mode = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("title_en"):
            if not attrs.get("title_english"):
                raise serializers.ValidationError("title_en or title_english is required")
            attrs["title_en"] = attrs.pop("title_english")
        else:
            attrs.pop("title_english", None)
        if attrs.get("year") is None and attrs.get("release_year") is not None:
            attrs["year"] = attrs.pop("release_year")
        else:
            attrs.pop("release_year", None)
        if not attrs.get("media_type") and attrs.get("type") in ("movie", "series"):
            attrs["media_type"] = attrs["type"]
        attrs.pop("type", None)
        return attrs


class BulkImportSerializer(serializers.Serializer):
    rows = BulkImportRowSerializer(many=True)
    mode = serializers.ChoiceField(
        choices=["create", "skip", "update"], required=False, default="skip"
    )
