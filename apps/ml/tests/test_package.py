"""Structural checks for the ML service.

The service has no logic yet (see docs/PROJECT_CONTEXT.md — the COD risk model
lands in Phases 5-7). These tests assert that the package and its toolchain are
wired correctly rather than simulating coverage of code that does not exist.
"""

import tomllib
from pathlib import Path

import app

ML_ROOT = Path(__file__).resolve().parents[1]


def test_app_package_imports() -> None:
    assert app.__doc__ is not None


def test_python_pin_matches_project_requirement() -> None:
    """`.python-version` drives CI; `requires-python` drives packaging.

    Nothing keeps the two in step, so a bump to one and not the other would let
    CI run an interpreter the project declares unsupported. This check is
    deliberately independent of the interpreter running it, so it gives the same
    answer on a contributor's machine as it does on GitHub.
    """
    pin = (ML_ROOT / ".python-version").read_text().strip()

    pyproject = tomllib.loads((ML_ROOT / "pyproject.toml").read_text())
    requires = pyproject["project"]["requires-python"]

    assert requires == f">={pin}", (
        f".python-version is {pin} but pyproject requires-python is {requires}. "
        "Update both together."
    )
