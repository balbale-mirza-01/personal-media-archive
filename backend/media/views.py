"""DRF viewsets & API views for Media KArchive."""
from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .imdb_client import get_title_details, search_titles
from .ingest import ingest_selections
from .models import Credit, Genre, HardDrive, MediaFile, MediaItem, Person, Season, Tag
from .scanner import scan_directory
from .selectors import recompute_season, recompute_series
from .serializers import (
    BulkImportSerializer,
    GenreSerializer,
    HardDriveSerializer,
    MediaItemSerializer,
    PersonSerializer,
    SeasonSerializer,
    TagSerializer,
)


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """Unauthenticated liveness probe used by the frontend to decide
    whether to run in API mode or fall back to the local demo store."""
    from django.db import connection
    try:
        connection.ensure_connection()
        db = True
    except Exception:
        db = False
    return Response({"status": "ok", "db": db, "items": MediaItem.objects.count() if db else 0})


@api_view(["POST"])
@permission_classes([AllowAny])
def obtain_token(request):
    """Demo-login compatible endpoint: POST {username, password} -> {token}."""
    user = authenticate(
        request, username=request.data.get("username"), password=request.data.get("password")
    )
    if user is None:
        return Response({"detail": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "username": user.username})


class HardDriveViewSet(viewsets.ModelViewSet):
    queryset = HardDrive.objects.all()
    serializer_class = HardDriveSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ["label", "name"]


class GenreViewSet(viewsets.ModelViewSet):
    queryset = Genre.objects.select_related("parent_genre").all()
    serializer_class = GenreSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ["name", "imdb_genre_id"]

    def get_queryset(self):
        qs = super().get_queryset()
        gt = self.request.query_params.get("genre_type")
        parent = self.request.query_params.get("parent")
        if gt:
            qs = qs.filter(genre_type=gt)
        if parent:
            qs = qs.filter(parent_genre_id=parent)
        return qs


class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ["name"]


class PersonViewSet(viewsets.ModelViewSet):
    queryset = Person.objects.all()
    serializer_class = PersonSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ["first_name", "last_name", "imdb_person_id"]

    @action(detail=True, methods=["get"])
    def filmography(self, request, pk=None):
        person = self.get_object()
        items = MediaItem.objects.filter(credits__person=person).distinct()
        return Response(MediaItemSerializer(items, many=True).data)


class SeasonViewSet(viewsets.ModelViewSet):
    queryset = Season.objects.select_related("media_item").prefetch_related("episodes").all()
    serializer_class = SeasonSerializer
    permission_classes = [IsAuthenticated]

    def perform_destroy(self, instance):
        item = instance.media_item
        super().perform_destroy(instance)
        recompute_series(item)


class EpisodeActionMixin:
    """Extra write actions used by the SeriesTree accordion UI."""


