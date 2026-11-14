from django.db.models import Max, Prefetch
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Board, Card, Column
from .serializers import (
    BoardDetailSerializer,
    BoardSerializer,
    CardSerializer,
    ColumnSerializer,
    MoveCardSerializer,
)
from .services import POSITION_GAP, move_card


def next_position(queryset):
    last = queryset.aggregate(m=Max("position"))["m"]
    return (last or 0) + POSITION_GAP


class BoardViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # schema generation: no real user
            return Board.objects.none()
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
        # ColumnViewSet.get_queryset
        if getattr(self, "swagger_fake_view", False):
            return Column.objects.none()
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
        # CardViewSet.get_queryset
        if getattr(self, "swagger_fake_view", False):
            return Card.objects.none()
        return Card.objects.filter(column__board__owner=self.request.user)

    def perform_create(self, serializer):
        column = serializer.validated_data["column"]
        serializer.save(
            created_by=self.request.user,
            position=next_position(column.cards.all()),
        )
    
    @extend_schema(request=MoveCardSerializer, responses=CardSerializer)
    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        card = self.get_object()  # owner-scoped queryset, so someone else's card is a 404
        serializer = MoveCardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        moved = move_card(
            request.user,
            card.pk,
            data["column_id"],
            data.get("before_id"),
            data.get("after_id"),
        )
        return Response(CardSerializer(moved, context=self.get_serializer_context()).data)
    