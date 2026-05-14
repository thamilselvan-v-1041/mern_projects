#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# LibraryMan one-shot deploy helper for Zoho Catalyst
#   ./scripts/deploy.sh              → full pipeline (test → build → deploy)
#   ./scripts/deploy.sh --skip-tests → skip tests
#   ./scripts/deploy.sh --only client | --only functions
# ─────────────────────────────────────────────────────────────

# Guard: if invoked via `sh deploy.sh` (which forces dash/POSIX shell and
# breaks `set -o pipefail`), re-exec under bash so the script always works.
if [ -z "${BASH_VERSION:-}" ]; then
  if command -v bash >/dev/null 2>&1; then
    exec bash "$0" "$@"
  else
    echo "Error: bash is required to run this script (POSIX sh is not supported)." >&2
    exit 1
  fi
fi

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[0;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}▶ $1${NC}"; }
warn() { echo -e "${YEL}⚠ $1${NC}"; }
die()  { echo -e "${RED}✖ $1${NC}"; exit 1; }

SKIP_TESTS=false
ONLY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-tests) SKIP_TESTS=true; shift ;;
    --only)       ONLY="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown arg: $1" ;;
  esac
done

command -v catalyst >/dev/null || die "catalyst CLI not found. Install: npm i -g zcatalyst-cli"
command -v node     >/dev/null || die "Node.js not found"

log "Catalyst CLI: $(catalyst --version 2>&1 | head -1)"
log "Node:        $(node --version)"

# ── 1. Tests ────────────────────────────────────────────────
if [[ "$SKIP_TESTS" == false ]]; then
  log "Running backend tests"
  (cd server && npm test --silent)
  log "Running frontend tests"
  (cd client && npm test --silent -- --run)
else
  warn "Skipping tests (--skip-tests)"
fi

# ── 2. Build client ─────────────────────────────────────────
if [[ -z "$ONLY" || "$ONLY" == "client" ]]; then
  [[ -f client/.env.production ]] || die "client/.env.production missing — set VITE_API_BASE first"
  log "Building client (Vite production bundle)"
  (cd client && npm ci && npm run build)
fi

# ── 3. Prepare server prod deps ─────────────────────────────
if [[ -z "$ONLY" || "$ONLY" == "functions" ]]; then
  log "Installing server production dependencies"
  (cd server && npm ci --omit=dev)
fi

# ── 4. Deploy ───────────────────────────────────────────────
log "Deploying to Catalyst"
PROJECT_ID="$(node -e "process.stdout.write(String(require('./catalyst.json').project.id))" 2>/dev/null || true)"
DEPLOY_ARGS=()
[[ -n "$PROJECT_ID" ]] && DEPLOY_ARGS+=(-p "$PROJECT_ID")
if [[ -n "$ONLY" ]]; then
  catalyst deploy "${DEPLOY_ARGS[@]}" --only "$ONLY"
else
  catalyst deploy "${DEPLOY_ARGS[@]}"
fi

log "✅ Deploy complete"
