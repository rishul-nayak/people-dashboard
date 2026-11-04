# People dashboard

Your network in one private website. The database lives here (Neon Postgres, free). You add people by
sending a WhatsApp note. It follows the rules in the networking skill: tiers, a 24-hour follow-up,
promises, and a map of who knows whom.

## What it does

- **Today:** who to message, who you owe, with a one-tap "I messaged them" and "Done".
- **Network map:** every person, coloured by world, sized by tier, with lines for knows and introduced.
- **People:** search and filter. Click a person to edit, add a promise, or delete.
- **WhatsApp capture:** send a voice note, a photo of a card, text or a forwarded message. Gemini reads it,
  finds or creates the person, saves the talk and the promises, and replies with a card and a follow-up draft.
  It never messages anyone but you.

WhatsApp commands: `today`, `who Neha`, `promises`, `event AI meetup` (and `event off`), `undo`, `help`.
Reply to one of its cards to add to the same people.

## Setup (once)

1. **Database.** In Vercel: Storage, Create, Neon (free). Connect it to this project. This adds `DATABASE_URL`.
   The tables are created on the first request.
2. **Environment variables** (Vercel, Settings, Environment Variables, Sensitive). Redeploy after changing them.

| Name | What it is |
|---|---|
| `PASSCODE` | The password for this website. You choose it. |
| `DATABASE_URL` | Added by the Neon connection. |
| `GEMINI_API_KEY` | Free key from Google AI Studio. |
| `WHATSAPP_TOKEN` | Meta access token (system user token for a permanent one). |
| `WHATSAPP_PHONE_ID` | Phone number ID from the Meta API Setup page. |
| `WHATSAPP_APP_SECRET` | Meta app secret. Used to check every webhook is really from Meta. |
| `WHATSAPP_VERIFY_TOKEN` | Any random text you choose. Paste the same text in Meta. |
| `WHATSAPP_OWNER` | Your own WhatsApp number with country code. Only this number is answered. |
| `CRON_SECRET` | Any random text. Protects the daily retry route. |
| `NOTION_TOKEN` | Optional. Only for the one-time "Import from Notion" button. |

3. **Webhook.** In the Meta app: WhatsApp, Configuration, Webhook. Callback URL
   `https://<your-site>/api/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`. Subscribe to `messages`.
4. **Import** (optional). Open the dashboard with an empty database and press "Import from Notion". Safe to press twice.

## How it is built

Next.js (App Router), Postgres with Drizzle, Gemini free tier, Meta WhatsApp Cloud API, Vercel Hobby.

- `src/db/`: tables and migrations. To change the database, add a new SQL string at the end of `migrations.ts`.
- `src/capture/`: the brain. `extract.ts` (Gemini), `match.ts` (is this the same person), `store.ts` (save, undo, merge), `engine.ts` (commands and replies).
- `src/whatsapp/`: webhook parsing, signature check, sending, media download.
- `src/lib/config.ts`: tiers, worlds, the first-follow-up days, your rare links. Edit and push.
- `vercel.json`: a daily call to `/api/cron/daily` that retries notes Gemini could not read.

## Rules it keeps

- Undo removes everything one note created. Merge fixes a duplicate. Both are exact.
- A note never overwrites a field that already has a value. New facts are added as dated lines.
- A name that sounds like an existing person (Abhijeet and Abhijith) is matched. A name with a different company is a question, not a silent merge.
- Strangers who message the number get no reply and nothing is saved.
- Logs show error types only, never names or notes.

## Privacy

The site is behind a passcode and not indexed. Notes you send are read by Gemini (free tier: Google may use
free-tier inputs to improve its products). Write about people the way you would if they read it.

## Tests

`npm test` runs everything on an in-memory Postgres. To also run the real-driver test, set
`TEST_DATABASE_URL` to any empty Postgres.
