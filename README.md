# Brain

A second brain that takes anything you throw at it, files it for you, and brings it back when it matters.

- **Capture in 2 seconds** from the web app, iPhone share sheet, Action Button, Siri, a Mac hotkey, a browser button, or WhatsApp.
- **AI files it.** Every capture gets a title, a kind (idea, link, fact, to-do, quote, event, note), topic tags, and a reminder date when you mention one ("renew passport in March").
- **Find it by words or meaning.** Keyword search is built in. Supermemory adds meaning-based search, and questions ending in `?` get an answer with sources.
- **It comes back to you.** A morning digest on WhatsApp shows reminders, Todoist tasks due, and 3 things worth seeing again on a spaced schedule: 3 days, then 14, 45, 120, and 365. A Sunday email recaps the week.

Open **/setup** in the app for a checklist of what's connected and step-by-step instructions for the rest.

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run locally at localhost:3000 (uses an embedded database in `.data/`, no setup) |
| `pnpm secret NAME` | Save an API key to Vercel and `.env.local`. Input is hidden. Add `--random` to generate one |
| `pnpm key` | Copy your brain key to the clipboard (for signing in or the Shortcut) |
| `pnpm ship` | Deploy to production |
| `pnpm test` | Spaced-review, digest, and search checks against a throwaway database |
| `pnpm test:whatsapp` | Full WhatsApp conversation against a local fake of Meta's API |

## How it fits together

```
Shortcut / web / bookmarklet ──► POST /api/capture ──► Postgres (source of truth)
WhatsApp message ──► /api/whatsapp ─┘         └─► after(): link preview → AI filing → Supermemory
Vercel Cron 8am ──► /api/cron/daily ──► WhatsApp (or ntfy push, or email)
Vercel Cron Sun ──► /api/cron/weekly ──► email
```

Every integration is optional. With only a database, capture, search, reminders, and review all work. Each key you add switches on one more feature.

| Feature | Env vars |
|---|---|
| Sign-in, Shortcut auth | `BRAIN_SECRET` (set), `CRON_SECRET` (set) |
| Database | `DATABASE_URL` (from the Neon integration) |
| AI filing and answers | `OPENROUTER_API_KEY`, optional `LLM_MODEL_FAST`, `LLM_MODEL_WRITER` (default `anthropic/claude-opus-5`) |
| Meaning search, Claude access | `SUPERMEMORY_API_KEY` |
| WhatsApp | `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_APP_SECRET`, `WA_USER_NUMBER`, `WA_VERIFY_TOKEN`, optional `WA_TEMPLATE_NAME` |
| Push notifications | `NTFY_TOPIC` |
| Email | `RESEND_API_KEY`, `DIGEST_EMAIL_TO` |
| Todoist in the digest | `TODOIST_API_TOKEN` |
| Timezone | `LOCAL_TZ` (set to America/Toronto) |

## Cost

About $4 a month: Vercel Hobby, Neon, Resend, and ntfy are free. AI through OpenRouter is about $3 at a few captures a day. WhatsApp messages cost fractions of a cent. Supermemory is free to start, then $19 a month if you outgrow the free credits.

## Good to know

- The digest runs once a day in the 8am hour (Eastern, daylight time), because Vercel Hobby crons run once a day within an hour. It shifts to 7am in winter.
- WhatsApp only allows free-form messages within 24 hours of your last message. Outside that window the app sends a short approved template, and the full digest follows when you reply.
- Captures made while offline stay on the device and sync when you're back.
