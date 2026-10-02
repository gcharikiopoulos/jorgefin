# Finance (test PWA)

A small, installable test front end for a household finance tracker. It reads from a Neon Postgres database through the **Neon Data API** and signs users in with **Neon Auth** (Google). There is no backend code and no build step: plain HTML, CSS and ES modules, served as static files.

Screens: **Overview** (month figures, spending by category, daily spending), **Transactions** (search, filter, change a category) and **Review** (categorise uncategorised transactions by description).

## Try it without a backend

Open the app with `?mock=1`. Auth is skipped and data comes from `mock.js`, which contains invented data only. Changes you make in mock mode last until you reload.

## Run locally

Any static server works. Serve the folder that contains the repo so the app runs from a subpath, as it will on GitHub Pages:

```sh
cd ..                       # parent of this repo
python3 -m http.server 8000
# open http://localhost:8000/<repo>/?mock=1
```

`localhost` counts as a secure origin, so the service worker and install prompt work there too.

## Configure the backend

`config.js` holds the two public endpoints for the Neon project `personal-finance` (branch `main`, database `neondb`):

```js
export const DATA_API_URL = 'https://ep-billowing-hall-b295ail3.apirest.c-6.eu-central-1.aws.neon.tech/neondb/rest/v1';
export const AUTH_URL = 'https://ep-billowing-hall-b295ail3.neonauth.c-6.eu-central-1.aws.neon.tech/neondb/auth';
```

They are derived from the database endpoint host the same way the Neon SDK does it, and should match the URLs shown on the Data API and Auth pages of the Neon Console once those are enabled. They are public by design. Never commit a connection string, `.env` files or real data.

If you change either value, update the Content-Security-Policy `connect-src` in `index.html` to the same two hosts, and bump `CACHE_VERSION` in `sw.js` so installed copies pick up the new files.

### Neon setup (done)

- **Neon Auth** (Managed Better Auth) and the **Data API** are enabled on branch `main`. The Data API was set up without the default "grant everything" option.
- **Google** sign-in uses Neon's shared OAuth credentials, which is fine for testing. If you switch to your own Google OAuth client, its authorised redirect URI must be `<AUTH_URL>/callback/google`.
- **Trusted domain**: `https://gcharikiopoulos.github.io` (origin only). `localhost` is allowed by default.
- **Access control** is in `db/001_access_control.sql`:
  - RLS is on for every table.
  - Signed-in users can only read, and only if their verified email is in `app_allowed_users`.
  - Writes only go through `fin_categorize` and `fin_set_category`, which check the allow-list.
  - Anonymous requests get nothing.
- To give someone access, run this in the Neon SQL Editor: `insert into public.app_allowed_users (email) values ('someone@example.com');`

Neon Auth itself lets any Google account sign up. Such an account just sees no data and gets "This account is not authorised".

## Deploy to GitHub Pages

1. Push to `main`.
2. In the repo on GitHub, go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. The site appears at `https://gcharikiopoulos.github.io/jorgefin/` after a minute or so.

On every deploy that changes files, bump `CACHE_VERSION` in `sw.js`. The service worker serves the app shell from cache, so a new version is used from the next launch.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell and Content-Security-Policy |
| `styles.css` | Styles, light and dark via `prefers-color-scheme` |
| `app.js` | UI: screens, tabs, sheets, charts |
| `api.js` | All data access; switches between the Neon client and `mock.js` |
| `config.js` | The two public Neon endpoints |
| `mock.js` | Invented fixture data for `?mock=1` |
| `sw.js` | Service worker: caches the shell, never touches Neon requests |
| `manifest.webmanifest`, `icons/` | PWA metadata and icons |
| `vendor/neon-js-0.7.0-beta.js` | `@neondatabase/neon-js` bundled as one browser module (see below) |

## The vendored Neon SDK

The Neon SDK is published for bundlers, so it is bundled once into `vendor/neon-js-0.7.0-beta.js` and committed. That keeps the site free of a build step and of third-party script hosts. To rebuild or upgrade it (needs Node.js), edit the version in `scripts/build-vendor.sh`, then:

```sh
sh scripts/build-vendor.sh
```

Update the import in `api.js`, the file list in `sw.js` and `vendor/LICENSES.md` if the file name changes.
