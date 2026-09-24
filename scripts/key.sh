#!/usr/bin/env bash
# Copies your brain key (BRAIN_SECRET) to the clipboard without printing it.
set -euo pipefail
v="$(grep '^BRAIN_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2-)"
v="${v%\"}"; v="${v#\"}"   # vercel env pull writes KEY="value"
[[ -n "$v" ]] || { echo "No BRAIN_SECRET in .env.local. Create one: pnpm secret BRAIN_SECRET --random"; exit 1; }
printf '%s' "$v" | pbcopy
echo "✓ Brain key copied. Paste it on the sign-in page or into your Shortcut."
