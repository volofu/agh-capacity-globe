import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultFilters, filtersActive, matches, buildPins, clusterPins, countriesFromPins,
  viewFor, filterOptions, priceFromSlider, gpuLabel, angDist,
} from "../src/data.js";

const inv = {
  locations: {
    a: { city: "Frankfurt", country: "Germany", cc: "DE", lat: 50.11, lon: 8.68 },
    b: { city: "Dulles", country: "United States", cc: "US", lat: 38.95, lon: -77.45 },
    c: { city: "Ashburn", country: "United States", cc: "US", lat: 39.04, lon: -77.49 },
    d: { city: "Cape Town", country: "South Africa", cc: "ZA", lat: -33.92, lon: 18.42 },
  },
  packages: [
    { id: "1", locationKey: "a", gpuType: "A100", gpuCount: 8, ramGb: 1800, hourly: 22.288, deployment: "vm", inStock: true },
    { id: "2", locationKey: "b", gpuType: "A10", gpuCount: 1, ramGb: 200, hourly: 1.806, deployment: "vm", inStock: true },
    { id: "3", locationKey: "c", gpuType: null, gpuCount: 0, ramGb: 32, hourly: 0.168, deployment: "vm", inStock: true },
    { id: "4", locationKey: "d", gpuType: "L40", gpuCount: 1, ramGb: 16, hourly: 1.06, deployment: "vm", inStock: false },
  ],
};

test("fully rented locations get no pin", () => {
  const pins = buildPins(inv, defaultFilters());
  assert.deepEqual(pins.map((p) => p.key).sort(), ["a", "b", "c"]);
});

test("stock coming back brings the pin back", () => {
  const next = { ...inv, packages: inv.packages.map((p) => (p.id === "4" ? { ...p, inStock: true } : p)) };
  assert.ok(buildPins(next, defaultFilters()).some((p) => p.key === "d"));
});

test("filters", () => {
  const f = defaultFilters();
  assert.equal(filtersActive(f), false);
  f.types.add("A100");
  f.maxPrice = 25;
  assert.equal(filtersActive(f), true);
  assert.equal(matches(inv.packages[0], f), true);
  assert.equal(matches(inv.packages[1], f), false);
  f.maxPrice = 20;
  assert.equal(matches(inv.packages[0], f), false);
  const cpu = defaultFilters();
  cpu.types.add("CPU");
  assert.equal(matches(inv.packages[2], cpu), true);
});

test("pins carry match counts", () => {
  const f = defaultFilters();
  f.types.add("A100");
  const pins = buildPins(inv, f);
  assert.equal(pins.find((p) => p.key === "a").matchCount, 1);
  assert.equal(pins.find((p) => p.key === "b").matchCount, 0);
});

test("clustering merges near pins only", () => {
  const pins = buildPins(inv, defaultFilters());
  const wide = clusterPins(pins, 3);
  assert.equal(wide.length, 2); // Dulles+Ashburn merge, Frankfurt alone
  assert.equal(clusterPins(pins, 0.01).length, 3);
  const us = wide.find((c) => c.members.length === 2);
  assert.equal(us.count, 2);
});

test("countries and views", () => {
  const pins = buildPins(inv, defaultFilters());
  const c = countriesFromPins(pins);
  assert.deepEqual(c.map((x) => x.cc).sort(), ["DE", "US"]);
  const v = viewFor(c.find((x) => x.cc === "US").pins);
  assert.ok(v.altitude >= 0.7 && v.altitude <= 2);
  assert.ok(Math.abs(v.lng + 77.47) < 0.1);
});

test("filter options and helpers", () => {
  const o = filterOptions(inv);
  assert.deepEqual(o.types, ["A10", "A100", "CPU"].sort((a, b) => (a === "CPU") - (b === "CPU") || a.localeCompare(b)));
  assert.deepEqual(o.counts, [1, 8]);
  assert.equal(priceFromSlider(100, 20), Infinity);
  assert.ok(priceFromSlider(50, 20) > 0.05 && priceFromSlider(50, 20) < 20);
  assert.equal(gpuLabel(null), "CPU only");
  assert.equal(gpuLabel("RTX4090"), "RTX 4090");
  assert.equal(gpuLabel("A100_80G"), "A100 80G");
  assert.ok(angDist(0, 0, 0, 90) > 89.9 && angDist(0, 0, 0, 90) < 90.1);
});
