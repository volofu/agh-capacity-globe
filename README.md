# AGH Capacity Globe

An interactive 3D globe that mirrors the live **Available Packages** inventory from the
[AGH Cloud dashboard](https://aghcloud.ai/cloud-dashboard).

- Pins appear only where something is **in stock**. A fully rented location has no pin at all, and its pin returns when stock does.
- Click a pin (or a flag) to see specs and prices; the number on a pin is the packages in stock. Nearby pins merge into clusters that split as you zoom.
- **Filters** (GPU type, GPUs per package, max price, min RAM, deployment) spotlight matches: matching pins glow with a price chip and everything else dims.
- Flags along the bottom pan the globe to a country. With nothing selected the globe zooms out and spins (about 15 s per turn). The **Auto-rotate** toggle switches itself off when you drag the globe or click a pin/flag; switching it back on zooms out and resumes the spin.
- A small "last updated" line shows when the inventory was refreshed (daily).

Theme: Udu purple `#532589`, gold `#d7c39a`, white, black `#090A0C`; AGH Cloud's system sans font stack.

## Run it

```powershell
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Node >= 20)
npm run build      # static site in dist/
```

Stack: Vite, [globe.gl](https://globe.gl) (three.js), `world-atlas` country shapes, `flag-icons` flags. No backend: the page loads `inventory.json` next to it.

## Data pipeline

The dashboard is client-rendered from two same-origin JSON endpoints, both behind the login cookie:

| Endpoint | Content |
| --- | --- |
| `/api/cloud/packages` | AGH-operated sites (Cape Town, Lagos): `availability.available` (`0` = fully rented, `-1` = untracked, treated as in stock) |
| `/api/cloud/partner-packages` | ~777 partner offers (`available` boolean); regions are slugs like `frankfurt-germany-7` |

```
/api/cloud/*  ->  scripts/fetch-inventory.mjs  ->  data/inventory.json  ->  site
                     uses data/locations.json (city key -> lat/lon)
```

```powershell
$env:AGH_COOKIE = "<Cookie header>"; npm run fetch
node scripts/fetch-inventory.mjs --from raw.json   # build from a browser export instead
```

Things worth knowing:

- The dashboard UI shows only the first 9 flavors per AGH site; the API returns all (Lagos: 17, 11 in stock). The map uses the full list, so its counts can be higher than the dashboard's.
- Partner price is `ourHourlyRate`; monthly = hourly × 730.
- `scripts/lib/normalize.mjs` drops supplier names, internal IPs and image/OS ids, and hashes partner offer ids (the raw ids embed the supplier). None of that reaches `data/inventory.json`.
- New partner regions missing from `data/locations.json` are reported by the script and not pinned until added. Entries marked `"approx": true` (`fairview-usa`, `woodbury-usa`, `newcastle-usa`, `ca-east`, `us-east`) are ambiguous slugs with a best-guess position; verify them.
- `data/inventory.json` was seeded from a live pull on 2026-11-20.

## Daily refresh and deploy

`.github/workflows/deploy.yml` runs on every push to `main` and daily at 06:00 UTC: tests, refresh inventory, commit it if it changed, build, deploy to GitHub Pages.

The refresh uses a repository secret `AGH_COOKIE` (the `Cookie` header of a logged-in session). **Auth is the open question:** session cookies expire. Ideally AGH provides a read-only API token or service account. Until then, when the cookie is missing or expired the job warns and deploys the last committed inventory, and the page's "last updated" line turns into "may be out of date" after 36 hours. Credentials are never stored in the repo.

No automation available? Paste `scripts/browser-export.js` into the console of the logged-in dashboard, then run `node scripts/fetch-inventory.mjs --from raw.json` and commit.

To enable hosting: create a GitHub repo, push, then Settings → Pages → Source: GitHub Actions.
