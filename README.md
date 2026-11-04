# People dashboard

A private page that shows the people in your People Inbox (Notion): who to message today, a network map, and a people table. It only reads from Notion. The Telegram bot in `people-inbox` still does all the writing.

## Screens

- **Today.** People to message, promises you owe and promises owed to you.
- **Network map.** Everyone as a dot. Color is the world, size is the tier. Lines show who knows whom.
- **People.** Search and filter. Tap a row for the person card.

## Settings (Vercel → Project → Settings → Environment Variables)

| Name | What it is |
|---|---|
| `NOTION_TOKEN` | The same Notion integration token the bot uses. Mark it Sensitive. |
| `PASSCODE` | Your passcode for the page. Use 12 or more characters. If it is missing, the page stays closed. |
| `PEOPLE_DS_ID`, `INTERACTIONS_DS_ID`, `PROMISES_DS_ID` | Optional. The defaults are your People Inbox data sources. |

With no `NOTION_TOKEN`, the page shows sample data and says so at the top. Add `?demo=1` to see sample data at any time.

## Run on your computer

```bash
npm install
PASSCODE=anything npm run dev
```

## How the map finds lines

1. The `Introduced by` and `Knows` columns in People, if you add them.
2. Names written in a person's `Mutual contacts` text.
3. Two people at the same company (dashed line).

Everyone is also joined to "You".

## Privacy

- Every page and API route is behind the passcode (`src/proxy.ts`).
- Search engines are told to skip it (`X-Robots-Tag` and `robots.txt`).
- No personal data is stored in this repo. People stay in Notion.