class MediaItemViewSet(viewsets.ModelViewSet):
    queryset = MediaItem.objects.prefetch_related(
        "genres", "tags", "credits__person", "files", "seasons__episodes"
    ).all()
    serializer_class = MediaItemSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer(self, *args, **kwargs):
        # Accept the frontend's nested write payloads (cast/crew) under the
        # canonical `credit_payloads` key.
        data = kwargs.get("data")
        if data is None and len(args) > 1:
            data = args[1]
        try:
            has_credits = "credits" in data
        except TypeError:
            has_credits = False
        if has_credits and "credit_payloads" not in data:
            mutable = dict(data)
            raw = mutable.pop("credits")
            if isinstance(raw, list):
                mutable["credit_payloads"] = [
                    {
                        "person": c.get("person_id") or c.get("person"),
                        "role": c.get("role_type") or c.get("role") or "actor",
                        "character_name": c.get("character_name")
                        or (c.get("role") if c.get("role_type") == "actor" else ""),
                        "order": c.get("order", i),
                    }
                    for i, c in enumerate(raw)
                    if isinstance(c, dict)
                ]
            kwargs["data"] = mutable
        return super().get_serializer(*args, **kwargs)

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("search"):
            q = p["search"]
            from django.db.models import Q

            qs = qs.filter(Q(title_en__icontains=q) | Q(title_original__icontains=q) | Q(imdb_id=q))
        for field in ("media_type", "watch_status", "watchlist_context", "mpa_rating"):
            if p.get(field):
                qs = qs.filter(**{field: p[field]})
        if p.get("genre"):
            qs = qs.filter(genres__id=p["genre"]).distinct()
        if p.get("tag"):
            qs = qs.filter(tags__id=p["tag"]).distinct()
        if p.get("person"):
            qs = qs.filter(credits__person_id=p["person"]).distinct()
        if p.get("hard_drive"):
            qs = qs.filter(files__hard_drive_id=p["hard_drive"]).distinct()
        if p.get("year"):
            qs = qs.filter(year=int(p["year"]))
        ordering = p.get("ordering", "-created_at")
        return qs.order_by(ordering)

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        ids = request.data.get("ids", [])
        deleted, _ = MediaItem.objects.filter(id__in=ids).delete()
        return Response({"deleted": deleted})

    @action(detail=False, methods=["post"], url_path="bulk-add-genres")
    def bulk_add_genres(self, request):
        ids = request.data.get("ids", [])
        genre_ids = request.data.get("genre_ids", [])
        items = MediaItem.objects.filter(id__in=ids)
        for it in items:
            it.genres.add(*genre_ids)
        return Response({"updated": items.count()})

    @action(detail=False, methods=["post"], url_path="bulk-add-tags")
    def bulk_add_tags(self, request):
        ids = request.data.get("ids", [])
        tag_ids = request.data.get("tag_ids", [])
        items = MediaItem.objects.filter(id__in=ids)
        for it in items:
            it.tags.add(*tag_ids)
        return Response({"updated": items.count()})

    @action(detail=False, methods=["post"], url_path="bulk-move-files")
    def bulk_move_files(self, request):
        ids = request.data.get("ids", [])
        target = request.data.get("hard_drive_id")
        drive = HardDrive.objects.filter(id=target).first()
        from .models import MediaFile

        updated = MediaFile.objects.filter(media_item_id__in=ids).update(hard_drive=drive)
        return Response({"moved": updated})

    @action(detail=True, methods=["post"], url_path="toggle-watch")
    def toggle_watch(self, request, *args, **kwargs):
        item = self.get_object()
        item.watch_status = "watched" if item.watch_status != "watched" else "unwatched"
        item.save(update_fields=["watch_status", "updated_at"])
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["post"], url_path="watchlist")
    def watchlist(self, request, *args, **kwargs):
        """Add/remove a context to/from the watchlist."""
        item = self.get_object()
        context = request.data.get("context", "none")
        item.watchlist_context = context
        item.watchlist_added_at = timezone.now() if context != "none" else None
        item.save(update_fields=["watchlist_context", "watchlist_added_at", "updated_at"])
        return Response(self.get_serializer(item).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def episode_toggle(request, pk):
    """PATCH-free quick toggle for a single episode (SeriesTree checkbox)."""
    from .models import Episode

    ep = Episode.objects.get(pk=pk)
    ep.watch_status = "watched" if ep.watch_status != "watched" else "unwatched"
    ep.save(update_fields=["watch_status", "updated_at"])
    recompute_season(ep.season)
    recompute_series(ep.season.media_item)
    return Response({"id": str(ep.id), "watch_status": ep.watch_status})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def season_recompute(request, pk):
    season = Season.objects.get(pk=pk)
    recompute_season(season)
    recompute_series(season.media_item)
    return Response(SeasonSerializer(season).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bulk_import(request):
    """Excel/CSV/Clipboard rows -> MediaItems with duplicate detection.

    Body: {"rows": [{title_en, imdb_id?, year?, genres[], tags[],
                     file_path?, hard_drive_label?, skip_duplicates?}, ...]}
    """
    serializer = BulkImportSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    created, updated, skipped, errors = 0, 0, 0, []
    default_mode = serializer.validated_data.get("mode", "skip")

    with transaction.atomic():
        for idx, row in enumerate(serializer.validated_data["rows"]):
            title = row["title_en"].strip()
            imdb_id = (row.get("imdb_id") or "").strip()
            row_mode = row.get("mode") or default_mode
            skip_dup = row_mode != "create" and row.get("skip_duplicates", True)
            try:
                dup = None
                if imdb_id:
                    dup = MediaItem.objects.filter(imdb_id=imdb_id).first()
                if dup is None:
                    dup = MediaItem.objects.filter(title_en__iexact=title, year=row.get("year")).first()
                if dup and skip_dup:
                    skipped += 1
                    continue
                item = dup or MediaItem.objects.create(
                    imdb_id=imdb_id or f"tt{MediaItem.objects.count() + 5000000:07d}",
                    title_en=title,
                    title_original=row.get("title_original", ""),
                    year=row.get("year"),
                    media_type=row.get("media_type", "movie"),
                )
                if dup:
                    updated += 1
                else:
                    created += 1
                for gname in row.get("genres", []):
                    if gname.strip():
                        genre, _ = Genre.objects.get_or_create(name=gname.strip(),
                                                               defaults={"imdb_genre_id": f"in{abs(hash(gname)) % 10**7:07d}"})
                        item.genres.add(genre)
                for tname in row.get("tags", []):
                    if tname.strip():
                        tag, _ = Tag.objects.get_or_create(name=tname.strip())
                        item.tags.add(tag)
                fpath = (row.get("file_path") or "").strip()
                if fpath:
                    from .models import MediaFile

                    drive = HardDrive.objects.filter(label=row.get("hard_drive_label") or "").first()
                    MediaFile.objects.update_or_create(
                        media_item=item, file_path=fpath,
                        defaults={"file_name": fpath.replace("\\", "/").split("/")[-1],
                                  "hard_drive": drive},
                    )
                created += 1
            except Exception as exc:  # noqa: BLE001 - report per-row failures
                errors.append({"row": idx, "error": str(exc)})

    return Response({"created": created, "skipped": skipped, "errors": errors})


# ---------------------------------------------------------------------------
# Phase 6: Hard-drive scan & IMDb matcher/scraper endpoints
# ---------------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def scan(request):
    """Recursively scan a server-visible folder for MKV/MP4 files.

    Body: {"path": "/mnt/hdd1", "max_files": 5000}
    Returns grouped movie/series candidates ready for user verification plus
    per-group IMDb search hints (title_guess/year). Nothing is written to the DB.
    """
    path = (request.data.get("path") or "").strip()
    if not path:
        return Response({"error": "path is required"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        max_files = int(request.data.get("max_files", 5000))
    except (TypeError, ValueError):
        max_files = 5000
    try:
        groups, stats = scan_directory(path, max_files=max_files)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"path": path, "groups": groups, "stats": stats})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def imdb_search(request):
    """IMDb candidate list for user verification.

    Query params: q (required), year, type=movie|series.
    Also supports ?imdb_id=tt####### to fetch full scraped details directly.
    """
    imdb_id = (request.query_params.get("imdb_id") or "").strip()
    if imdb_id:
        details = get_title_details(imdb_id)
        if details is None:
            return Response({"error": f"No IMDb data for {imdb_id}"},
                            status=status.HTTP_404_NOT_FOUND)
        return Response({"imdb_id": imdb_id, "details": details})

    q = (request.query_params.get("q") or "").strip()
    if not q:
        return Response({"error": "q or imdb_id is required"},
                        status=status.HTTP_400_BAD_REQUEST)
    year = request.query_params.get("year")
    media_type = request.query_params.get("type")
    candidates = search_titles(q, int(year) if year else None, media_type)
    return Response({"query": q, "candidates": candidates})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ingest(request):
    """Ingest user-verified scan selections into the database.

    Body: {"selections": [{imdb_id, kind, title_guess, year,
                           files:[...] | seasons:[{season, episodes:[...]}]}]}
    Scrapes/fetches IMDb metadata per selection and writes MediaItem, Genre,
    Person, Credit, Season, Episode and MediaFile rows transactionally.
    """
    selections = request.data.get("selections")
    if not isinstance(selections, list) or not selections:
        return Response({"error": "selections[] is required"},
                        status=status.HTTP_400_BAD_REQUEST)
    try:
        results = ingest_selections(selections)
    except Exception as exc:  # noqa: BLE001 - surface pipeline errors as 400
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"results": results})
