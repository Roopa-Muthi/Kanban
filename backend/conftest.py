import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from boards.models import Board, Card, Column

User = get_user_model()


@pytest.fixture
def user_a(db):
    return User.objects.create_user("alice", "alice@example.com", "Str0ng#Pass-2026")


@pytest.fixture
def user_b(db):
    return User.objects.create_user("bob", "bob@example.com", "Str0ng#Pass-2026")


@pytest.fixture
def anon():
    return APIClient()


@pytest.fixture
def client_a(user_a):
    c = APIClient()
    c.force_authenticate(user_a)
    return c


@pytest.fixture
def client_b(user_b):
    c = APIClient()
    c.force_authenticate(user_b)
    return c


@pytest.fixture
def board_a(user_a):
    return Board.objects.create(name="Alice board", owner=user_a)


@pytest.fixture
def column_a(board_a):
    return Column.objects.create(board=board_a, title="Todo", position=1000)


@pytest.fixture
def card_a(column_a, user_a):
    return Card.objects.create(
        column=column_a, title="Alice card", position=1000, created_by=user_a
    )