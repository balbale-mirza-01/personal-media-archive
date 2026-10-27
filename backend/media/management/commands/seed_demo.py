"""Seed the database with demo data equivalent to the frontend seedData.js."""
from django.contrib.auth.models import Permission, User
from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand

from media import models as media_models
from media.models import Credit, Episode, Genre, HardDrive, MediaFile, MediaItem, Person, Season, Tag


class Command(BaseCommand):
    help = "Seed demo hard drives, genres, tags, persons and media items."

    def _grant_media_perms(self, user, superuser=False):
        """Give demo users rights on every media model so the Django admin
        panel isn't empty ('You don't have permission...') after seeding."""
        perms = []
        for model in [media_models.HardDrive, media_models.Genre, media_models.Tag,
                      media_models.Person, media_models.Credit, media_models.MediaFile,
                      media_models.Season, media_models.Episode, media_models.MediaItem]:
            ct = ContentType.objects.get_for_model(model)
            perms += list(Permission.objects.filter(content_type=ct))
        user.user_permissions.set(perms)
        if superuser:
            user.is_superuser = True

    def handle(self, *a, **kw):
        # Demo users (matches the kept admin/user login page).
        # Always reset password + staff flags so re-running repairs broken state.
        for uname, is_staff in [("admin", True), ("user", False)]:
            u, created = User.objects.get_or_create(username=uname)
            if created or not u.has_usable_password():
                u.set_password("demo1234")
            u.is_staff = is_staff
            self._grant_media_perms(u, superuser=is_staff)
            u.save()

        # Idempotent seeding: get_or_create everywhere so re-running after a
        # partial failure never hits UNIQUE constraint errors (issue #1).
        def drive(label, **kw):
            obj, _ = HardDrive.objects.get_or_create(label=label, defaults=kw)
            return obj

        drives = {
            "HDD1": drive("HDD1", name="Seagate Backup Plus", mount_path="/mnt/hdd1", is_connected=True, total_size_gb=2000, free_size_gb=640),
            "LAPTOP": drive("LAPTOP", name="Internal SSD", mount_path="/home", is_connected=True, total_size_gb=512, free_size_gb=120),
        }
        def _genre(**kw):
            obj, _ = Genre.objects.get_or_create(name=kw.pop("name"), defaults=kw)
            return obj

        def _tag(**kw):
            obj, _ = Tag.objects.get_or_create(name=kw.pop("name"), defaults=kw)
            return obj

        def _person(imdb_person_id, **kw):
            obj, _ = Person.objects.get_or_create(imdb_person_id=imdb_person_id, defaults=kw)
            return obj

        g_action = _genre(imdb_genre_id="in1000001", name="Action")
        _genre(imdb_genre_id="in1000002", name="Sci-Fi")
        _genre(imdb_genre_id="in1000003", name="Drama")
        g_thriller = _genre(imdb_genre_id="in1000004", name="Thriller")
        _genre(imdb_genre_id="in1000005", name="Superhero", genre_type="sub", parent_genre=g_action)
        _genre(imdb_genre_id="in1000006", name="Space Opera", genre_type="sub", parent_genre=Genre.objects.get(name="Sci-Fi"))
        t_4k = _tag(name="4K Master", color="teal")
        _tag(name="Family Night", color="emerald")

        nolan = _person(imdb_person_id="nm0634240", name="Christopher Nolan", roles=["director", "writer"])
        mcconaughey = _person(imdb_person_id="nm0198896", name="Matthew McConaughey", roles=["actor"])
        glover = _person(imdb_person_id="nm0000423", name="Danny Glover", roles=["actor"])

        inter, _ = MediaItem.objects.get_or_create(
            imdb_id="tt0816692", title_en="Interstellar", year=2014, mpa_rating="PG-13",
            runtime_minutes=169, aspect_ratio="2.39:1", languages=["English"], countries=["USA"],
            imdb_rating=8.7, imdb_votes=1900000, personal_rating=9.5,
            watch_status="watched", parents_guide={"violence": "None notable", "language": "Mild"},
        )
        inter.genres.add(Genre.objects.get(name="Sci-Fi"), g_action)
        inter.tags.add(t_4k)
        Credit.objects.get_or_create(media_item=inter, person=nolan, role="director")[0]
        Credit.objects.get_or_create(media_item=inter, person=mcconaughey, role="actor", defaults={"character_name": "Cooper", "order": 1})[0]
        _ = MediaFile.objects.get_or_create(file_path="/mnt/hdd1/Movies/Interstellar.2014.2160p.mkv", defaults={"media_item": inter, "hard_drive": drives["HDD1"], "file_name": "Interstellar.2014.2160p.mkv", "file_size_bytes": 68_000_000_000, "quality": "2160p", "source": "BluRay"})

        series, _ = MediaItem.objects.get_or_create(
            imdb_id="tt0903747", media_type="series", title_en="Breaking Bad",
            year=2008, end_year=2013, mpa_rating="TV-MA", runtime_minutes=49,
            imdb_rating=9.5, imdb_votes=2000000, watchlist_context="alone",
        )
        s1, _ = Season.objects.get_or_create(media_item=series, season_number=1, defaults={"title": "Season 1"})
        for i in (1, 2):
            Episode.objects.get_or_create(season=s1, episode_number=i, defaults={"title": f"Ep{i}", "imdb_rating": 8.0 + i, "watch_status": "watched" if i == 1 else "unwatched"})
        from media.selectors import recompute_season, recompute_series
        recompute_season(s1)
        recompute_series(series)

        self.stdout.write(self.style.SUCCESS(
            f"Seeded: {MediaItem.objects.count()} items, {Person.objects.count()} persons, "
            f"{Genre.objects.count()} genres, {HardDrive.objects.count()} drives."
        ))
