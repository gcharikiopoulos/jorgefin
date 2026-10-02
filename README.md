# Finance

An installable finance dashboard (PWA) for a household finance tracker, built with **React Admin** and **MUI X Charts**. It reads from a Neon Postgres database through the **Neon Data API** and signs users in with **Neon Auth** (Google). There is no backend code in this repo.

Screens:
- **Overview**: headline figures with month-on-month change and sparklines, month-end balance, cash flow by month, spending by category, daily spending, top merchants and recent transactions.
- **Transactions**: searchable, filterable list with date and time (when the source has one), type and note. Click a row for its details and to change its category.
- **Review**: uncategorised transactions grouped by description. Click one to open a side panel: create a rule at the top, and see the transactions it applies to below.
- **Categories**: add, edit, recolour, reorder and delete categories, with one level of subcategories. Each category's colour is used everywhere it appears; a subcategory uses its parent's colour unless it has its own. Click a category's transaction count to list its transactions in a side panel.

Light and dark themes follow the system setting and can be switched from the top bar.

## Try it without a backend

Open the app with `?mock=1` to see demo mode. Sign-in is skipped and the data comes from `src/mock.js`, which is all invented. Changes you make last until you reload.

## Run locally

Needs Node.js 22.

```sh
npm install
npm run dev          # http://localhost:5173/?mock=1
npm run build        # production build in dist/
npm run preview      # serves dist/ at http://localhost:4173/jorgefin/
```

`localhost` is a secure origin and is pre-approved in Neon Auth, so real sign-in works locally too.

## Configure the backend

`src/config.js` holds the two public endpoints for the Neon project `personal-finance` (branch `main`, database `neondb`):

```js
export const DATA_API_URL = 'https://ep-billowing-hall-b295ail3.apirest.c-6.eu-central-1.aws.neon.tech/neondb/rest/v1';
export const AUTH_URL = 'https://ep-billowing-hall-b295ail3.neonauth.c-6.eu-central-1.aws.neon.tech/neondb/auth';
```

They are public by design. Never commit a connection string, `.env` files or real data.

If you change either value, change the Content-Security-Policy `connect-src` in `index.html` to the same two hosts.

### Neon setup (done)

- **Neon Auth** (Managed Better Auth) and the **Data API** are enabled on branch `main`. The Data API was set up without the default "grant everything" option.
- **Google** sign-in uses Neon's shared OAuth credentials, which is fine for testing. If you switch to your own Google OAuth client, its authorised redirect URI must be `<AUTH_URL>/callback/google`.
- **Trusted domain**: `https://gcharikiopoulos.github.io` (origin only). `localhost` is allowed by default.
- **Access control** is in `db/001_access_control.sql`:
  - RLS is on for every table.
  - Signed-in users can only read, and only if their verified email is in `app_allowed_users`.
  - Writes only go through security-definer functions that check the allow-list: `fin_categorize`, `fin_set_category`, and for categories `fin_save_category`, `fin_delete_category` and `fin_move_category`.
  - Anonymous requests get nothing.
- To give someone access, run this in the Neon SQL Editor: `insert into public.app_allowed_users (email) values ('someone@example.com');`

Neon Auth itself lets any Google account sign up. Such an account just sees no data and gets "This account is not authorised".

## Database changes

Schema and permission changes live in `db/` as numbered SQL files, written to be safe to run more than once. They are applied by hand in the Neon SQL Editor (or by asking Claude with the Neon tools), not by the deploy workflow: that would need the database owner's credential stored in GitHub. Apply them in order, and try risky ones on a Neon branch first.

| File | What it does |
| --- | --- |
| `db/001_access_control.sql` | RLS, read-only grants for the web app, allow-list |
| `db/002_email_ingest.sql` | Email staging table, ingest function, `etl_ingest` role |
| `db/003_alert_dedup.sql` | One row per payment across card alerts, account alerts and statements |
| `db/004_balance_posted_only.sql` | Daily balance from the latest statement balance, counting unposted alerts only after it |
| `db/005_category_editing.sql` | Category colours, and the functions to add, edit, reorder and delete categories |

## Email import (ETL)

Bank alert emails are imported by a Google Apps Script in [`etl/`](etl/README.md), which sends them to Neon through `fin_ingest_email_transactions` (`db/002_email_ingest.sql`).

## Deploy to GitHub Pages

The workflow `.github/workflows/deploy.yml` builds the app on every push to `main` and publishes `dist/` to Pages.

One-time setup: in the repo go to **Settings > Pages**, and under **Build and deployment** set **Source** to **GitHub Actions**. The site is at `https://gcharikiopoulos.github.io/jorgefin/`.

Each build gets a fresh service-worker cache name, so installed copies pick up a new deploy the next time they are launched.

## How it fits together

| Path | Purpose |
| --- | --- |
| `index.html` | Entry page and Content-Security-Policy |
| `src/App.jsx` | React Admin setup: resources, routes, themes |
| `src/dataProvider.js` | Data API reads (views) and the two write functions; also serves demo mode |
| `src/authProvider.js` | Neon Auth: Google redirect sign-in, session, sign-out |
| `src/backend.js` | Neon client, demo-mode switch, error handling |
| `src/dashboard/` | Overview page and its charts |
| `src/transactions/`, `src/review/`, `src/categories/` | List screens |
| `src/components/` | Category chip and picker, amount, the two edit dialogs |
| `src/theme.js`, `src/format.js` | Themes, number and date formats, chart colours |
| `src/mock.js` | Invented demo data |
| `src/sw.template.js` | Service worker; the build writes `dist/sw.js` from it |
| `public/` | Manifest, icons, `.nojekyll` |
| `db/001_access_control.sql` | Row-level security, grants and the allow-list |

### Security notes

- Database values are rendered as React text, never as HTML.
- The Content-Security-Policy only allows scripts from this site and connections to the two Neon hosts. `style-src` includes `'unsafe-inline'` because Material UI injects its styles at runtime.
- The session stays where the Neon SDK keeps it; the app doesn't copy tokens anywhere.
