from django.db import transaction
from rest_framework.exceptions import NotFound, ValidationError

from .models import Card, Column

POSITION_GAP = 1000.0
MIN_GAP = 1e-6


def _rebalance(column, exclude_pk):
    """Renumber every card in the column (except the one being moved) in steps of POSITION_GAP."""
    cards = list(column.cards.exclude(pk=exclude_pk).order_by("position", "id"))
    for i, card in enumerate(cards, start=1):
        card.position = i * POSITION_GAP
    Card.objects.bulk_update(cards, ["position"])


def _neighbors(column, card_pk, before_id, after_id):
    """Return (above, below): the cards the moved card will sit between (either may be None)."""
    others = Card.objects.filter(column=column).exclude(pk=card_pk)
    above = below = None

    if before_id is not None:
        above = others.filter(pk=before_id).first()
        if above is None:
            raise ValidationError({"before_id": "Must be a card in the target column."})
    if after_id is not None:
        below = others.filter(pk=after_id).first()
        if below is None:
            raise ValidationError({"after_id": "Must be a card in the target column."})

    if above and below:
        if above.position > below.position:
            raise ValidationError("before_id must be above after_id.")
    elif above:
        below = others.filter(position__gt=above.position).order_by("position", "id").first()
    elif below:
        above = others.filter(position__lt=below.position).order_by("-position", "-id").first()
    elif others.exists():
        raise ValidationError("before_id or after_id is required when the target column has cards.")

    return above, below


def _position_between(above, below):
    if above and below:
        return (above.position + below.position) / 2
    if above:
        return above.position + POSITION_GAP
    if below:
        return below.position - POSITION_GAP
    return POSITION_GAP


@transaction.atomic
def move_card(user, card_id, column_id, before_id=None, after_id=None):
    card = (
        Card.objects.select_for_update(of=("self",))
        .select_related("column")
        .filter(pk=card_id, column__board__owner=user)
        .first()
    )
    if card is None:
        raise NotFound()

    # Locking the target column serializes concurrent moves into it.
    target = Column.objects.select_for_update().filter(pk=column_id, board__owner=user).first()
    if target is None:
        raise ValidationError({"column_id": "Invalid column."})
    if target.board_id != card.column.board_id:
        raise ValidationError({"column_id": "Cards can't move between boards."})
    if card.pk in (before_id, after_id):
        raise ValidationError("A card can't be placed next to itself.")

    above, below = _neighbors(target, card.pk, before_id, after_id)

    if above and below and below.position - above.position < MIN_GAP:
        _rebalance(target, card.pk)
        above.refresh_from_db(fields=["position"])
        below.refresh_from_db(fields=["position"])

    card.column = target
    card.position = _position_between(above, below)
    card.version += 1
    card.save(update_fields=["column", "position", "version", "updated_at"])
    return card