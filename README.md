# AGH Capacity Globe

An interactive 3D globe that mirrors the live **Available Packages** inventory from the
[AGH Cloud dashboard](https://aghcloud.ai/cloud-dashboard). Locations with stock get a pin;
fully rented locations disappear and come back when stock returns. Click a pin or a flag to
see specs and prices; filter by GPU, price, RAM and deployment to spotlight matches.

Status: **data pipeline done, front end not started.** The approved Claude Design mockup has
three screens (overview, country focus + detail, filter spotlight). Theme: Udu purple `#532589`,
gold `#d7c39a`, white, black `#090A0C`; system sans font stack.

## Data source

The dashboard is a client-rendered page backed by two same-origin JSON endpoints, both behind
the user's login cookie:

| Endpoint | Content |
| --- | --- |
| `/api/cloud/packages` | AGH-operated sites (Cape Town, Lagos): flavors with `availability.available` (`0` = fully rented, `-1` = untracked, treated as in stock) |
| `/api/cloud/partner-packages` | ~777 partner offers (`available` boolean), regions are slugs like `frankfurt-germany-7` |

Notes learned from the live data:

- The dashboard UI shows only the first 9 flavors per AGH site; the API returns all (Lagos: 17). The map uses the full API list.
- Partner price shown is `ourHourlyRate`; monthly = hourly × 730.
- Supplier names, internal IPs and image/OS ids are dropped by `scripts/lib/normalize.mjs` and never reach `data/inventory.json`.

## Pipeline

```
/api/cloud/*  ->  scripts/fetch-inventory.mjs  ->  data/inventory.json  ->  (front end)
                     uses data/locations.json (city key -> lat/lon)
```

```powershell
npm test                                   # unit tests (Node >= 20, no dependencies)
$env:AGH_COOKIE = "<Cookie header>"; npm run fetch
node scripts/fetch-inventory.mjs --from raw.json   # build from a browser export instead
```

`data/inventory.json` holds every package (in stock or not) with `inStock`, plus the locations
that have at least one package, and an `updatedAt` timestamp for the subtle "last updated" text.
Pins are grouped by `locationKey` (one pin per city, even with several datacenters).

New or renamed partner regions that are not in `data/locations.json` are reported by the script
(`Regions missing from data/locations.json`) and not pinned until added. Entries marked
`"approx": true` are ambiguous slugs (e.g. `fairview-usa`, `woodbury-usa`, `newcastle-usa`,
`ca-east`, `us-east`) with a best-guess position; verify them.

## Daily refresh (auth is the open question)

`.github/workflows/refresh-inventory.yml` runs daily at 06:00 UTC and commits changes, using a
repository secret `AGH_COOKIE`. Session cookies expire, so this will need either a long-lived
API token/service account from AGH, or periodic re-pasting. When auth fails the script exits
with code 2, the job goes red, and the previous `inventory.json` stays in place.

No automation available? Paste `scripts/browser-export.js` into the console of the logged-in
dashboard, then run `node scripts/fetch-inventory.mjs --from raw.json`.

## Next

1. Front end (Vite + a WebGL globe), per the mockup.
2. Get a durable credential for the daily refresh.
3. Host (static) and wire the refresh workflow to redeploy.
