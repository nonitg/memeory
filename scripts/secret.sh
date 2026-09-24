#!/usr/bin/env bash
# Usage: pnpm secret NAME            (prompts, input hidden)
#        pnpm secret NAME --random   (generates a value and copies it to the clipboard)
# Saves the value to Vercel (production + development) and to .env.local.
# The value is never printed.
set -euo pipefail
name="${1:?Usage: pnpm secret NAME [--random]}"
if [[ "${2:-}" == "--random" ]]; then
  value="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("base64url"))')"
  printf '%s' "$value" | pbcopy 2>/dev/null && echo "↳ Generated a value for $name and copied it to your clipboard."
else
  read -r -s -p "Paste value for $name (hidden), then Enter: " value
  echo
fi
[[ -n "$value" ]] || { echo "Empty value, nothing saved."; exit 1; }

if [[ -f .vercel/project.json ]]; then
  for target in production development; do
    if printf '%s' "$value" | vercel env add "$name" "$target" --force >/dev/null 2>&1; then
      echo "✓ $name set on Vercel ($target)"
    else
      echo "✗ Couldn't set $name on Vercel ($target). Try: vercel env add $name $target"
    fi
  done
else
  echo "• Not linked to Vercel yet (run: vercel link). Saved locally only."
fi

touch .env.local
{ grep -v "^$name=" .env.local || true; printf '%s=%s\n' "$name" "$value"; } > .env.local.tmp
mv .env.local.tmp .env.local
chmod 600 .env.local
echo "✓ $name saved to .env.local"
[[ -f .vercel/project.json ]] && echo "Next: pnpm ship"
