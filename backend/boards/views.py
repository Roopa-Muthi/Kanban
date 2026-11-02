from django.shortcuts import render

# Create your views here.
from django.db.models import Max, Prefetch
from rest_framework import mixins, viewsets

from .models import Board, Card, Column
from .serializers import (
    BoardDetailSerializer, BoardSerializer, CardSerializer, ColumnSerializer,
)

POSITION_GAP = 1000


def next_position(queryset):
    last = queryset.aggregate(m=Max("position"))["m"]
    return (last or 0) + POSITION_GAP


class BoardViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Board.objects.filter(owner=self.request.user)
        if self.action == "retrieve":
            qs = qs.prefetch_related(
                Prefetch("columns", queryset=Column.objects.prefetch_related("cards"))
            )
        return qs

    def get_serializer_class(self):
        return BoardDetailSerializer if self.action == "retrieve" else BoardSerializer

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ColumnViewSet(
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ColumnSerializer
    http_method_names = ["post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return Column.objects.filter(board__owner=self.request.user)

    def perform_create(self, serializer):
        board = serializer.validated_data["board"]
        serializer.save(position=next_position(board.columns.all()))


class CardViewSet(
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = CardSerializer
    http_method_names = ["post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return Card.objects.filter(column__board__owner=self.request.user)

    def perform_create(self, serializer):
        column = serializer.validated_data["column"]
        serializer.save(
            created_by=self.request.user,
            position=next_position(column.cards.all()),
        )