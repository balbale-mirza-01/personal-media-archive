from django.contrib import admin

from .models import Credit, Episode, Genre, HardDrive, MediaFile, MediaItem, Person, Season, Tag

admin.site.register(HardDrive)
admin.site.register(Genre)
admin.site.register(Tag)
admin.site.register(Person)
admin.site.register(Credit)
admin.site.register(MediaFile)


class EpisodeInline(admin.TabularInline):
    model = Episode
    extra = 0


@admin.register(Season)
class SeasonAdmin(admin.ModelAdmin):
    inlines = [EpisodeInline]


@admin.register(MediaItem)
class MediaItemAdmin(admin.ModelAdmin):
    list_display = ["title_en", "imdb_id", "media_type", "year", "watch_status", "watchlist_context"]
    search_fields = ["title_en", "imdb_id"]
    filter_horizontal = ["genres", "tags"]
