#!/usr/bin/env bash
# End-to-end WhatsApp test with no Meta account: a local mock stands in for the Graph API.
set -euo pipefail
cd "$(dirname "$0")/../.."
TMP="$(mktemp -d)"; LOG="$TMP/graph.log"
cleanup() { kill "${MOCK:-}" "${APP:-}" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT
node scripts/tests/mock-graph.mjs "$LOG" > "$TMP/mock.out" 2>&1 & MOCK=$!
PGLITE_DIR="$TMP/db" pnpm exec tsx scripts/tests/seed.ts > /dev/null
env -u DATABASE_URL -u POSTGRES_URL BRAIN_SECRET=dev-secret CRON_SECRET= PGLITE_DIR="$TMP/db" \
  WA_ACCESS_TOKEN=fake WA_PHONE_NUMBER_ID=123 WA_USER_NUMBER=+1-416-555-0000 WA_VERIFY_TOKEN=vt WA_APP_SECRET=sec \
  WA_TEMPLATE_NAME=brain_digest GRAPH_BASE=http://localhost:3199 NTFY_TOPIC=test-topic NTFY_SERVER=http://localhost:3199/ntfy \
  OPENROUTER_API_KEY= SUPERMEMORY_API_KEY= RESEND_API_KEY= TODOIST_API_TOKEN= \
  pnpm exec next dev -p 3100 > "$TMP/app.log" 2>&1 & APP=$!
for _ in $(seq 1 120); do grep -q "Ready in" "$TMP/app.log" 2>/dev/null && break; sleep 0.5; done
node scripts/tests/whatsapp-flow.mjs "$LOG"
