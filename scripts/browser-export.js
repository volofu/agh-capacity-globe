// Manual fallback when no session cookie is available for automation.
// 1. Log in at https://aghcloud.ai/cloud-dashboard
// 2. Open DevTools console on that page and paste this whole file.
// 3. It downloads raw.json. Then run:  node scripts/fetch-inventory.mjs --from raw.json
(async () => {
  const j = async (p) => (await fetch(p, { credentials: "include" })).json();
  const a = await j("/api/cloud/packages");
  const p = await j("/api/cloud/partner-packages");
  const agh = a.map((g) => ({
    region: { name: g.region.name, location: g.region.location },
    flavors: g.flavors.map((f) => ({
      id: f.id, name: f.name, ram: f.ram, disk: f.disk, vcpus: f.vcpus,
      hourlyRate: f.hourlyRate, monthlyEstimate: f.monthlyEstimate,
      gpuType: f.gpuType, gpuCount: f.gpuCount,
      availability: { available: f.availability.available, total: f.availability.total },
    })),
  }));
  const offers = p.offers.map((o) => ({
    id: o.id, region: o.region, name: o.name, gpuType: o.gpuType, gpuCount: o.gpuCount,
    vcpus: o.vcpus, memoryGb: o.memoryGb, storageGb: o.storageGb, totalVramGb: o.totalVramGb,
    ourHourlyRate: o.ourHourlyRate, deploymentType: o.deploymentType, interconnect: o.interconnect,
    available: o.available, availability: o.availability,
  }));
  const blob = new Blob([JSON.stringify({ agh, partner: { offers } })], { type: "application/json" });
  const el = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "raw.json" });
  el.click();
})();
