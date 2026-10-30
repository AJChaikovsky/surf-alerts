import pytest
from fastapi.testclient import TestClient

from app.auth import CSRF_COOKIE_NAME, CSRF_HEADER_NAME
from app.server import create_application


@pytest.fixture
def client(tmp_path, db_session_factory):
    # A stand-in for the built frontend.
    (tmp_path / "index.html").write_text("<!doctype html><title>Surf Alerts</title>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log('hi')")

    return TestClient(create_application(tmp_path))


def test_root_serves_the_frontend(client):
    response = client.get("/")

    assert response.status_code == 200
    assert "<title>Surf Alerts</title>" in response.text


def test_built_assets_are_served(client):
    assert client.get("/assets/app.js").text == "console.log('hi')"


def test_api_is_served_under_api_prefix(client):
    assert client.get("/api/health").json() == {"status": "healthy"}
    assert client.get("/api/spots").status_code == 200


def test_query_strings_reach_the_api(client):
    # /api/spots/{slug}/forecast and similar routes must keep their paths.
    assert client.get("/api/spots/not-a-spot/forecast").status_code == 404


def test_login_and_csrf_work_through_the_prefix(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "prod@example.com", "password": "a-strong-password"}
    )

    assert response.status_code == 201

    # Without the header the CSRF middleware still rejects changes...
    assert client.post("/api/auth/logout").status_code == 403

    # ...and with it they go through.
    client.headers[CSRF_HEADER_NAME] = client.cookies[CSRF_COOKIE_NAME]

    assert client.post("/api/auth/logout").status_code == 200


def test_unknown_api_route_is_a_json_404(client):
    response = client.get("/api/not-a-route")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_missing_files_are_404_not_500(client):
    assert client.get("/does-not-exist").status_code == 404
    assert client.get("/assets/not-a-real-file.js").status_code == 404
