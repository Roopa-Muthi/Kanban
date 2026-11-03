from django.test import TestCase
import pytest
from django.contrib.auth import get_user_model

User = get_user_model()
pytestmark = pytest.mark.django_db

VALID = {"username": "newuser", "email": "new@example.com", "password": "Str0ng#Pass-2026"}


def test_register_succeeds_and_hides_password(anon):
    r = anon.post("/auth/register", VALID, format="json")
    assert r.status_code == 201
    assert "password" not in r.data
    user = User.objects.get(username="newuser")
    assert user.check_password(VALID["password"])
    assert user.password != VALID["password"]  # stored hashed


def test_register_duplicate_username(anon, user_a):
    r = anon.post("/auth/register", {**VALID, "username": "alice"}, format="json")
    assert r.status_code == 400
    assert "username" in r.data


def test_register_duplicate_email_is_case_insensitive(anon, user_a):
    r = anon.post("/auth/register", {**VALID, "email": "ALICE@example.com"}, format="json")
    assert r.status_code == 400
    assert "email" in r.data


def test_register_weak_password(anon):
    r = anon.post("/auth/register", {**VALID, "password": "123"}, format="json")
    assert r.status_code == 400
    assert "password" in r.data


def test_register_requires_email(anon):
    body = {k: v for k, v in VALID.items() if k != "email"}
    assert anon.post("/auth/register", body, format="json").status_code == 400


def test_login_then_me(anon, user_a):
    r = anon.post("/auth/login", {"username": "alice", "password": "Str0ng#Pass-2026"}, format="json")
    assert r.status_code == 200
    assert {"access", "refresh"} <= set(r.data)

    me = anon.get("/auth/me", HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
    assert me.status_code == 200
    assert me.data["username"] == "alice"


def test_login_wrong_password(anon, user_a):
    r = anon.post("/auth/login", {"username": "alice", "password": "wrong"}, format="json")
    assert r.status_code == 401


def test_me_requires_valid_token(anon):
    assert anon.get("/auth/me").status_code == 401
    assert anon.get("/auth/me", HTTP_AUTHORIZATION="Bearer garbage").status_code == 401

# Create your tests here.
