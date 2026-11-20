import { createHash } from "node:crypto";

// Turns the two raw dashboard API payloads into one flat, public-safe inventory.
// Deliberately drops supplier names, internal IPs/links, image ids and OS options.

// Region slugs that don't follow "city-country-N".
const SLUG_ALIASES = {
  LON: "london-uk",
  TYO3: "tokyo-japan",
  "ca-east-1": "ca-east",
  "is-reykjavik-1": "reykjavik-iceland",
  "us-east-5": "us-east",
};

// AGH-operated sites are keyed by their region name.
const AGH_REGIONS = {
  "Cape Town UCT": "cape-town-za",
  "Lagos Kasi": "lagos-ng",
};

export function cityKeyFromSlug(slug) {
  if (SLUG_ALIASES[slug]) return SLUG_ALIASES[slug];
  return slug.replace(/-\d+$/, "");
}

const round2 = (n) => Math.round(n * 100) / 100;

// Raw partner ids embed the upstream supplier name (e.g. "<supplier>-us-east-5-cpu_mini-vm"),
// so publish a stable hash instead.
export function partnerId(rawId) {
  return "partner:" + createHash("sha1").update(rawId).digest("hex").slice(0, 12);
}

// "Fully Rented" on the dashboard == available === 0. -1 means "not tracked / unlimited".
export function aghInStock(flavor) {
  return flavor.availability?.available !== 0;
}

export function normalizeAgh(regionGroups, locations) {
  const out = [];
  const unknown = [];
  for (const group of regionGroups) {
    const key = AGH_REGIONS[group.region?.name];
    if (!key || !locations[key]) {
      unknown.push(group.region?.name);
      continue;
    }
    for (const f of group.flavors ?? []) {
      const hourly = Number(f.hourlyRate);
      out.push({
        id: `agh:${f.id}`,
        kind: "agh",
        locationKey: key,
        name: f.name,
        gpuType: f.gpuType ?? null,
        gpuCount: f.gpuCount ?? 0,
        vcpus: f.vcpus,
        ramGb: round2(f.ram / 1024),
        diskGb: f.disk > 0 ? f.disk : null, // null = "Up to 1TB"
        vramGb: null,
        deployment: "vm",
        interconnect: null,
        hourly: hourly,
        monthly: Number(f.monthlyEstimate),
        inStock: aghInStock(f),
      });
    }
  }
  return { packages: out, unknown };
}

export function normalizePartner(payload, locations) {
  const out = [];
  const unknown = new Set();
  for (const o of payload.offers ?? []) {
    const key = cityKeyFromSlug(o.region);
    if (!locations[key]) {
      unknown.add(o.region);
      continue;
    }
    // The dashboard shows ourHourlyRate (our price), monthly = hourly * 730.
    const hourly = o.ourHourlyRate;
    out.push({
      id: partnerId(o.id),
      kind: "partner",
      locationKey: key,
      name: o.name,
      gpuType: o.gpuType === "CPU" ? null : o.gpuType,
      gpuCount: o.gpuCount ?? 0,
      vcpus: o.vcpus,
      ramGb: o.memoryGb,
      diskGb: o.storageGb,
      vramGb: o.totalVramGb || null,
      deployment: o.deploymentType === "baremetal" || o.deploymentType === "bare_metal" ? "baremetal" : o.deploymentType,
      interconnect: o.interconnect || null,
      hourly: Math.round(hourly * 10000) / 10000,
      monthly: round2(hourly * 730),
      inStock: o.available === true && o.availability !== false,
    });
  }
  return { packages: out, unknown: [...unknown] };
}

export function buildInventory({ agh, partner, locations, now = new Date() }) {
  const a = normalizeAgh(agh, locations);
  const p = normalizePartner(partner, locations);
  const packages = [...a.packages, ...p.packages];
  // Only keep location records that have at least one package (in stock or not),
  // so the front end can pin them as soon as stock appears.
  const used = new Set(packages.map((x) => x.locationKey));
  const outLocations = {};
  for (const k of used) outLocations[k] = locations[k];
  return {
    inventory: {
      updatedAt: now.toISOString(),
      source: "aghcloud.ai/cloud-dashboard",
      counts: {
        packages: packages.length,
        inStock: packages.filter((x) => x.inStock).length,
        locations: used.size,
        locationsInStock: new Set(packages.filter((x) => x.inStock).map((x) => x.locationKey)).size,
      },
      locations: outLocations,
      packages,
    },
    unknownRegions: [...a.unknown, ...p.unknown],
  };
}
