"""Phase 6 tests: filename parser, folder scanner, IMDb client, ingest pipeline, API."""
import os
import shutil
import tempfile

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from .filename_parser import parse_filename
from .imdb_client import get_title_details, search_titles
from .ingest import ingest_selections
from .models import Credit, Episode, MediaFile, MediaItem, Person, Season
from .scanner import scan_directory


class FilenameParserTests(TestCase):
    def test_movie_dotted_release(self):
        p = parse_filename("The.Matrix.1999.1080p.BluRay.x264-NTb.mkv")
        self.assertEqual(p["title_guess"], "The Matrix")
        self.assertEqual(p["year"], 1999)
        self.assertEqual(p.get("quality"), "1080p")

    def test_movie_spaced_with_paren_year(self):
        p = parse_filename("Inception (2010) 2160p WEB-DL.mkv")
        self.assertEqual(p["title_guess"], "Inception")
        self.assertEqual(p["year"], 2010)
        self.assertEqual(p.get("quality"), "2160p")

    def test_episode_sxxexx(self):
        p = parse_filename("Breaking.Bad.S01E02.720p.mkv")
        self.assertEqual(p["title_guess"], "Breaking Bad")
        self.assertEqual((p.get("season"), p.get("episode")), (1, 2))

    def test_multi_part_cd(self):
        p = parse_filename("Avatar.2009.CD1.mkv")
        self.assertTrue(p.get("multi_part") or p.get("part_number"))


class ScannerTests(TestCase):
    FIXTURE = [
        "movies/The.Matrix.1999.1080p.BluRay.x264.mkv",
        "movies/Inception.2010.2160p.WEB-DL.mp4",
        "series/Breaking Bad/Season 01/Breaking.Bad.S01E01.1080p.mkv",
        "series/Breaking Bad/Season 01/Breaking.Bad.S01E02.1080p.mkv",
        "series/Breaking Bad/Season 02/Breaking.Bad.S02E01.1080p.mkv",
        "notes.txt",
    ]

    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="scan_fixture_")
        for rel in self.FIXTURE:
            path = os.path.join(self.root, *rel.split("/"))
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as fh:
                fh.write("x" * 100)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_groups_movies_and_series(self):
        groups, stats = scan_directory(self.root)
        movies = {g["title_guess"]: g for g in groups if g["kind"] == "movie"}
        self.assertIn("The Matrix", movies)
        self.assertIn("Inception", movies)
        series = {g["title_guess"]: g for g in groups if g["kind"] == "series"}
        bb = series["Breaking Bad"]
        per_season = {s["season"]: len(s["episodes"]) for s in bb["seasons"]}
        self.assertEqual(per_season, {1: 2, 2: 1})
        self.assertEqual(stats["video_files"], 5)

    def test_invalid_path_raises(self):
        with self.assertRaises(ValueError):
            scan_directory("/nonexistent/path/xyz")


class ImdbClientTests(TestCase):
    def test_search_returns_candidates(self):
        cands = search_titles("matrix", 1999)
        self.assertIn("tt0133093", [c["imdb_id"] for c in cands])

    def test_details_shape(self):
        d = get_title_details("tt0133093")
        self.assertIsNotNone(d)
        self.assertEqual(d["title"], "The Matrix")
        self.assertTrue(any(g.lower() in ("action", "sci-fi") for g in d["genres"]))
        people = d.get("directors", []) + d.get("stars", [])
        self.assertTrue(any(p.get("nm", "").startswith("nm") for p in people))

    def test_unknown_id_returns_none(self):
        self.assertIsNone(get_title_details("tt9999999"))


