from pathlib import Path

import pytest
from django.conf import settings
from django.core.management import call_command
from drf_spectacular.generators import SchemaGenerator


@pytest.fixture(scope="module")
def schema():
    return SchemaGenerator().get_schema(request=None, public=True)


def component(schema, name):
    return schema["components"]["schemas"][name]


def response_schema(schema, path, method, status):
    body = schema["paths"][path][method]["responses"][status]["content"]["application/json"]["schema"]
    return component(schema, body["$ref"].rsplit("/", 1)[1])


def test_committed_schema_is_current(tmp_path):
    committed = Path(settings.BASE_DIR).parent / "openapi.yml"
    generated = tmp_path / "openapi.yml"
    call_command("spectacular", file=str(generated), validate=True, fail_on_warn=True)

    assert committed.exists(), "openapi.yml is missing. Run: python manage.py spectacular --file ../openapi.yml"
    assert generated.read_text(encoding="utf-8") == committed.read_text(encoding="utf-8"), (
        "openapi.yml is out of date. Regenerate it with "
        "`python manage.py spectacular --file ../openapi.yml`, then run `npm run gen:api` in frontend/."
    )


def test_response_schemas_list_every_field(schema):
    for name in ("Board", "BoardDetail", "Column", "ColumnWithCards", "Card", "User"):
        s = component(schema, name)
        assert set(s["required"]) == set(s["properties"]), name


def test_nullable_card_fields(schema):
    props = component(schema, "Card")["properties"]
    assert props["assignee"].get("nullable") is True
    assert props["due_date"].get("nullable") is True


def test_card_create_and_patch_requests(schema):
    create = component(schema, "CardRequest")
    assert set(create["required"]) == {"column", "title"}

    patch = component(schema, "PatchedCardRequest")
    assert "required" not in patch
    assert set(patch["properties"]) == {"column", "title", "description", "assignee", "due_date"}


def test_move_request_contract(schema):
    body = schema["paths"]["/cards/{id}/move"]["post"]["requestBody"]["content"]["application/json"]["schema"]
    assert body["$ref"].endswith("/MoveCardRequest")
    move = component(schema, "MoveCardRequest")
    assert set(move["required"]) == {"column_id"}
    assert {"before_id", "after_id"} <= set(move["properties"])


def test_token_responses(schema):
    login = response_schema(schema, "/auth/login", "post", "200")
    assert {"access", "refresh"} <= set(login["properties"])
    refresh = response_schema(schema, "/auth/refresh", "post", "200")
    assert "access" in refresh["properties"]


def test_protected_routes_declare_auth(schema):
    security = schema["paths"]["/boards"]["get"].get("security")
    assert security and security != [{}]