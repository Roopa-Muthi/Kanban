import pytest

from boards.models import Board, Card, Column

pytestmark = pytest.mark.django_db


# ---------- basic CRUD (own data) ----------

def test_create_and_list_boards(client_a):
    r = client_a.post("/boards", {"name": "Roadmap"}, format="json")
    assert r.status_code == 201
    assert Board.objects.get(pk=r.data["id"]).owner.username == "alice"
    assert len(client_a.get("/boards").data) == 1


def test_board_detail_is_nested(client_a, board_a, column_a, card_a):
    r = client_a.get(f"/boards/{board_a.id}")
    assert r.status_code == 200
    assert r.data["columns"][0]["title"] == "Todo"
    assert r.data["columns"][0]["cards"][0]["title"] == "Alice card"


def test_rename_and_delete_board(client_a, board_a):
    assert client_a.patch(f"/boards/{board_a.id}", {"name": "New"}, format="json").status_code == 200
    board_a.refresh_from_db()
    assert board_a.name == "New"
    assert client_a.delete(f"/boards/{board_a.id}").status_code == 204


def test_column_positions_are_server_assigned_and_increasing(client_a, board_a):
    first = client_a.post("/columns", {"board": board_a.id, "title": "A", "position": 5}, format="json")
    second = client_a.post("/columns", {"board": board_a.id, "title": "B"}, format="json")
    assert first.data["position"] == 1000   # client's value ignored
    assert second.data["position"] == 2000


def test_card_create_sets_server_fields(client_a, column_a, user_a):
    r = client_a.post(
        "/cards",
        {"column": column_a.id, "title": "X", "position": 1, "version": 50, "created_by": 999},
        format="json",
    )
    assert r.status_code == 201
    assert r.data["position"] == 1000
    assert r.data["version"] == 1
    assert r.data["created_by"] == user_a.id


def test_card_update_bumps_version_and_ignores_readonly(client_a, card_a):
    r = client_a.patch(
        f"/cards/{card_a.id}", {"title": "Renamed", "position": 5, "version": 99}, format="json"
    )
    assert r.status_code == 200
    card_a.refresh_from_db()
    assert card_a.title == "Renamed"
    assert card_a.version == 2
    assert card_a.position == 1000


def test_card_can_be_assigned_to_self(client_a, card_a, user_a):
    r = client_a.patch(f"/cards/{card_a.id}", {"assignee": user_a.id}, format="json")
    assert r.status_code == 200
    assert r.data["assignee"] == user_a.id


def test_deleting_board_cascades(client_a, board_a, column_a, card_a):
    client_a.delete(f"/boards/{board_a.id}")
    assert Column.objects.count() == 0
    assert Card.objects.count() == 0


# ---------- isolation (the important ones) ----------

def test_other_user_sees_no_boards(client_b, board_a):
    assert client_b.get("/boards").data == []


def test_other_user_cannot_read_update_or_delete_board(client_b, board_a):
    assert client_b.get(f"/boards/{board_a.id}").status_code == 404
    assert client_b.patch(f"/boards/{board_a.id}", {"name": "hacked"}, format="json").status_code == 404
    assert client_b.delete(f"/boards/{board_a.id}").status_code == 404
    board_a.refresh_from_db()
    assert board_a.name == "Alice board"


def test_other_user_cannot_update_or_delete_column(client_b, column_a):
    assert client_b.patch(f"/columns/{column_a.id}", {"title": "hacked"}, format="json").status_code == 404
    assert client_b.delete(f"/columns/{column_a.id}").status_code == 404
    assert Column.objects.filter(pk=column_a.id).exists()


def test_other_user_cannot_update_or_delete_card(client_b, card_a):
    assert client_b.patch(f"/cards/{card_a.id}", {"title": "hacked"}, format="json").status_code == 404
    assert client_b.delete(f"/cards/{card_a.id}").status_code == 404
    card_a.refresh_from_db()
    assert card_a.title == "Alice card"


def test_cannot_create_column_in_someone_elses_board(client_b, board_a):
    r = client_b.post("/columns", {"board": board_a.id, "title": "x"}, format="json")
    assert r.status_code == 400
    assert Column.objects.count() == 0


def test_cannot_create_card_in_someone_elses_column(client_b, column_a):
    r = client_b.post("/cards", {"column": column_a.id, "title": "x"}, format="json")
    assert r.status_code == 400
    assert Card.objects.count() == 0


def test_cannot_assign_card_to_another_user(client_a, card_a, user_b):
    r = client_a.patch(f"/cards/{card_a.id}", {"assignee": user_b.id}, format="json")
    assert r.status_code == 400


def test_cannot_move_card_to_someone_elses_column_via_patch(client_a, card_a, client_b, user_b):
    other_board = Board.objects.create(name="Bob board", owner=user_b)
    other_col = Column.objects.create(board=other_board, title="Bob col", position=1000)
    r = client_a.patch(f"/cards/{card_a.id}", {"column": other_col.id}, format="json")
    assert r.status_code == 400
    card_a.refresh_from_db()
    assert card_a.column_id != other_col.id


def test_card_column_cannot_change_via_patch_even_to_own_column(client_a, card_a, board_a):
    other = Column.objects.create(board=board_a, title="Done", position=2000)
    r = client_a.patch(f"/cards/{card_a.id}", {"column": other.id}, format="json")
    assert r.status_code == 400


def test_unauthenticated_requests_are_rejected(anon, board_a, column_a, card_a):
    assert anon.get("/boards").status_code == 401
    assert anon.get(f"/boards/{board_a.id}").status_code == 401
    assert anon.post("/columns", {"board": board_a.id, "title": "x"}, format="json").status_code == 401
    assert anon.post("/cards", {"column": column_a.id, "title": "x"}, format="json").status_code == 401
    assert anon.delete(f"/cards/{card_a.id}").status_code == 401