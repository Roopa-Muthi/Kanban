from django.contrib import admin
from .models import Board, Column, Card


@admin.register(Board)
class BoardAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "created_at")


@admin.register(Column)
class ColumnAdmin(admin.ModelAdmin):
    list_display = ("title", "board", "position")
    list_filter = ("board",)


@admin.register(Card)
class CardAdmin(admin.ModelAdmin):
    list_display = ("title", "column", "position", "assignee", "version")
    list_filter = ("column__board",)