# Phase 6 Testing Guide

## Prereqs
pip install -r backend/requirements.txt   (Django, DRF, cors-headers)

## A. Automated test suite (fastest)
cd backend
IMDB_FORCE_OFFLINE=1 python manage.py test media.test_phase6 -v 2
-> 14 tests: parser(4) scanner(2) imdb client(3) ingest(2) API(3). All OK.

## B. CLI scanner
mkdir -p /tmp/demo_drive/movies "/tmp/demo_drive/series/Breaking Bad/Season 01"
touch /tmp/demo_drive/movies/The.Matrix.1999.1080p.BluRay.x264-NTb.mkv \
      /tmp/demo_drive/movies/Inception.2010.2160p.WEB-DL.mp4 \
      "/tmp/demo_drive/series/Breaking Bad/Season 01/Breaking.Bad.S01E01.1080p.mkv" \
      "/tmp/demo_drive/series/Breaking Bad/Season 01/Breaking.Bad.S01E02.1080p.mkv"

python manage.py scan --path /tmp/demo_drive --dry-run       # report only
python manage.py scan --path /tmp/demo_drive --auto-match    # ingest exact matches
Verify rows: MediaItem (imdb_id), Person (nm#######), Credit, Genre, Season, Episode, MediaFile.

## C. HTTP endpoints
python manage.py migrate && python manage.py seed_demo        # users admin/user, pass demo1234
python manage.py runserver 8000 &
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/token/ \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"demo1234"}' \
  | python -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# 1) Scan a folder (no DB writes):
curl -s -X POST http://127.0.0.1:8000/api/scan/ -H "Authorization: Token $TOKEN" \
     -H 'Content-Type: application/json' -d '{"path":"/tmp/demo_drive"}'
# expect groups[] (movies+series with files) and stats.video_files

# 2) IMDb candidate search (user verification list):
curl -s "http://127.0.0.1:8000/api/imdb/search/?q=matrix&year=1999" -H "Authorization: Token $TOKEN"
# expect candidates[] incl. tt0133093 ; also ?imdb_id=tt0133093 -> scraped details

# 3) Ingest verified selection:
curl -s -X POST http://127.0.0.1:8000/api/ingest/ -H "Authorization: Token $TOKEN" \
     -H 'Content-Type: application/json' -d '{"selections":[{"imdb_id":"tt0111161",
     "kind":"movie","title_guess":"Shawshank","year":1994,
     "files":[{"file_path":"/tmp/demo_drive/movies/Shawshank.1994.mkv","file_size_bytes":123}]}]}'
# expect results[0].item_created=true ; re-post same -> item_created=false (dedup)

# 4) Auth enforced: request without token -> 401

## D. Live IMDb mode (optional)
export IMDB_API_KEY=<key from imdbapi.com>; unset IMDB_FORCE_OFFLINE
Then /api/imdb/search/ hits real IMDb suggestion + Title/Credits/ParentsGuide APIs.
Offline fallback is automatic when key/network missing (IMDB_FORCE_OFFLINE=1 forces it).
