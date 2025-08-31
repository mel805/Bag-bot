#!/usr/bin/env bash
set -euo pipefail

# Determine repository root from this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Load environment variables from .env if present
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "[redeploy-cmd] Redeploying Discord application commands..."
node src/deploy-commands.js
echo "[redeploy-cmd] Done."

