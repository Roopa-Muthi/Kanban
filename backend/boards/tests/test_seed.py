from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APIClient

from boards.management.commands.seed_demo import DEMO_PASSWORD, DEMO_USERNAME
from boards.models import Board, Card, Column

User = get_user_model()
pytestmark = pytest.mark.django_db


def seed(*args):
    call_command("seed_demo", *args, stdout=StringIO())


def test_creates_the_demo_account_with_boards_columns_and_cards():
    seed()
    user = User.objects.get(username=DEMO_USERNAME)
    assert user.check_password(DEMO_PASSWORD)
    assert not user.is_staff and not user.is_superuser
    names = set(Board.objects.filter(owner=user).values_list("name", flat=True))
    assert names == {"Product launch", "Weekend project"}
    assert Column.objects.filter(board__owner=user).count() == 7
    assert Card.objects.filter(column__board__owner=user).count() == 14


def test_positions_are_evenly_spaced_and_cards_belong_to_the_demo_user():
    seed()
    for board in Board.objects.all():
        columns = list(board.columns.order_by("position"))
        assert [c.position for c in columns] == [1000.0 * i for i in range(1, len(columns) + 1)]
        for column in columns:
            positions = list(column.cards.order_by("position").values_list("position", flat=True))
            assert positions == [1000.0 * i for i in range(1, len(positions) + 1)]
    assert not Card.objects.exclude(created_by__username=DEMO_USERNAME).exists()
    assert not Card.objects.exclude(version=1).exists()


def test_running_twice_does_not_duplicate_anything():
    seed()
    seed()
    assert User.objects.filter(username=DEMO_USERNAME).count() == 1
    assert Board.objects.count() == 2
    assert Column.objects.count() == 7
    assert Card.objects.count() == 14


def test_rerun_restores_the_password_but_keeps_existing_edits():
    seed()
    user = User.objects.get(username=DEMO_USERNAME)
    user.set_password("something-else")
    user.save()
    Card.objects.filter(title="Choose a domain name").update(title="Edited")

    seed()

    user.refresh_from_db()
    assert user.check_password(DEMO_PASSWORD)
    assert Card.objects.filter(title="Edited").exists()  # a normal run leaves the boards alone


def test_reset_restores_the_demo_data_and_leaves_other_users_alone(board_a):
    seed()
    Card.objects.filter(title="Choose a domain name").update(title="Edited")
    Board.objects.filter(owner__username=DEMO_USERNAME, name="Weekend project").delete()

    seed("--reset")

    assert not Card.objects.filter(title="Edited").exists()
    assert Board.objects.filter(owner__username=DEMO_USERNAME).count() == 2
    assert Card.objects.filter(column__board__owner__username=DEMO_USERNAME).count() == 14
    assert Board.objects.filter(pk=board_a.pk).exists()  # somebody else's board survives


def test_demo_can_log_in_and_sees_only_its_own_boards(anon, board_a):
    seed()
    login = anon.post(
        "/auth/login", {"username": DEMO_USERNAME, "password": DEMO_PASSWORD}, format="json"
    )
    assert login.status_code == 200

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    listing = client.get("/boards")
    assert [b["name"] for b in listing.data] == ["Product launch", "Weekend project"]

    detail = client.get(f"/boards/{listing.data[0]['id']}")
    assert [c["title"] for c in detail.data["columns"]] == ["Backlog", "In progress", "Review", "Done"]
    assert client.get(f"/boards/{board_a.id}").status_code == 404