# Frontend

The TanStack Start application for `apps.debugjois.dev`. It uses React,
TanStack Router and Query, Vite, and Nitro. Run the commands below from `app/` unless noted.

## Pages

- `/transcript-reader` lists the 50 latest public transcripts from
  `www.debugjois.dev`. Each links to a `?t=<hash>` permalink that loads that
  transcript. Transcripts marked `archived` in the index are hidden behind a
  Show archived toggle, which sets `?archived=true`. Their permalinks still
  work. Reading needs no credentials and no backend. `/` redirects here.

  With an admin session, each row also shows archive (unarchive in the
  archived list) and delete buttons. They post to
  `/api/admin/transcript-reader/state`, which invokes the backend's
  `set-transcript-state` action, and the list re-renders from the index it
  returns. Delete asks first and also removes the transcript JSON. To keep the
  public page free of extra requests, only a browser that has signed in at
  `/admin` checks for a session.

- `/tv-show-memes` lays images out in a borderless contact-sheet grid and
  exports it as one PNG. Images come from the file picker, drag and drop, or
  paste, and drag to reorder. Everything runs in the browser with no network
  calls.
- `/site-search` searches every entry of the daily log on `www.debugjois.dev`
  and lists matches by date, grouped by month, or by best match with
  `?sort=relevance`. The query lives in `?q=`. Each match links to its heading
  on the monthly archive page. It runs entirely in the browser on a
  [Pagefind](https://pagefind.app) index served from `/site-search/index/`.
- `/logger` edits today's Berlin-date Markdown note in Google Drive. It needs
  an admin session and links to `/admin` without one. `/admin/logger`
  redirects here.
- `/admin` is where the admin signs in with Google. Signed in, it shows the
  account, links to the pages that gain admin actions, and has the Sign out
  button.

Transcript reader pages emit Open Graph and Twitter card tags, so pasted links
unfurl in Slack, X, and similar apps. Each permalink uses the episode title, a
byline, and a show-notes excerpt, with the app's card image. `/tv-show-memes`
emits the same tags with its own card. Tag URLs use the production origin
`https://apps.debugjois.dev`.

## Site search index

`scripts/site-search-index/build.ts` renders each daily note to HTML with the
heading IDs goldmark gives it on the archive page, then indexes it with the
Pagefind Node API. It writes the bundle and a `status.json` with the entry
count, date range, source commit, and build time.

Pagefind indexes only visible text, so the indexed copy writes each link's
domain after its text, such as `(sashachapin.substack.com)`. A domain search
then finds every entry that links to the site, and the domain shows in result
excerpts. The archive pages are unchanged.

The
[Site Search Index workflow](../README.md#github-actions) runs it hourly and
publishes the result. For local development, index a checkout of
`deepakjois/debugjois.dev` into the gitignored `public/site-search/index/`:

```sh
npm run site-search-index -- ../../debugjois.dev/site/content/daily-notes
```

To test search without the UI, query an index from the command line. It uses
the page's Pagefind options, sort, and section links, and prints each entry
with its matching sections, excerpts with `[matches]` marked, and archive URLs.
Add `--sort relevance`, `--limit 0` for all entries, or `--json`:

```sh
npm run site-search -- "claude code"
npm run site-search -- obsidian --index https://apps.debugjois.dev/site-search/index
```

## App icons and cards

Each app has its own favicon, touch icon, web manifest, and link-preview card.
Two files in `src/apps/<app>/` are the source:

- `icon.svg` is the square icon. It is served as-is as the SVG favicon and
  rasterized for everything else.
- `brand.ts` exports the app's name, start URL, `theme-color`, and optional
  card text and colors. The route reads it through the `#/core/appBrand`
  helpers, so the page and the generated files share one definition.

After changing either file, or adding an app, regenerate and commit the
output:

```sh
npm run icons
```

`scripts/app-icons/generate.ts` renders with resvg and the fonts bundled in
`scripts/app-icons/fonts/`. It writes `favicon.svg`, `favicon.ico`,
`apple-touch-icon.png`, the 192, 512, and maskable PNGs, `manifest.webmanifest`,
and, for apps with card text, a 1200×630 `og-card.png`, all into
`public/icons/<slug>/`. It also copies the transcript reader's `favicon.ico`
and `apple-touch-icon.png` to the top of `public/`, because browsers request
those paths for pages that link no icons, such as 404s. A test fails when the
committed output no longer matches an app's `icon.svg` or `brand.ts`.
CloudFront serves `public/` from S3 only on the paths listed in the
[infra README](../infra/README.md#routing).

Admin actions call Nitro routes under `server/routes/api/admin/`. Those
routes invoke the deployed backend Lambda. The
[backend README](../backend/README.md#direct-invocation-actions) lists the
actions.

## Layout

The site hosts independent apps that share a small core. Apps can look
completely different and move at their own pace. The core changes together.

| Path                 | Holds                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `src/core/`          | Shared client code: admin sign-in, global CSS, helpers used by several apps   |
| `src/apps/<app>/`    | One app's components, data, styles, and tests                                 |
| `src/routes/`        | Thin TanStack route files that wire an app's pieces to a URL                  |
| `server/core/`       | Shared server code: admin session, Google token checks, backend Lambda client |
| `server/apps/<app>/` | One app's server logic and its tests                                          |
| `server/routes/api/` | Nitro route files                                                             |

An app imports from `src/core/` but never from another app. It owns its look:
it loads its stylesheet through its route `head` and scopes its selectors, and
it sets its own icons, manifest, and `theme-color`. The root route sets no
icons. Use the `#/`
alias (`#/core/...`, `#/apps/...`) for imports across these folders. Server
code may import types and client-safe constants from `src/`, but `src/` never
imports from `server/`.

## Installation

Follow the [root README](../README.md#development-environment) for the Nix
environment and dependency installation (`npm --prefix app ci` from the repo
root). Use npm. The repo pins the toolchain and the lockfile.

## Local development

```sh
npm run dev
```

Vite serves on port 3000. The transcript reader works with no further setup.

### Backend settings for the Logger

Local and orb development both use the deployed backend Lambda. There is no
local backend server. Copy the example configuration and fill it in:

```sh
cp .env.example .env.local
```

| Setting                        | Purpose                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `BACKEND_LAMBDA_FUNCTION_NAME` | Deployed backend for Logger                                                      |
| `AWS_REGION`                   | Region of that Lambda                                                            |
| `LINKPREVIEW_API_KEY`          | 32-character key for Logger's automatic page-title lookup when pasting bare URLs |

Provide AWS credentials through the SDK's normal credential chain, for example
`AWS_PROFILE`, or `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` with
`AWS_SESSION_TOKEN` for temporary credentials. The identity needs
`lambda:InvokeFunction` on the configured backend. Nitro invokes Lambda on the
server. AWS credentials never reach the browser. Google Drive access
must already be configured on the deployed backend. See the
[backend README](../backend/README.md).

### Admin sign-in

Admins sign in with Google at `/admin`. The OAuth web client ID lives in
`src/core/auth/config.ts` and the admin email allowlist in
`server/core/googleIdToken.ts`. No client secret and no
local Google environment variable is needed. At sign-in the server verifies
the signed Google ID token and the verified-email allowlist. Google's token
expires after an hour, so the server then issues its own session: a JWT signed
with `ADMIN_SESSION_SECRET`, kept in an `HttpOnly` cookie. It lasts 30 days and
is renewed on the first request after it is a day old, so a session used at
least monthly never expires. Every request checks its signature, expiry, and
the allowlist. Every private Nitro endpoint is defined with
`defineAdminHandler`, which checks the session first. The browser's page guard
is not server authorization.

Sign out ends the session in that browser only. To end every session, rotate
the secret as described in the
[infra README](../infra/README.md#notes). In development, leave
`ADMIN_SESSION_SECRET` unset to sign sessions with a random key that lasts
until the dev server restarts. A production build has no such fallback and
fails admin requests without the secret.

For real sign-in, add the development origin under **Authorized JavaScript
origins** for that OAuth client in Google Cloud:

- Add both `http://localhost` and `http://localhost:3000`. Without the
  port-less entry, the popup may work while One Tap and the button status
  iframe fail.
- Add the exact origin for any other port or public portal URL.

Google sign-in and server verification need internet access. Leave the bypass
unset when testing them. To use admin actions without Google sign-in:

```sh
DEV_ADMIN_BYPASS=true npm run dev
```

This bypasses only the app's admin session in development. Open `/admin` once
so public pages pick up the session. It does not bypass AWS permissions or
backend authorization, and real requests can read and write Drive notes. Vite
replaces the development flag at
build time, so a production build cannot enable the bypass.

### Amp orbs and tunnels

Use the repo's [orb environment setup](../README.md#orb-development). Supply
the same backend settings and AWS credentials as for local development. Start
a supervised Amp service with a portal from the repo root:

```sh
amp orb service start frontend --portal --command '
  cd app
  export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="$(node -p "new URL(process.env.PUBLIC_URL).hostname")"
  npm run dev -- --host 0.0.0.0 --port "$PORT"
'
```

Amp supplies `PUBLIC_URL` and `PORT`. The command allows the exact portal
hostname in Vite. For other tunnels, set
`__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` to their exact public hostname. Do not
set `server.allowedHosts: true`, which disables host validation. Regular local
development needs neither variable. For real Google sign-in, authorize the
portal's exact origin as described above.

## Checks and builds

```sh
npm run format        # format with oxfmt
npm run check         # type-aware oxlint and formatting checks
npm run build         # generate routes and the production artifact
npx tsc --noEmit      # TypeScript check after route generation
npm test              # Vitest tests
```

Builds and tests need no integration credentials. Tests mock Google
verification and the integrations, so they need neither Google sign-in nor
live backend calls. TanStack Router generates `src/routeTree.gen.ts`. Do not
edit it by hand.

### Lambda output

The default build uses Nitro's `aws_lambda` preset with streaming disabled,
which API Gateway HTTP API requires. It produces:

- `.output/server/index.mjs`, which exports the Lambda `handler`.
- `.output/public`, which holds the static browser assets.

The production Lambda runtime is Node.js 24, set in `infra/lib/site-stack.ts`.
It is the latest production-supported major on Lambda. Node.js 26 is an AWS
preview runtime, not the production target. The root flake pins the Node that
builds the app separately, and Lambda manages runtime patches.

### Local production preview

`npm run preview` needs the Node-server output, not the Lambda handler:

```sh
NITRO_PRESET=node-server npm run build
npm run preview
```

Run `npm run build` again to restore the Lambda output before packaging.

## Deployment

With deployment credentials and the infrastructure prerequisites from the
[infra README](../infra/README.md), run from the repo root:

```sh
./infra/deploy.sh --with-artifact
```

This builds, packages, uploads, and deploys to AWS. It updates the production
frontend and infrastructure and is not a local packaging command. It reuses
the existing backend image unless you also pass `--with-backend-image`. A push
to `main` that touches `app/` runs the same command from GitHub Actions.
