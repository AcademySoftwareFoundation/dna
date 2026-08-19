"""Tests for the exported OpenAPI spec.

The spec at `backend/docs/openapi.json` is generated from the FastAPI app, so
these tests guard against it going stale and against documentation gaps that
would silently degrade `/docs` and any generated clients.
"""

import json
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
SPEC_PATH = BACKEND_DIR / "docs" / "openapi.json"

sys.path.insert(0, str(BACKEND_DIR / "scripts"))

from export_openapi import generate_spec, serialize  # noqa: E402

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}

# Public endpoints that intentionally require no authentication.
UNAUTHENTICATED_PATHS = {
    ("get", "/"),
    ("get", "/health"),
    ("get", "/version-statuses"),
    ("get", "/api/mock-thumbnails/{version_id}"),
}


@pytest.fixture(scope="module")
def spec() -> dict:
    return generate_spec()


def iter_operations(spec: dict):
    """Yield (method, path, operation) for every HTTP operation in the spec."""
    for path, path_item in spec["paths"].items():
        for method, operation in path_item.items():
            if method in HTTP_METHODS:
                yield method, path, operation


def test_spec_file_is_up_to_date(spec):
    """The committed spec must match what the app generates.

    If this fails, regenerate it with: make openapi
    """
    assert SPEC_PATH.exists(), f"{SPEC_PATH} is missing. Run: make openapi"
    assert SPEC_PATH.read_text(encoding="utf-8") == serialize(
        spec
    ), f"{SPEC_PATH} is out of date with the FastAPI app. Run: make openapi"


def test_spec_is_valid_openapi_3_1(spec):
    assert spec["openapi"].startswith("3.1")
    assert spec["info"]["title"] == "DNA Backend"
    assert spec["info"]["version"]
    assert spec["paths"]


def test_committed_spec_is_parseable_json():
    parsed = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    assert parsed["paths"]


def test_every_operation_is_tagged_and_summarized(spec):
    missing = [
        f"{method.upper()} {path}"
        for method, path, operation in iter_operations(spec)
        if not operation.get("tags") or not operation.get("summary")
    ]
    assert not missing, f"Operations missing tags or summary: {missing}"


def test_every_operation_has_a_description(spec):
    """FastAPI takes the description from the handler docstring."""
    missing = [
        f"{method.upper()} {path}"
        for method, path, operation in iter_operations(spec)
        if not operation.get("description")
    ]
    assert not missing, f"Operations missing a docstring/description: {missing}"


def test_all_tags_are_declared_in_tags_metadata(spec):
    declared = {tag["name"] for tag in spec.get("tags", [])}
    used = {
        tag
        for _, _, operation in iter_operations(spec)
        for tag in operation.get("tags", [])
    }
    assert not (
        used - declared
    ), f"Tags used on routes but not declared in tags_metadata: {sorted(used - declared)}"
    assert not (
        declared - used
    ), f"Tags declared in tags_metadata but unused: {sorted(declared - used)}"


def test_operation_ids_are_unique(spec):
    """Duplicate operationIds break client codegen."""
    seen: dict[str, str] = {}
    duplicates = []
    for method, path, operation in iter_operations(spec):
        op_id = operation["operationId"]
        if op_id in seen:
            duplicates.append(f"{op_id}: {seen[op_id]} and {method.upper()} {path}")
        seen[op_id] = f"{method.upper()} {path}"
    assert not duplicates, f"Duplicate operationIds: {duplicates}"


def test_authenticated_endpoints_declare_security(spec):
    """Every endpoint outside the public allowlist must advertise bearer auth."""
    assert "HTTPBearer" in spec["components"]["securitySchemes"]
    undeclared = [
        f"{method.upper()} {path}"
        for method, path, operation in iter_operations(spec)
        if (method, path) not in UNAUTHENTICATED_PATHS and "security" not in operation
    ]
    assert not undeclared, (
        "Endpoints missing a security requirement (add to UNAUTHENTICATED_PATHS "
        f"if intentionally public): {undeclared}"
    )


def test_public_allowlist_matches_spec(spec):
    """Keep the allowlist honest: it must not name endpoints that now require auth."""
    stale = [
        f"{method.upper()} {path}"
        for method, path, operation in iter_operations(spec)
        if (method, path) in UNAUTHENTICATED_PATHS and "security" in operation
    ]
    assert not stale, f"Allowlisted as public but now authenticated: {stale}"
