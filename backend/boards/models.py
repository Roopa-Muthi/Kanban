from django.conf import settings
from django.db import models


class Board(models.Model):
    name = models.CharField(max_length=200)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="boards",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class Column(models.Model):
    board = models.ForeignKey(
        Board, on_delete=models.CASCADE, related_name="columns"
    )
    title = models.CharField(max_length=200)
    position = models.FloatField()

    class Meta:
        ordering = ["position"]
        indexes = [models.Index(fields=["board", "position"])]

    def __str__(self):
        return f"{self.title} ({self.board.name})"


class Card(models.Model):
    column = models.ForeignKey(
        Column, on_delete=models.CASCADE, related_name="cards"
    )
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    position = models.FloatField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_cards",
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_cards",
    )
    due_date = models.DateField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position"]
        indexes = [models.Index(fields=["column", "position"])]

    def __str__(self):
        return self.title
