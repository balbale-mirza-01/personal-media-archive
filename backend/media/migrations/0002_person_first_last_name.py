"""Split Person.name into first_name / last_name.

The frontend works with separate name parts, so the model now stores
`first_name` and `last_name` instead of a single `name` field. Existing rows
are migrated by splitting the old full name on the first space.
"""
from django.db import migrations, models


def split_full_name(apps, schema_editor):
    Person = apps.get_model("media", "Person")
    db_alias = schema_editor.connection.alias
    for person in Person.objects.using(db_alias).all():
        full = (getattr(person, "name", "") or "").strip()
        parts = full.split(" ", 1)
        person.first_name = parts[0] if parts else ""
        person.last_name = parts[1] if len(parts) > 1 else ""
        person.save(update_fields=["first_name", "last_name"])


def join_names(apps, schema_editor):
    Person = apps.get_model("media", "Person")
    db_alias = schema_editor.connection.alias
    for person in Person.objects.using(db_alias).all():
        person.name = f"{person.first_name} {person.last_name}".strip()
        person.save(update_fields=["name"])


class Migration(migrations.Migration):

    dependencies = [
        ("media", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="person",
            name="first_name",
            field=models.CharField(max_length=100, blank=True),
        ),
        migrations.AddField(
            model_name="person",
            name="last_name",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.RunPython(split_full_name, join_names),
        migrations.RemoveField(
            model_name="person",
            name="name",
        ),
        migrations.AlterField(
            model_name="person",
            name="first_name",
            field=models.CharField(max_length=100),
        ),
    ]
