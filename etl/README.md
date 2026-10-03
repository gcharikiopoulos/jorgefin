# Gmail → Neon ETL (Google Apps Script)

Reads Alpha Bank alert emails from Gmail, extracts each transaction and sends it to Neon. There it lands in `transactions`, categorised by the existing rules, and shows up in the web app.

```
Gmail (alert emails) --Apps Script, hourly--> fin_ingest_email_transactions(jsonb) --> raw_email_transactions --> transactions
```

These alerts are understood:

| Sender | What it has | Becomes |
| --- | --- | --- |
| `alerts@alpha.gr` (subject "Alpha Bank – Υπηρεσία Alpha Alerts. ΛΟΓΑΡΙΑΣΜΟΣ ***NNN") | account, date and time, type (card purchase, ATM, payment, incoming…), amount, debit/credit; **no merchant** | `account_alert` |
| `ebanking@alpha.gr` (subject "Alpha Alerts") | card, date and time, amount and currency, **merchant** | `card_alert` |
| `IBankV2Email@piraeusbank.gr` ("Μεταβολή στο Υπόλοιπο του Λογαριασμού") | account, date and time, type, amount, debit/credit, the two reason lines (payer or payee and note; account numbers and references are dropped), **balance** | `account_alert` |
| `Nbg.donotreply@nbg.gr` (one sentence: card purchase, refund, withdrawal, transfer in or out, standing order) | account, date and time, amount, merchant for card payments | `account_alert` |

Piraeus also sends an "Ενημέρωση Εγχρήματης Συναλλαγής" confirmation for transfers made in e-banking; it repeats the alert and is skipped.

**Which account?** An alert's masked account number is looked up only among the accounts of the bank that sent it (`fin_bank_for_sender`, `db/007_more_banks.sql`). An alert for an account that is not in `public.accounts`, such as a business account at the same bank, is rejected with "no account matches the mask" and never counted. Accounts are added in the SQL editor (bank, name, `alert_mask` or `iban`), not in this repo.

**Balances.** Piraeus prints the balance on every alert; the newest becomes that account's balance anchor, so an account with alerts but no statements still gets a balance line. NBG alerts carry no balance.

**Transfers between own accounts** (`db/008_own_transfers.sql`): rules put the side whose description names the other account, or the owner, in a `transfer` category (neither income nor expense). After every import, an uncategorised row on another account with the opposite direction, the same amount and a date within 3 days gets the same category when it is the only such counterpart.

### One payment, one row

A debit-card purchase triggers both alerts within seconds, and the same payment later appears in the bank statement. The database keeps exactly one transaction (`db/003_alert_dedup.sql`):

- **Card ↔ account alert:** same account, amount and direction, times within 10 minutes. The two alerts become one row, and the card alert's merchant becomes the description, so rules can categorise it. Either alert can arrive first.
- **Foreign-currency card payments:** the card alert waits (it stays staged and is retried on later runs) until the account alert with the EUR amount arrives, then fills in the merchant. After three days without a match it is rejected.
- **Alert ↔ statement:** same account, amount and direction, alert date within one day of the statement's value or posting date. The statement's description and reference replace the alert's, while the row's category and note are kept. A statement row imported first is linked by a later alert instead of being duplicated.
- `transactions.merged_refs` lists the alerts folded into each row.

### Safety

- **Idempotent:** emails are keyed by Gmail message ID, so re-reading an email never duplicates it.
- **Cursor, not labels:** Gmail groups these alerts into long threads, and labels apply to whole threads. So the script keeps a time cursor (`LAST_RUN_AT`), re-reads the last 24 hours on each run, and lets the database skip what it has already seen. The cursor only advances after Neon accepts the batch.
- **Unrecognised emails** are logged, never guessed.
- **Least privilege:** the ETL logs in as `etl_ingest`, which can call `fin_ingest_email_transactions` and nothing else (`db/002_email_ingest.sql`).

## Files

| Path | Purpose |
| --- | --- |
| `src/Code.js` | Entry points: `run`, `dryRun`, `testConnection`, `installTrigger`, `removeTriggers`, `resetCursor` |
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
   | `NEON_PASSWORD` | the `etl_ingest` password, exactly as you set it (special characters are fine; the script encodes it) |
   | `ALERT_SENDERS` | `alerts@alpha.gr,ebanking@alpha.gr,IBankV2Email@piraeusbank.gr,Nbg.donotreply@nbg.gr` (all mail from these senders is read, wherever it is filed; the parsers skip anything that is not a transaction) |

4. **Check.** Run `testConnection()`; the log should say `Connected as etl_ingest`. Then run `dryRun()` and compare the logged transactions with the emails. It writes nothing. The first run looks back 400 days (`FIRST_RUN_DAYS` in `src/config.js`); later runs continue from the last one.

5. **Go live.** Run `run()` once, check the web app, then run `installTrigger()` so it runs every hour. `removeTriggers()` stops it. `resetCursor()` makes the next run look back 400 days again; emails already loaded are skipped.

## Tests

```sh
cd etl && npm test
```

Fixtures in `test/` are invented. Never add real emails, amounts or account numbers: the repo is public.
