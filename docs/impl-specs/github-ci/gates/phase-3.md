# Phase 3 — Web helpers and ML structure

## Gate 3 — Red

Characterisation tests per AMD-2. `apps/web/src/lib/utils.ts` and the preference registry
already exist and are correct.

One boundary needed mocking rather than skipping: `preferences-config.ts` imports `fontKeys`
from `@/lib/fonts/registry`, which imports `next/font/google` — resolvable only inside the
Next build pipeline. The registry is mocked; preference parsing is what is under test.

## Gate 5 — Green + aligned

```
✓ src/lib/utils.test.ts (7 tests)
✓ src/lib/preferences/preferences-config.test.ts (4 tests)
 Test Files  2 passed (2)   Tests  11 passed (11)

tests/test_package.py::test_app_package_imports PASSED
tests/test_package.py::test_python_pin_matches_project_requirement PASSED
 2 passed
```

Spec alignment: 7 + 4 tests as named. The ML tests differ from the spec — see **AMD-1**,
which is `PROPOSED` and awaiting a human decision.

`test_placeholder.py` (`assert True`) was deleted. A test that cannot fail is not a test.

## Gate 7 — Scan

- `eslint` (web, via eslint-config-next) — clean
- `tsc --noEmit` — clean
- `ruff check .` — All checks passed
- `ruff format --check .` — 2 files already formatted
- `next build` — succeeds, 13 routes

**Environment note:** `apps/web` runs Vitest in the `node` environment, not `jsdom`. Per
SPEC.md §2 the dashboard components render hardcoded mock data, so rendering them would
assert that a constant equals itself. When those pages get real data, add `jsdom` and
component tests then — not now.