class IngestPipelineTests(TestCase):
    def test_ingest_movie_and_series(self):
        selections = [
            {"imdb_id": "tt0133093", "kind": "movie", "title_guess": "The Matrix",
             "year": 1999,
             "files": [{"file_path": "/tmp/fixture/matrix.mkv", "file_size_bytes": 100}]},
            {"imdb_id": "tt0903747", "kind": "series", "title_guess": "Breaking Bad",
             "year": 2008,
             "seasons": [{"season": 1, "episodes": [
                 {"episode": 1, "files": [{"file_path": "/tmp/fixture/bb.s01e01.mkv",
                                            "file_size_bytes": 100}]},
                 {"episode": 2, "files": [{"file_path": "/tmp/fixture/bb.s01e02.mkv",
                                            "file_size_bytes": 100}]},
             ]}]},
        ]
        results = ingest_selections(selections)
        self.assertEqual(len(results), 2)
        self.assertTrue(all(r["item_created"] for r in results))

        movie = MediaItem.objects.get(imdb_id="tt0133093")
        self.assertEqual(movie.media_type, "movie")
        self.assertTrue(movie.genres.exists())
        self.assertTrue(
            Credit.objects.filter(media_item=movie, role__in=["director", "creator"]).exists())
        self.assertTrue(Person.objects.filter(imdb_person_id__startswith="nm").exists())
        self.assertEqual(MediaFile.objects.filter(media_item=movie).count(), 1)

        series = MediaItem.objects.get(imdb_id="tt0903747")
        self.assertEqual(series.media_type, "series")
        season = Season.objects.get(media_item=series, season_number=1)
        self.assertEqual(Episode.objects.filter(season=season).count(), 2)
        self.assertEqual(
            MediaFile.objects.filter(media_item=series, episode__isnull=False).count(), 2)

    def test_dedup_on_second_ingest(self):
        sel = [{"imdb_id": "tt0133093", "kind": "movie", "title_guess": "The Matrix",
                "year": 1999,
                "files": [{"file_path": "/tmp/fixture/matrix.mkv", "file_size_bytes": 100}]}]
        ingest_selections(sel)
        before = MediaItem.objects.count()
        results = ingest_selections(sel)
        self.assertEqual(MediaItem.objects.count(), before)
        self.assertFalse(results[0]["item_created"])


class Phase6ApiTests(TestCase):
    def setUp(self):
        User.objects.create_user("tester", password="pass1234")
        self.client = APIClient()
        token = self.client.post(
            "/api/auth/token/", {"username": "tester", "password": "pass1234"}
        ).data["token"]
        self.client.credentials(HTTP_AUTHORIZATION="Token " + token)

    def test_imdb_search_endpoint(self):
        resp = self.client.get("/api/imdb/search/?q=matrix&year=1999")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("tt0133093", [c["imdb_id"] for c in resp.data["candidates"]])

    def test_scan_then_ingest_end_to_end(self):
        root = tempfile.mkdtemp(prefix="api_scan_")
        try:
            path = os.path.join(root, "The.Matrix.1999.1080p.BluRay.x264.mkv")
            with open(path, "w") as fh:
                fh.write("x" * 50)

            resp = self.client.post("/api/scan/", {"path": root}, format="json")
            self.assertEqual(resp.status_code, 200)
            titles = [g["title_guess"] for g in resp.data["groups"] if g["kind"] == "movie"]
            self.assertIn("The Matrix", titles)

            resp = self.client.post("/api/ingest/", {"selections": [{
                "imdb_id": "tt0133093", "kind": "movie", "title_guess": "The Matrix",
                "year": 1999,
                "files": [{"file_path": path, "file_size_bytes": 50}]}]}, format="json")
            self.assertEqual(resp.status_code, 200)
            self.assertTrue(MediaItem.objects.filter(imdb_id="tt0133093").exists())
            self.assertTrue(MediaFile.objects.filter(file_path=path).exists())
        finally:
            shutil.rmtree(root, ignore_errors=True)

    def test_scan_bad_path_returns_400(self):
        resp = self.client.post("/api/scan/", {"path": "/no/such/dir"}, format="json")
        self.assertEqual(resp.status_code, 400)
