import pytest

from boards.models import Board, Card, Column

pytestmark = pytest.mark.django_db


@pytest.fixture
def cards(column_a, user_a):
    return {
        t: Card.objects.create(column=column_a, title=t, position=p, created_by=user_a)
        for t, p in (("A", 1000), ("B", 2000), ("C", 3000))
    }


@pytest.fixture
def done_column(board_a):
    return Column.objects.create(board=board_a, title="Done", position=2000)


def order(column):
    return list(
        Card.objects.filter(column=column).order_by("position").values_list("title", flat=True)
    )


def move(client, card, column, before=None, after=None):
    return client.post(
        f"/cards/{card.id}/move",
        {
            "column_id": column.id,
            "before_id": before.id if before else None,
            "after_id": after.id if after else None,
        },
        format="json",
    )


# ---------- positions within a column ----------

def test_move_to_top(client_a, column_a, cards):
    r = move(client_a, cards["C"], column_a, after=cards["A"])
    assert r.status_code == 200
    assert order(column_a) == ["C", "A", "B"]


def test_move_between_neighbors(client_a, column_a, cards):
    r = move(client_a, cards["C"], column_a, before=cards["A"], after=cards["B"])
    assert r.status_code == 200
    assert order(column_a) == ["A", "C", "B"]
    assert r.data["position"] == 1500


def test_move_to_bottom(client_a, column_a, cards):
    r = move(client_a, cards["A"], column_a, before=cards["C"])
    assert r.status_code == 200
    assert order(column_a) == ["B", "C", "A"]
    assert r.data["position"] == 4000


def test_only_before_resolves_the_card_below(client_a, column_a, cards):
    move(client_a, cards["A"], column_a, before=cards["B"])
    assert order(column_a) == ["B", "A", "C"]


def test_only_after_resolves_the_card_above(client_a, column_a, cards):
    move(client_a, cards["C"], column_a, after=cards["B"])
    assert order(column_a) == ["A", "C", "B"]


def test_move_bumps_version(client_a, column_a, cards):
    r = move(client_a, cards["C"], column_a, after=cards["A"])
    assert r.data["version"] == 2


# ---------- across columns ----------

def test_move_into_empty_column(client_a, column_a, done_column, cards):
    r = move(client_a, cards["B"], done_column)
    assert r.status_code == 200
    assert r.data["column"] == done_column.id
    assert r.data["position"] == 1000
    assert order(column_a) == ["A", "C"]


def test_move_across_columns_between_cards(client_a, column_a, done_column, cards, user_a):
    x = Card.objects.create(column=done_column, title="X", position=1000, created_by=user_a)
    y = Card.objects.create(column=done_column, title="Y", position=2000, created_by=user_a)
    r = move(client_a, cards["A"], done_column, before=x, after=y)
    assert r.status_code == 200
    assert order(done_column) == ["X", "A", "Y"]
    assert order(column_a) == ["B", "C"]


# ---------- rebalance ----------

def test_rebalance_when_gap_is_too_small(client_a, column_a, user_a):
    x = Card.objects.create(column=column_a, title="X", position=1000, created_by=user_a)
    y = Card.objects.create(column=column_a, title="Y", position=1000.0000001, created_by=user_a)
    z = Card.objects.create(column=column_a, title="Z", position=5000, created_by=user_a)
    r = move(client_a, z, column_a, before=x, after=y)
    assert r.status_code == 200
    assert order(column_a) == ["X", "Z", "Y"]
    positions = list(
        Card.objects.filter(column=column_a).order_by("position").values_list("position", flat=True)
    )
    assert all(b - a >= 1 for a, b in zip(positions, positions[1:]))


# ---------- validation ----------

def test_both_neighbors_missing_in_nonempty_column_is_rejected(client_a, column_a, cards):
    assert move(client_a, cards["A"], column_a).status_code == 400


def test_neighbor_must_be_in_target_column(client_a, done_column, cards):
    r = move(client_a, cards["A"], done_column, before=cards["B"])  # B lives in the other column
    assert r.status_code == 400


def test_card_cannot_be_its_own_neighbor(client_a, column_a, cards):
    assert move(client_a, cards["A"], column_a, before=cards["A"]).status_code == 400


def test_neighbors_in_wrong_order_are_rejected(client_a, column_a, cards):
    r = move(client_a, cards["C"], column_a, before=cards["B"], after=cards["A"])
    assert r.status_code == 400


# ---------- isolation ----------

def test_cannot_move_someone_elses_card(client_b, column_a, cards):
    assert move(client_b, cards["A"], column_a, after=cards["B"]).status_code == 404
    assert order(column_a) == ["A", "B", "C"]


def test_cannot_move_into_someone_elses_column(client_a, cards, user_b):
    board = Board.objects.create(name="Bob board", owner=user_b)
    col = Column.objects.create(board=board, title="Bob col", position=1000)
    assert move(client_a, cards["A"], col).status_code == 400
    cards["A"].refresh_from_db()
    assert cards["A"].column_id != col.id


def test_cannot_move_across_boards_even_if_both_are_yours(client_a, cards, user_a):
    other_board = Board.objects.create(name="Second", owner=user_a)
    col = Column.objects.create(board=other_board, title="Elsewhere", position=1000)
    assert move(client_a, cards["A"], col).status_code == 400


def test_move_requires_login(anon, column_a, cards):
    assert move(anon, cards["A"], column_a, after=cards["B"]).status_code == 401