#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

echo "==> Node CI"
npm ci
npm run ci

echo "==> ML CI"
if command -v python3 >/dev/null 2>&1; then
  npm run ci:ml
else
  echo "python3 not found — skipping ML checks (GitHub Actions will still run them)."
fi

echo "==> All local CI checks passed"
