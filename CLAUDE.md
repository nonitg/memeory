@AGENTS.md

# Brain (second-brain app)

Personal capture → AI filing → spaced resurfacing app. Next.js 16 App Router on Vercel, single user.

## Architecture
- `lib/db.ts`: one `query(text, params)` over Neon HTTP (prod, `DATABASE_URL`) or PGlite (local, `.data/`). Schema is inline and idempotent; bump `SCHEMA_VERSION` when changing it.
- `lib/items.ts`: capture, list, search (Postgres FTS + optional Supermemory), actions, and the review ladder (3d → 14/45/120/365d). All date math happens in SQL with `LOCAL_TZ`.
- `lib/enrich.ts`: runs in `after()` from the capture route. Link preview, then OpenRouter classification with a Zod schema, then Supermemory sync. Falls back to heuristics; the daily cron retries.
- `lib/digest.ts`: builds and sends the daily and weekly digests. Idempotent per local date via the `deliveries` table. Today's review picks are pinned in `kv.digest_review`.
- `lib/wa-inbound.ts`: WhatsApp commands (capture, `? search`, `today`, `undo`, `help`, button taps).
- Every integration is optional; `features` in `lib/env.ts` decides what runs.

## Verify changes
- `pnpm typecheck && pnpm lint`
- `pnpm test`: ladder, digest, search against a throwaway PGlite db
- `pnpm test:whatsapp`: full WhatsApp flow against `scripts/tests/mock-graph.mjs`
- UI: run `pnpm dev`, sign in with the key from `pnpm key` (or `dev-secret` when `BRAIN_SECRET` is unset locally), and screenshot with `playwright-core` using `channel: "chrome"`.

## Rules
- Never print secret values. Use `pnpm secret NAME` (hidden input) instead of pasting keys into chat.
- LLM calls go through OpenRouter (`lib/llm.ts`), model ids from env.
- Keep capture instant: never await AI or network calls before responding in `/api/capture`.
