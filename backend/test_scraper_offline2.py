"""Offline unit tests for the __NEXT_DATA__ extraction layer (no network).

Run:  python manage.py test test_scraper_offline2
"""
import json
from unittest import mock

from django.test import TestCase

from media import imdb_scraper


def wrap(payload):
    return ('<html><body><script id="__NEXT_DATA__" type="application/json">'
            + json.dumps(payload) + "</script></body></html>")


MATRIX_TITLE = {
    "__typename": "TitleName",
    "id": "tt0133093",
    "titleText": {"text": "The Matrix"},
    "releaseYear": {"year": 1999},
    "titleType": {"id": "feature", "text": "Feature"},
    "titleImage": {"primaryImage": {"url": "/m/xx.jpg"}},
}

FIND_PAYLOAD = {
    "props": {"pageProps": {"serverApp": {"data": {
        "findRoot": {"__typename": "FindResults",
                     "exact": {"__ref": "row:tt0133093"}},
        "row:tt0133093": MATRIX_TITLE,
    }}}}}

INCEPTION_TITLE = {
    "__typename": "TitleName",
    "id": "tt1375666",
    "titleText": {"text": "Inception"},
    "originalTitleText": {"text": "Inception"},
    "releaseYear": {"year": 2010},
    "plot": {"simpleText": "A thief who steals corporate secrets..."},
    "ratingsMetadata": {"ratingCount": {"meanRating": {"original": 8.4},
                                         "count": {"original": 2600000}}},
    "titleType": {"id": "feature", "text": "Feature"},
}

MAIN_DETAILS = {
    "__typename": "TitleMainDetails",
    "runtime": {"seconds": 8880},
    "certificate": {"label": "PG-13"},
    "genres": {"genreList": [{"text": "Sci-Fi", "url": "/genres/genre/SCI-FI"},
                             {"text": "Thriller", "url": "/genres/genre/THRILLER"}]},
    "interests": {"edges": [{"node": {"name": "Mind-Bending",
                                      "url": "/interest/in0000077/"}}]},
    "credits": {"edges": [
        {"node": {"name": {"id": "nm0418279", "name": "Christopher Nolan"},
                  "category": {"text": "Director"}}},
        {"node": {"name": {"id": "nm0000138", "name": "Leonardo DiCaprio"},
                  "category": {"text": "Actor"},
                  "characters": [{"name": "Cobb"}]}},
    ]},
}

TITLE_PAYLOAD = {
    "props": {"pageProps": {"serverApp": {"data": {
        "atf": INCEPTION_TITLE,
        "main": MAIN_DETAILS,
    }}}}}

PG_PAYLOAD = {
    "props": {"pageProps": {"serverApp": {"data": {
        "pg": {"__typename": "TitleParentalGuideTypesAndAdvisories",
               "sex_nudity": {"status": {"label": "Mild"},
                              "contentDescriptions": [{"text": "Some nudity"}]},
               "violence_gore": {"status": {"label": "Severe"},
                                 "contentDescriptions": [{"text": "Strong gun violence"}]}},
    }}}}}

FIND_HTML = wrap(FIND_PAYLOAD)
TITLE_HTML = wrap(TITLE_PAYLOAD)
PG_HTML = wrap(PG_PAYLOAD)


class NextDataExtractionTests(TestCase):
    def test_find_parses_next_data(self):
        with mock.patch.object(imdb_scraper, "fetch_html", return_value=FIND_HTML), \
             mock.patch.object(imdb_scraper, "_enrich_people", lambda d: None):
            rows = imdb_scraper.scrape_find("the matrix", 1999)
        self.assertEqual(len(rows), 1, rows)
        self.assertEqual(rows[0]["imdb_id"], "tt0133093")
        self.assertEqual(rows[0]["title"], "The Matrix")
        self.assertEqual(rows[0]["year"], 1999)

    def test_title_details_parses_next_data(self):
        def fake_fetch(url, *a, **k):
            return PG_HTML if "parentalguide" in url else TITLE_HTML
        with mock.patch.object(imdb_scraper, "fetch_html", side_effect=fake_fetch), \
             mock.patch.object(imdb_scraper, "_enrich_people", lambda d: None):
            d = imdb_scraper.scrape_title_details("tt1375666")
        self.assertEqual(d["title"], "Inception")
        self.assertEqual(d["year"], 2010)
        self.assertEqual(d["imdb_rating"], 8.4)
        self.assertGreaterEqual(d["imdb_votes"], 1_000_000)
        self.assertEqual(d["runtime_minutes"], 148)
        self.assertEqual(d["mpa_rating"], "PG-13")
        self.assertIn("corporate secrets", d["synopsis"])
        stars = [s["name"] for s in d.get("stars", [])]
        self.assertIn("Leonardo DiCaprio", stars)
        directors = [x["name"] for x in d.get("directors", [])]
        self.assertIn("Christopher Nolan", directors)
        names = {g["name"] for g in d.get("genres", [])}
        self.assertIn("Sci-Fi", names)
        self.assertIn("Mind-Bending", names)  # sub-genre from interest node
        pg = (d.get("parents_guide") or {}).get("categories", {})
        self.assertEqual(pg.get("violence_gore", {}).get("severity_key"), "severe")
        self.assertEqual(pg.get("sex_nudity", {}).get("severity_key"), "mild")

    def test_bulk_match_offline_scrape_layer(self):
        from media.bulk_match import bulk_match_lines

        def fake_fetch(url, *a, **k):
            if "/find/" in url:
                return FIND_HTML
            return PG_HTML if "parentalguide" in url else TITLE_HTML
        with mock.patch.object(imdb_scraper, "fetch_html", side_effect=fake_fetch), \
             mock.patch.object(imdb_scraper, "_enrich_people", lambda d: None):
            rows, summary = bulk_match_lines([
                "tt10370710",
                "The.Matrix.1999.1080p.BluRay.x264-GRP.mkv",
            ])
        self.assertEqual(summary["total"], 2)
        self.assertEqual(rows[0]["status"], "verified_id")
        self.assertIn(rows[1]["status"], ("auto_matched", "needs_review"))
