from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from .models import Board, Card, Column

User = get_user_model()


# Relation fields that can only point at objects the current user owns.
# Because the queryset is scoped, someone else's id and a nonexistent id
# produce the same "Invalid pk" error, so nothing leaks.
# The empty queryset given to super().__init__ tells the schema generator which model each
# field points at, and makes the field accept nothing if get_queryset is ever removed.
class OwnBoardField(serializers.PrimaryKeyRelatedField):
    def __init__(self, **kwargs):
        super().__init__(queryset=Board.objects.none(), **kwargs)

    def get_queryset(self):
        return Board.objects.filter(owner=self.context["request"].user)


class OwnColumnField(serializers.PrimaryKeyRelatedField):
    def __init__(self, **kwargs):
        super().__init__(queryset=Column.objects.none(), **kwargs)

    def get_queryset(self):
        return Column.objects.filter(board__owner=self.context["request"].user)


class SelfOnlyAssigneeField(serializers.PrimaryKeyRelatedField):
    # No memberships yet, so the only valid assignee is yourself.
    def __init__(self, **kwargs):
        super().__init__(queryset=User.objects.none(), **kwargs)

    def get_queryset(self):
        return User.objects.filter(pk=self.context["request"].user.pk)


class CardSerializer(serializers.ModelSerializer):
    column = OwnColumnField()
    assignee = SelfOnlyAssigneeField(required=False, allow_null=True)
    description = serializers.CharField(
        max_length=5000, allow_blank=True, required=False, trim_whitespace=False
    )

    class Meta:
        model = Card
        fields = (
            "id", "column", "title", "description", "position",
            "created_by", "assignee", "due_date", "version",
            "created_at", "updated_at",
        )
        read_only_fields = ("position", "created_by", "version", "created_at", "updated_at")

    def validate(self, attrs):
        if self.instance and "column" in attrs and attrs["column"].pk != self.instance.column_id:
            raise serializers.ValidationError(
                {"column": "Use POST /cards/{id}/move to change columns."}
            )
        return attrs

    def update(self, instance, validated_data):
        # Lock the row so two simultaneous updates can't both write the same version.
        with transaction.atomic():
            card = Card.objects.select_for_update().get(pk=instance.pk)
            for field, value in validated_data.items():
                setattr(card, field, value)
            card.version += 1
            card.save()   # save() (not queryset.update) so updated_at refreshes
        return card


class ColumnSerializer(serializers.ModelSerializer):
    board = OwnBoardField()

    class Meta:
        model = Column
        fields = ("id", "board", "title", "position")
        read_only_fields = ("position",)

    def validate(self, attrs):
        if self.instance and "board" in attrs and attrs["board"].pk != self.instance.board_id:
            raise serializers.ValidationError({"board": "A column can't change boards."})
        return attrs


class ColumnWithCardsSerializer(serializers.ModelSerializer):
    cards = CardSerializer(many=True, read_only=True)

    class Meta:
        model = Column
        fields = ("id", "title", "position", "cards")


class BoardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Board
        fields = ("id", "name", "created_at")
        read_only_fields = ("created_at",)


class BoardDetailSerializer(BoardSerializer):
    columns = ColumnWithCardsSerializer(many=True, read_only=True)

    class Meta(BoardSerializer.Meta):
        fields = BoardSerializer.Meta.fields + ("columns",)

class MoveCardSerializer(serializers.Serializer):
    column_id = serializers.IntegerField()
    before_id = serializers.IntegerField(required=False, allow_null=True)
    after_id = serializers.IntegerField(required=False, allow_null=True)