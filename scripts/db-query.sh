#!/bin/bash
# Supabase Management API SQL query helper (Phase 5 pre-flight).
# 사용: ./scripts/db-query.sh "SELECT ..."
# 사용 후 삭제 권장 (보안: TOKEN exposure 방지).

set -e
cd "$(dirname "$0")/.."

TOKEN=$(grep "^SUPABASE_ACCESS_TOKEN=" .env.local | cut -d= -f2)
REF=$(grep "^SUPABASE_PROJECT_REF=" .env.local | cut -d= -f2)

if [ -z "$TOKEN" ] || [ -z "$REF" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF missing in .env.local" >&2
  exit 1
fi

QUERY="$1"
if [ -z "$QUERY" ]; then
  echo "Usage: $0 \"<SQL>\"" >&2
  exit 1
fi

# JSON-encode the query safely via python (jq not installed on Windows Git Bash)
JSON=$(python -c "import json,sys; print(json.dumps({'query': sys.argv[1]}))" "$QUERY")

curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$JSON"
echo
