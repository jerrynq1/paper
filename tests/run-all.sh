#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
for test_file in tests/*.test.js; do
  printf '\n===== %s =====\n' "$test_file"
  node "$test_file"
done
printf '\nAll QuantLab test files passed.\n'
