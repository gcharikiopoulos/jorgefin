# Gmail → Neon ETL (Google Apps Script)

Reads bank alert emails from Gmail, extracts each transaction and sends it to Neon. There it lands in `transactions` (source `account_alert` or `card_alert`), categorised by the existing rules, and shows up in the web app.

```
Gmail (alert emails) --Apps Script, hourly--> fin_ingest_email_transactions(jsonb) --> raw_email_transactions --> transactions
```

- **Idempotent:** each transaction's `external_id` is `<gmail message id>:<line>`, so re-sending an email never duplicates it. Emails are labelled `fin/ingested` only after Neon accepts them.
- **Unrecognised emails** get the label `fin/needs-review` and are never guessed.
- **Least privilege:** the ETL logs in as `etl_ingest`, which can call `fin_ingest_email_transactions` and nothing else (`db/002_email_ingest.sql`).

## Files

| Path | Purpose |
| --- | --- |
| `src/Code.js` | Entry points: `run`, `dryRun`, `testConnection`, `installTrigger`, `removeTriggers` |
| `src/parsers.js` | Pure parsing (amounts, dates, alert formats); also runs under Node |
| `src/neon.js` | SQL over HTTPS to Neon (`UrlFetchApp`) |
| `src/config.js` | Reads Script Properties |
| `src/appsscript.json` | Manifest: time zone, minimal OAuth scopes |
| `test/` | Parser tests with invented fixtures |

## Setup

1. **Database password for `etl_ingest`.** In the Neon SQL Editor (branch `main`), run this once with a long random password of your own:

   ```sql
   alter role etl_ingest with login password '<long random password>';
   ```

   Never commit it or paste it in chat.

2. **Apps Script project.** Install clasp (`npm i -g @google/clasp`), run `clasp login`, then from `etl/` run `clasp create --type standalone --title "Finance ETL" --rootDir src`. That writes `etl/.clasp.json`, which is git-ignored (see `.clasp.json.example`). Then run `clasp push`.

3. **Script Properties.** In the Apps Script editor, open **Project settings > Script properties** and add:

   | Property | Value |
   | --- | --- |
   | `NEON_CONNECTION_STRING` | `postgresql://etl_ingest:<password>@ep-billowing-hall-b295ail3.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require` |
   | `ALERT_SENDERS` | the bank's alert sender address(es), comma-separated |
   | `SEARCH_DAYS` | optional, default `14` |

4. **Check.** Run `testConnection()`; the log should say `Connected as etl_ingest`. Then run `dryRun()` and compare the logged transactions with the emails. It writes and labels nothing.

5. **Go live.** Run `run()` once, check the web app, then run `installTrigger()` so it runs every hour. `removeTriggers()` stops it.

## Tests

```sh
cd etl && npm test
```

Fixtures in `test/` are invented. Never add real emails, amounts or account numbers: the repo is public.
