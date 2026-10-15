#!/usr/bin/env bash
# Sets up the BüroKI backend on a Supabase project in one go:
# database schema, the Lyceum AI key, and the edge functions.
#
#   ./scripts/setup-backend.sh <project-ref>
#
# Needs the Supabase CLI (https://supabase.com/docs/guides/cli) and asks for:
#   - a Supabase login (opens the browser once)
#   - the database password (Project Settings > Database)
#   - your Lyceum API key (lyceum.technology > API keys)
set -euo pipefail
cd "$(dirname "$0")/.."

REF="${1:?Usage: ./scripts/setup-backend.sh <project-ref>   (the part before .supabase.co)}"
command -v supabase >/dev/null || { echo "Install the Supabase CLI first: https://supabase.com/docs/guides/cli"; exit 1; }

supabase projects list >/dev/null 2>&1 || supabase login
echo "Linking project $REF (enter the database password when asked)…"
supabase link --project-ref "$REF"

echo "Creating tables, security rules and storage…"
supabase db push

if [ -z "${LYCEUM_API_KEY:-}" ]; then
  read -rsp "Lyceum API key (input hidden): " LYCEUM_API_KEY; echo
fi
supabase secrets set LYCEUM_API_KEY="$LYCEUM_API_KEY" --project-ref "$REF"

echo "Deploying edge functions…"
supabase functions deploy analyze-document draft-reply case-chat fill-form learn-facts find-help send-email export-data delete-account --project-ref "$REF"

cat <<MSG

Backend ready. One manual step left in the Supabase dashboard:
  Authentication > Email Templates > Magic Link: make the email contain {{ .Token }}
  e.g.  "Your BüroKI code is {{ .Token }}"
Then start the app:  cd apps/mobile && npm install && npx expo start
MSG
