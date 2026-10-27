from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("media-items", views.MediaItemViewSet, basename="mediaitem")
router.register("genres", views.GenreViewSet, basename="genre")
router.register("tags", views.TagViewSet, basename="tag")
router.register("persons", views.PersonViewSet, basename="person")
router.register("hard-drives", views.HardDriveViewSet, basename="harddrive")
router.register("seasons", views.SeasonViewSet, basename="season")

urlpatterns = [
    path("", include(router.urls)),
    path("health/", views.health, name="health"),
    path("auth/token/", views.obtain_token, name="obtain-token"),
    path("bulk-import/", views.bulk_import, name="bulk-import"),
    path("scan/", views.scan, name="scan"),
    path("imdb/search/", views.imdb_search, name="imdb-search"),
    path("ingest/", views.ingest, name="ingest"),
    path("episodes/<int:pk>/toggle/", views.episode_toggle, name="episode-toggle"),
    path("seasons/<int:pk>/recompute/", views.season_recompute, name="season-recompute"),
]
