#!/usr/bin/env node
// Pulls live inventory from the AGH dashboard API and writes data/inventory.json.
//
//   AGH_COOKIE="<Cookie header copied from a logged-in browser>" node scripts/fetch-inventory.mjs
//
// Or build from a raw snapshot file instead of the network:
//   node scripts/fetch-inventory.mjs --from raw.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInventory } from "./lib/normalize.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const locations = JSON.parse(fs.readFileSync(path.join(root, "data/locations.json"), "utf8"));
delete locations._note;

const BASE = process.env.AGH_BASE ?? "https://aghcloud.ai";
const fromIdx = process.argv.indexOf("--from");

async function getJson(p) {
  const res = await fetch(BASE + p, {
    headers: { cookie: process.env.AGH_COOKIE ?? "", accept: "application/json" },
    redirect: "manual",
  });
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    console.error(`Auth failed for ${p} (HTTP ${res.status}). The session cookie has probably expired.`);
    process.exit(2);
  }
  if (!res.ok) throw new Error(`${p} -> HTTP ${res.status}`);
  return res.json();
}

let agh, partner;
if (fromIdx > -1) {
  ({ agh, partner } = JSON.parse(fs.readFileSync(process.argv[fromIdx + 1], "utf8")));
} else {
  if (!process.env.AGH_COOKIE) {
    console.error("Set AGH_COOKIE (or pass --from raw.json).");
    process.exit(2);
  }
  [agh, partner] = await Promise.all([getJson("/api/cloud/packages"), getJson("/api/cloud/partner-packages")]);
}

const { inventory, unknownRegions } = buildInventory({ agh, partner, locations });

// Safety rails: never overwrite good data with an obviously broken pull.
if (!inventory.packages.length || !(partner.offers ?? []).length) {
  console.error("Pull returned no packages; leaving data/inventory.json untouched.");
  process.exit(3);
}
if (unknownRegions.length) {
  console.warn("Regions missing from data/locations.json (not pinned):", unknownRegions.join(", "));
}

const out = path.join(root, "data/inventory.json");
fs.writeFileSync(out, JSON.stringify(inventory) + "\n");
console.log(
  `Wrote ${path.relative(root, out)}: ${inventory.counts.inStock}/${inventory.counts.packages} packages in stock, ` +
    `${inventory.counts.locationsInStock}/${inventory.counts.locations} locations with stock.`,
);
if (unknownRegions.length) process.exitCode = 0;
