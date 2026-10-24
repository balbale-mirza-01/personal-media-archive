"""Seed the database with demo data equivalent to the frontend seedData.js."""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from media.models import Credit, Episode, Genre, HardDrive, MediaFile, MediaItem, Person, Season, Tag


class Command(BaseCommand):
    help = "Seed demo hard drives, genres, tags, persons and media items."

    def handle(self, *a, **kw):
        # Demo users (matches the kept admin/user login page)
        for uname, is_staff in [("admin", True), ("user", False)]:
            u, created = User.objects.get_or_create(username=uname)
            if created:
                u.set_password("demo1234")
                u.is_staff = is_staff
                u.save()

        drives = {
            "HDD1": HardDrive.objects.create(label="HDD1", name="Seagate Backup Plus", mount_path="/mnt/hdd1", is_connected=True, total_size_gb=2000, free_size_gb=640),
            "LAPTOP": HardDrive.objects.create(label="LAPTOP", name="Internal SSD", mount_path="/home", is_connected=True, total_size_gb=512, free_size_gb=120),
        }
        g_action = Genre.objects.create(imdb_genre_id="in1000001", name="Action")
        Genre.objects.create(imdb_genre_id="in1000002", name="Sci-Fi")
        Genre.objects.create(imdb_genre_id="in1000003", name="Drama")
        g_thriller = Genre.objects.create(imdb_genre_id="in1000004", name="Thriller")
        Genre.objects.create(imdb_genre_id="in1000005", name="Superhero", genre_type="sub", parent_genre=g_action)
        Genre.objects.create(imdb_genre_id="in1000006", name="Space Opera", genre_type="sub", parent_genre=Genre.objects.get(name="Sci-Fi"))
        t_4k = Tag.objects.create(name="4K Master", color="teal")
        Tag.objects.create(name="Family Night", color="emerald")

        nolan = Person.objects.create(imdb_person_id="nm0634240", name="Christopher Nolan", roles=["director", "writer"])
        mcconaughey = Person.objects.create(imdb_person_id="nm0198896", name="Matthew McConaughey", roles=["actor"])
        glover = Person.objects.create(imdb_person_id="nm0000423", name="Danny Glover", roles=["actor"])

        inter = MediaItem.objects.create(
            imdb_id="tt0816692", title_en="Interstellar", year=2014, mpa_rating="PG-13",
            runtime_minutes=169, aspect_ratio="2.39:1", languages=["English"], countries=["USA"],
            imdb_rating=8.7, imdb_votes=1900000, personal_rating=9.5,
            watch_status="watched", parents_guide={"violence": "None notable", "language": "Mild"},
        )
        inter.genres.add(Genre.objects.get(name="Sci-Fi"), g_action)
        inter.tags.add(t_4k)
        Credit.objects.create(media_item=inter, person=nolan, role="director")
        Credit.objects.create(media_item=inter, person=mcconaughey, role="actor", character_name="Cooper", order=1)
        MediaFile.objects.create(media_item=inter, hard_drive=drives["HDD1"], file_path="/mnt/hdd1/Movies/Interstellar.2014.2160p.mkv", file_name="Interstellar.2014.2160p.mkv", file_size_bytes=68_000_000_000, quality="2160p", source="BluRay")

        series = MediaItem.objects.create(
            imdb_id="tt0903747", media_type="series", title_en="Breaking Bad",
            year=2008, end_year=2013, mpa_rating="TV-MA", runtime_minutes=49,
            imdb_rating=9.5, imdb_votes=2000000, watchlist_context="alone",
        )
        s1 = Season.objects.create(media_item=series, season_number=1, title="Season 1")
        for i in (1, 2):
            Episode.objects.create(season=s1, episode_number=i, title=f"Ep{i}", imdb_rating=8.0 + i, watch_status="watched" if i == 1 else "unwatched")
        from media.selectors import recompute_season, recompute_series
        recompute_season(s1)
        recompute_series(series)

        self.stdout.write(self.style.SUCCESS(
            f"Seeded: {MediaItem.objects.count()} items, {Person.objects.count()} persons, "
            f"{Genre.objects.count()} genres, {HardDrive.objects.count()} drives."
        ))
