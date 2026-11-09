from datetime import date

import pytest

pytestmark = pytest.mark.django_db


def test_update_description_and_due_date(client_a, card_a):
    r = client_a.patch(
        f"/cards/{card_a.id}",
        {"description": "Line one\nLine two", "due_date": "2026-12-01"},
        format="json",
    )
    assert r.status_code == 200
    card_a.refresh_from_db()
    assert card_a.description == "Line one\nLine two"
    assert card_a.due_date == date(2026, 12, 1)
    assert card_a.version == 2


def test_clear_due_date_and_assignee(client_a, card_a, user_a):
    card_a.due_date = date(2026, 12, 1)
    card_a.assignee = user_a
    card_a.save()
    r = client_a.patch(f"/cards/{card_a.id}", {"due_date": None, "assignee": None}, format="json")
    assert r.status_code == 200
    card_a.refresh_from_db()
    assert card_a.due_date is None
    assert card_a.assignee is None


def test_invalid_due_dates_are_rejected(client_a, card_a):
    for bad in ("not-a-date", "2026-13-45"):
        r = client_a.patch(f"/cards/{card_a.id}", {"due_date": bad}, format="json")
        assert r.status_code == 400, bad
        assert "due_date" in r.data
    card_a.refresh_from_db()
    assert card_a.due_date is None


def test_description_length_limit(client_a, card_a):
    ok = client_a.patch(f"/cards/{card_a.id}", {"description": "x" * 5000}, format="json")
    assert ok.status_code == 200
    too_long = client_a.patch(f"/cards/{card_a.id}", {"description": "x" * 5001}, format="json")
    assert too_long.status_code == 400
    assert "description" in too_long.data
    card_a.refresh_from_db()
    assert len(card_a.description) == 5000


def test_description_whitespace_is_preserved(client_a, card_a):
    client_a.patch(f"/cards/{card_a.id}", {"description": "  indented\n\n"}, format="json")
    card_a.refresh_from_db()
    assert card_a.description == "  indented\n\n"