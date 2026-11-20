import test from "node:test";
import assert from "node:assert/strict";
import { buildInventory, cityKeyFromSlug, aghInStock, partnerId } from "../scripts/lib/normalize.mjs";

const locations = {
  "lagos-ng": { city: "Lagos", cc: "NG", lat: 6.52, lon: 3.38 },
  "cape-town-za": { city: "Cape Town", cc: "ZA", lat: -33.92, lon: 18.42 },
  "frankfurt-germany": { city: "Frankfurt", cc: "DE", lat: 50.11, lon: 8.68 },
  "london-uk": { city: "London", cc: "GB", lat: 51.51, lon: -0.13 },
};

test("slug -> city key", () => {
  assert.equal(cityKeyFromSlug("frankfurt-germany-7"), "frankfurt-germany");
  assert.equal(cityKeyFromSlug("LON"), "london-uk");
  assert.equal(cityKeyFromSlug("is-reykjavik-1"), "reykjavik-iceland");
});

test("AGH stock: 0 is rented out, -1 (untracked) and >0 are in stock", () => {
  assert.equal(aghInStock({ availability: { available: 0 } }), false);
  assert.equal(aghInStock({ availability: { available: -1 } }), true);
  assert.equal(aghInStock({ availability: { available: 3 } }), true);
});

test("buildInventory merges both sources and keeps unavailable rows", () => {
  const agh = [
    {
      region: { name: "Lagos Kasi" },
      flavors: [
        { id: "a", name: "cpu.t-mini", ram: 4096, disk: 0, vcpus: 2, hourlyRate: "0.0480", monthlyEstimate: "35.04", gpuType: null, gpuCount: 0, availability: { available: -1 } },
        { id: "b", name: "gpu.40a100-xc-max", ram: 81920, disk: 0, vcpus: 64, hourlyRate: "2.9520", monthlyEstimate: "2154.96", gpuType: "A100", gpuCount: 1, availability: { available: 0 } },
      ],
    },
    { region: { name: "Cape Town UCT" }, flavors: [] },
  ];
  const partner = {
    offers: [
      { id: "x1", region: "frankfurt-germany-7", name: "8x A100", gpuType: "A100", gpuCount: 8, vcpus: 124, memoryGb: 1800, storageGb: 6144, totalVramGb: 320, ourHourlyRate: 22.288, deploymentType: "vm", interconnect: "pcie", available: true, availability: true },
      { id: "x2", region: "LON", name: "0x CPU", gpuType: "CPU", gpuCount: 0, vcpus: 4, memoryGb: 16, storageGb: 160, totalVramGb: 0, ourHourlyRate: 0.266, deploymentType: "vm", interconnect: "", available: false, availability: false },
      { id: "x3", region: "mystery-land-1", name: "?", gpuType: "A100", gpuCount: 1, vcpus: 1, memoryGb: 1, storageGb: 1, totalVramGb: 1, ourHourlyRate: 1, deploymentType: "vm", interconnect: "", available: true, availability: true },
    ],
  };
  const { inventory, unknownRegions } = buildInventory({ agh, partner, locations, now: new Date("2026-11-19T06:00:00Z") });
  assert.deepEqual(unknownRegions, ["mystery-land-1"]);
  assert.equal(inventory.updatedAt, "2026-11-19T06:00:00.000Z");
  assert.equal(inventory.packages.length, 4);
  assert.equal(inventory.counts.inStock, 2);
  assert.equal(inventory.counts.locationsInStock, 2); // lagos + frankfurt
  const fra = inventory.packages.find((p) => p.id === partnerId("x1"));
  assert.ok(!partnerId("massedcompute-us-east-5-cpu_mini-vm").includes("massed"));
  assert.equal(fra.monthly, 16270.24);
  assert.equal(fra.hourly, 22.288);
  const lagosCpu = inventory.packages.find((p) => p.id === "agh:a");
  assert.equal(lagosCpu.ramGb, 4);
  assert.equal(lagosCpu.diskGb, null);
  // supplier names / internal data must never leak into the public file
  assert.ok(!("cloud" in fra) && !("provider" in fra));
});
