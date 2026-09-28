#!/usr/bin/env bash
# Build the site and serve docs/ locally on PORT (default 4000).
set -euo pipefail
cd "$(dirname "$0")"
node build.mjs
PORT="${1:-4000}"
echo "Serving docs/ at http://localhost:$PORT"
cd docs && python3 -m http.server "$PORT"
