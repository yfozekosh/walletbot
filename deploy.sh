#!/usr/bin/env bash
set -euo pipefail

# Supabase Edge Function deploy script
# Usage: ./deploy.sh [project-ref]
# If no project-ref given, reads from supabase/config.toml or env SUPABASE_PROJECT_REF

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PROJECT_REF="${1:-}"
if [ -z "$PROJECT_REF" ]; then
  if [ -f supabase/config.toml ]; then
    PROJECT_REF="$(grep -m1 '^project_id' supabase/config.toml 2>/dev/null | sed 's/.*= *"//;s/"//' || true)"
  fi
fi
if [ -z "$PROJECT_REF" ]; then
  PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
fi
if [ -z "$PROJECT_REF" ]; then
  echo "ERROR: No project ref provided."
  echo "Usage: $0 <project-ref>"
  echo "Or set SUPABASE_PROJECT_REF env var, or add project_id to supabase/config.toml"
  exit 1
fi

if ! command -v supabase &>/dev/null; then
  echo "ERROR: Supabase CLI not found. Install via:"
  echo "  brew install supabase/tap/supabase   (macOS)"
  echo "  npm install -g supabase              (npm)"
  echo "  curl -sS https://supabase.com/install.sh | sh  (Linux)"
  exit 1
fi

FUNCTIONS_DIR="$SCRIPT_DIR/supabase/functions"
if [ ! -d "$FUNCTIONS_DIR" ]; then
  echo "ERROR: $FUNCTIONS_DIR not found. Run this script from the repo root."
  exit 1
fi

FUNCTIONS=()
for dir in "$FUNCTIONS_DIR"/*/; do
  name="$(basename "$dir")"
  if [ -f "${dir}index.ts" ]; then
    FUNCTIONS+=("$name")
  fi
done

if [ ${#FUNCTIONS[@]} -eq 0 ]; then
  echo "No edge functions found in $FUNCTIONS_DIR"
  exit 1
fi

echo "Deploying ${#FUNCTIONS[@]} functions to project: $PROJECT_REF"
echo ""

FAILED=()
for fn in "${FUNCTIONS[@]}"; do
  echo "━━━ Deploying: $fn ━━━"
  if supabase functions deploy "$fn" --project-ref "$PROJECT_REF"; then
    echo "  ✅ $fn deployed"
  else
    echo "  ❌ $fn failed"
    FAILED+=("$fn")
  fi
  echo ""
done

echo "═══════════════════════════════════"
echo "Deploy complete:"
echo "  Succeeded: $(( ${#FUNCTIONS[@]} - ${#FAILED[@]} ))"
echo "  Failed:    ${#FAILED[@]}"
if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  for fn in "${FAILED[@]}"; do
    echo "  ❌ $fn"
  done
  exit 1
fi
