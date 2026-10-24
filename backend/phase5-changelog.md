# Phase 5 Changelog — Django + DRF Backend

## New directory: `backend/`
- `config/settings.py` — DRF + TokenAuth + CORS for Vite (localhost:5173), SQLite DB.
- `config/urls.py` — mounts `/api/` (media app) and Django admin.
- `media/models.py` — HardDrive, Genre (imdb_genre_id `in#######`, hierarchical parent/sub), Tag, Person (`nm#######`), MediaItem (`tt#######`, MPA, runtime, aspect ratio, watchlist contexts, Parents Guide JSON), Credit (through model w/ role+order), Season, Episode, MediaFile (path/size/part/drive).
- `media/selectors.py` — bottom-up rollups: `recompute_season`, `recompute_series`, `touch_chain`.
- `media/serializers.py` — nested read serializers; write-side `genre_ids`, `tag_ids`, `season_payloads`; auto `watchlist_added_at`.
- `media/views.py` — ModelViewSets + filters (search/type/status/context/genre/tag/person/hard_drive/year/ordering); actions: bulk-delete, bulk-add-genres, bulk-add-tags, bulk-move-files, toggle-watch, watchlist; endpoints: auth/token, bulk-import (dedup by imdb_id or title+year), episodes/<id>/toggle (with rollup), seasons/<id>/recompute.
- `media/admin.py` — admin registrations with season/episode inlines.
- `media/management/commands/seed_demo.py` — seeds demo users (admin/user, pw `demo1234`) + data mirroring frontend seedData.
- `requirements.txt`.

## Verified via live server (all passed)
token auth ✓ | CRUD + nested relations ✓ | episode toggle → season avg 9.0, watched 1/2, series status rollup ✓ | bulk import created=1 skipped=1(dup) ✓ | search/filter ✓ | watchlist context + added_at ✓ | genre subtree ✓ | filmography ✓ | bulk delete ✓ | unauth 401 ✓

## Bugs fixed during testing
- Removed duplicate through-M2M proxies on MediaItem (models.E003).
- Serializer strips relation fields before Model.create/update.
- DRF custom actions accept pk kwargs.
