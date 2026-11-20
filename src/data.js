// Pure data logic: labels, filter matching, pin building and clustering. No DOM.

export const gpuLabel = (t) => {
  if (!t) return "CPU only";
  return t
    .replace(/_/g, " ")
    .replace(/^RTX(?=\d|Pro)/, "RTX ")
    .replace(/^RTX (Pro)(\d)/, "RTX $1 $2")
    .replace(/(\d)Ada$/, "$1 Ada")
    .replace(/^A100 80G$/, "A100 80G");
};

// Partner CPU offers arrive named "0x CPU"; give them something readable.
export const packageTitle = (p) => (p.gpuCount === 0 && p.kind === "partner" ? `CPU · ${p.vcpus} vCPU` : p.name);

export const fmtHourly = (n) => "$" + (n < 10 ? n.toFixed(4) : n.toFixed(2));
export const fmtHourlyShort = (n) => "$" + (n < 1 ? n.toFixed(3) : n.toFixed(2));
export const fmtMonthly = (n) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtGb = (gb) => (gb >= 1000 ? `${+(gb / 1000).toFixed(1)}TB` : `${gb}GB`);
export const fmtDisk = (gb) => (gb == null ? "Up to 1TB" : fmtGb(gb));

export const RAM_STEPS = [0, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];

export function defaultFilters() {
  return { types: new Set(), counts: new Set(), maxPrice: Infinity, minRam: 0, deployment: "any" };
}

export function filtersActive(f) {
  return f.types.size > 0 || f.counts.size > 0 || f.maxPrice !== Infinity || f.minRam > 0 || f.deployment !== "any";
}

export function matches(p, f) {
  if (!p.inStock) return false;
  if (f.types.size && !f.types.has(p.gpuType ?? "CPU")) return false;
  if (f.counts.size && !f.counts.has(p.gpuCount)) return false;
  if (p.hourly > f.maxPrice) return false;
  if (p.ramGb < f.minRam) return false;
  if (f.deployment !== "any" && p.deployment !== f.deployment) return false;
  return true;
}

// One pin per location that has at least one in-stock package. Out-of-stock locations are omitted entirely.
export function buildPins(inventory, filters) {
  const byLoc = new Map();
  for (const p of inventory.packages) {
    if (!p.inStock) continue;
    if (!byLoc.has(p.locationKey)) byLoc.set(p.locationKey, []);
    byLoc.get(p.locationKey).push(p);
  }
  const pins = [];
  for (const [key, packages] of byLoc) {
    const loc = inventory.locations[key];
    if (!loc) continue;
    const matching = packages.filter((p) => matches(p, filters));
    const pool = matching.length ? matching : packages;
    const best = pool.reduce((a, b) => (b.hourly < a.hourly ? b : a));
    pins.push({
      key,
      city: loc.city,
      country: loc.country,
      cc: loc.cc,
      lat: loc.lat,
      lng: loc.lon,
      approx: !!loc.approx,
      count: packages.length,
      matchCount: matching.length,
      packages,
      best,
    });
  }
  return pins;
}

export function angDist(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a))) * 180) / Math.PI;
}

// Greedy proximity clustering. Each result: { id, lat, lng, members, count, matchCount }.
export function clusterPins(pins, thresholdDeg) {
  const sorted = [...pins].sort((a, b) => b.count - a.count);
  const used = new Set();
  const out = [];
  for (const seed of sorted) {
    if (used.has(seed.key)) continue;
    const members = [seed];
    used.add(seed.key);
    for (const o of sorted) {
      if (used.has(o.key)) continue;
      if (angDist(seed.lat, seed.lng, o.lat, o.lng) <= thresholdDeg) {
        members.push(o);
        used.add(o.key);
      }
    }
    const w = members.reduce((s, m) => s + m.count, 0);
    out.push({
      id: members.map((m) => m.key).sort().join("+"),
      lat: members.reduce((s, m) => s + m.lat * m.count, 0) / w,
      lng: members.reduce((s, m) => s + m.lng * m.count, 0) / w,
      members,
      count: w,
      matchCount: members.reduce((s, m) => s + m.matchCount, 0),
    });
  }
  return out;
}

// Countries that have at least one pin, most stock first.
export function countriesFromPins(pins) {
  const m = new Map();
  for (const p of pins) {
    const c = m.get(p.cc) ?? { cc: p.cc, name: p.country, pins: [], count: 0, matchCount: 0 };
    c.pins.push(p);
    c.count += p.count;
    c.matchCount += p.matchCount;
    m.set(p.cc, c);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

// Camera target for a set of pins: centroid + an altitude that fits their spread.
export function viewFor(pinsOfCountry) {
  const lat = pinsOfCountry.reduce((s, p) => s + p.lat, 0) / pinsOfCountry.length;
  // average longitudes on the unit circle so Pacific-crossing sets don't break
  const x = pinsOfCountry.reduce((s, p) => s + Math.cos((p.lng * Math.PI) / 180), 0);
  const y = pinsOfCountry.reduce((s, p) => s + Math.sin((p.lng * Math.PI) / 180), 0);
  const lng = (Math.atan2(y, x) * 180) / Math.PI;
  const spread = Math.max(0, ...pinsOfCountry.map((p) => angDist(lat, lng, p.lat, p.lng)));
  return { lat, lng, altitude: Math.min(2.0, Math.max(0.7, 0.55 + spread / 22)) };
}

export function filterOptions(inventory) {
  const types = new Map();
  const counts = new Set();
  let maxHourly = 0;
  for (const p of inventory.packages) {
    if (!p.inStock) continue;
    const t = p.gpuType ?? "CPU";
    types.set(t, (types.get(t) ?? 0) + 1);
    if (p.gpuCount > 0) counts.add(p.gpuCount);
    maxHourly = Math.max(maxHourly, p.hourly);
  }
  const typeList = [...types.entries()]
    .sort((a, b) => (a[0] === "CPU") - (b[0] === "CPU") || b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
  return { types: typeList, counts: [...counts].sort((a, b) => a - b), maxHourly };
}

// Slider (0..100) <-> price, log scale from $0.05 up to maxHourly; 100 = no limit.
export function priceFromSlider(v, maxHourly) {
  if (v >= 100) return Infinity;
  const lo = 0.05;
  return +(lo * Math.pow(maxHourly / lo, v / 100)).toFixed(2);
}
