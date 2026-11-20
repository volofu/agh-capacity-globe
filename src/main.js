import "./style.css";
import Globe from "globe.gl";
import { Color } from "three";
import { polygonToCells } from "h3-js";
import { feature } from "topojson-client";
import topo from "world-atlas/countries-110m.json";
import { flagUrl } from "./flags.js";
import {
  RAM_STEPS, defaultFilters, filtersActive, matches, buildPins, clusterPins, countriesFromPins, viewFor,
  filterOptions, priceFromSlider, gpuLabel, packageTitle, fmtHourly, fmtHourlyShort, fmtMonthly, fmtGb, fmtDisk,
} from "./data.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const DASHBOARD_URL = "https://aghcloud.ai/cloud-dashboard";
const OVERVIEW_ALT = 2.2;
const ROTATE_SPEED = 4; // OrbitControls: 2 ≈ 30s per turn, so 4 ≈ 15s per turn

const state = {
  inv: null,
  filters: defaultFilters(),
  opts: null,
  sel: null, // { type: "location" | "country", key }
  rotate: true,
  altBucket: null,
  pins: [],
};

// ---------------------------------------------------------------- globe
const landColor = "#532589";
const landColorSpot = "#3a1a63";
const countries = feature(topo, topo.objects.countries).features;
// Some tiny/odd polygons (e.g. North Korea at this resolution) make H3 throw, which would abort the
// whole dot-texture layer, so only feed it polygons H3 accepts.
const hexCountries = countries.filter((f) => {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  try {
    polys.forEach((p) => polygonToCells(p, 3, true));
    return true;
  } catch {
    return false;
  }
});

const world = Globe({ animateIn: true })($("globe"))
  .backgroundColor("rgba(0,0,0,0)")
  .showAtmosphere(true)
  .atmosphereColor("#7a43c0")
  .atmosphereAltitude(0.18)
  .polygonsData(countries)
  .polygonCapColor(() => landColor)
  .polygonSideColor(() => "rgba(0,0,0,0)")
  .polygonStrokeColor(() => "rgba(215,195,154,0.55)")
  .polygonAltitude(0.004)
  .hexPolygonsData(hexCountries)
  .hexPolygonResolution(3)
  .hexPolygonMargin(0.5)
  .hexPolygonColor(() => "rgba(215,195,154,0.3)")
  .hexPolygonAltitude(0.006)
  .htmlLat("lat")
  .htmlLng("lng")
  .htmlAltitude(0.02)
  .htmlElement((d) => d.el);

if (world.htmlElementVisibilityModifier) {
  world.htmlElementVisibilityModifier((node, visible) => {
    node.style.opacity = visible ? "" : "0";
    node.style.pointerEvents = visible ? "auto" : "none";
  });
}

const mat = world.globeMaterial();
mat.color = new Color("#2a1252");
mat.emissive = new Color("#1e0d42");
mat.emissiveIntensity = 0.85;
mat.shininess = 0;

const controls = world.controls();
controls.autoRotateSpeed = ROTATE_SPEED;
controls.minDistance = 130;
controls.maxDistance = 520;
controls.enablePan = false;
controls.autoRotate = true;
world.pointOfView({ lat: 14, lng: 12, altitude: OVERVIEW_ALT }, 0);

function fitGlobe() {
  const r = $("globe").getBoundingClientRect();
  world.width(Math.max(200, r.width)).height(Math.max(200, r.height));
}
new ResizeObserver(fitGlobe).observe($("globe"));
fitGlobe();

// A user starting a drag turns auto-rotate off (programmatic camera moves don't fire "start").
controls.addEventListener("start", () => setRotate(false));
let altTimer = null;
controls.addEventListener("change", () => {
  if (altTimer) return;
  altTimer = setTimeout(() => {
    altTimer = null;
    const bucket = Math.round(world.pointOfView().altitude * 4) / 4;
    if (bucket !== state.altBucket) refreshPins();
  }, 120);
});

function setRotate(on) {
  state.rotate = on;
  controls.autoRotate = on;
  const b = $("rotateBtn");
  b.setAttribute("aria-pressed", String(on));
  b.setAttribute("aria-label", on ? "Auto-rotate on" : "Auto-rotate off");
}

// ---------------------------------------------------------------- pins
function pinLabel(item) {
  if (item.members.length > 1) return `${item.members.length} locations, ${item.count} packages in stock`;
  const m = item.members[0];
  return `${m.city}, ${m.country}: ${m.count} packages in stock`;
}

function chipText(m) {
  const b = m.best;
  const spec = b.gpuType ? `${gpuLabel(b.gpuType)} ×${b.gpuCount}` : `${b.vcpus} vCPU`;
  return `${spec} · ${fmtHourlyShort(b.hourly)}/h`;
}

function refreshPins() {
  if (!state.inv) return;
  const filtering = filtersActive(state.filters);
  const alt = world.pointOfView().altitude;
  state.altBucket = Math.round(alt * 4) / 4;
  state.pins = buildPins(state.inv, state.filters);
  const items = clusterPins(state.pins, Math.max(0.4, alt * 2.4));
  const matchingPins = state.pins.filter((p) => p.matchCount > 0).length;

  for (const item of items) {
    const single = item.members.length === 1;
    const n = filtering ? item.matchCount : item.count;
    const b = el("button", "pin");
    b.type = "button";
    b.innerHTML = '<span class="halo"></span><span class="dot"></span><span class="chip"></span>';
    b.querySelector(".dot").textContent = String(n || "");
    if (n >= 10 || !single) b.classList.add("big");
    if (filtering) {
      b.classList.add(item.matchCount ? "is-match" : "is-dim");
      if (single && item.matchCount && matchingPins <= 10) {
        b.classList.add("show-chip");
      }
    }
    if (single) b.querySelector(".chip").textContent = filtering && item.matchCount ? chipText(item.members[0]) : `${item.members[0].city} · from ${fmtHourlyShort(item.members[0].best.hourly)}/h`;
    else b.querySelector(".chip").textContent = `${item.members.map((m) => m.city).slice(0, 3).join(", ")}${item.members.length > 3 ? "…" : ""}`;
    b.setAttribute("aria-label", pinLabel(item));
    if (single && state.sel?.type === "location" && state.sel.key === item.members[0].key) b.classList.add("is-selected");
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      if (single) selectLocation(item.members[0].key);
      else zoomInto(item);
    });
    item.el = b;
  }
  world.htmlElementsData(items);
  $("stage").classList.toggle("filtering", filtering);
}

function zoomInto(item) {
  setRotate(false);
  const alt = Math.max(0.45, world.pointOfView().altitude * 0.45);
  world.pointOfView({ lat: item.lat, lng: item.lng, altitude: alt }, 900);
}

// ---------------------------------------------------------------- selection
function selectLocation(key) {
  const pin = state.pins.find((p) => p.key === key);
  if (!pin) return;
  state.sel = { type: "location", key };
  setRotate(false);
  world.pointOfView({ lat: pin.lat, lng: pin.lng, altitude: 0.85 }, 1000);
  renderAll();
}

function selectCountry(cc) {
  if (state.sel?.type === "country" && state.sel.key === cc) return deselect();
  const pins = state.pins.filter((p) => p.cc === cc);
  if (!pins.length) return;
  state.sel = { type: "country", key: cc };
  setRotate(false);
  world.pointOfView(viewFor(pins), 1200);
  renderAll();
}

function deselect() {
  state.sel = null;
  const cur = world.pointOfView();
  world.pointOfView({ lat: cur.lat, lng: cur.lng, altitude: OVERVIEW_ALT }, 1200);
  setRotate(true);
  renderAll();
}

$("rotateBtn").addEventListener("click", () => {
  if (state.rotate) setRotate(false);
  else if (state.sel) deselect(); // turning rotation on zooms back out
  else setRotate(true);
});
$("backBtn").addEventListener("click", deselect);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.sel) deselect();
});

// ---------------------------------------------------------------- filters UI
function buildFilters() {
  const o = state.opts;
  const root = $("filters");
  root.innerHTML = "";
  root.append(
    el("div", "brand", `
      <div class="brand-mark"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d7c39a" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg></div>
      <div><div class="brand-name">AGH Cloud</div><div class="brand-sub">GPU capacity map</div></div>`),
  );

  const summary = el("div", "summary");
  summary.id = "summary";
  root.append(summary);

  const typeGroup = el("fieldset", "group");
  typeGroup.append(el("legend", null, "GPU type"));
  const typeChips = el("div", "chips");
  for (const t of o.types) {
    const b = el("button", "chip-btn", esc(gpuLabel(t)));
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      toggleSet(state.filters.types, t);
      b.setAttribute("aria-pressed", String(state.filters.types.has(t)));
      onFiltersChanged();
    });
    typeChips.append(b);
  }
  typeGroup.append(typeChips);
  root.append(typeGroup);

  const cntGroup = el("fieldset", "group");
  cntGroup.append(el("legend", null, "GPUs per package"));
  const cntChips = el("div", "chips");
  for (const c of o.counts) {
    const b = el("button", "chip-btn", `${c}×`);
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      toggleSet(state.filters.counts, c);
      b.setAttribute("aria-pressed", String(state.filters.counts.has(c)));
      onFiltersChanged();
    });
    cntChips.append(b);
  }
  cntGroup.append(cntChips);
  root.append(cntGroup);

  const price = el("div", "group");
  price.innerHTML = `<div class="rowhead"><label class="label" for="priceRange">Max price / hour</label><span class="val" id="priceVal">Any</span></div>
    <input id="priceRange" type="range" min="0" max="100" value="100" />`;
  root.append(price);
  price.querySelector("input").addEventListener("input", (e) => {
    const v = priceFromSlider(+e.target.value, o.maxHourly);
    state.filters.maxPrice = v;
    $("priceVal").textContent = v === Infinity ? "Any" : `$${v.toFixed(2)}`;
    onFiltersChanged();
  });

  const ram = el("div", "group");
  ram.innerHTML = `<div class="rowhead"><label class="label" for="ramRange">Min RAM</label><span class="val" id="ramVal">Any</span></div>
    <input id="ramRange" type="range" min="0" max="${RAM_STEPS.length - 1}" step="1" value="0" />`;
  root.append(ram);
  ram.querySelector("input").addEventListener("input", (e) => {
    const v = RAM_STEPS[+e.target.value];
    state.filters.minRam = v;
    $("ramVal").textContent = v ? `${fmtGb(v)}+` : "Any";
    onFiltersChanged();
  });

  const dep = el("fieldset", "group");
  dep.append(el("legend", null, "Deployment"));
  const depChips = el("div", "chips");
  for (const [val, label] of [["any", "Any"], ["vm", "VM"], ["baremetal", "Bare metal"]]) {
    const b = el("button", "chip-btn", label);
    b.type = "button";
    b.dataset.val = val;
    b.setAttribute("aria-pressed", String(val === "any"));
    b.addEventListener("click", () => {
      state.filters.deployment = val;
      depChips.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      onFiltersChanged();
    });
    depChips.append(b);
  }
  dep.append(depChips);
  root.append(dep);

  root.append(el("div", "legend", `
    <div class="row"><span class="legend-dot"><i></i></span><span>In stock. Number = packages available.</span></div>
    <div class="row filter-legend" hidden><span class="legend-dot dim"><i></i></span><span>In stock, but doesn't match your filters.</span></div>
    <div class="fine">Fully rented locations disappear from the map and return when stock does.</div>`));
}

function toggleSet(set, v) {
  if (set.has(v)) set.delete(v);
  else set.add(v);
}

function resetFilters() {
  state.filters = defaultFilters();
  buildFilters();
  onFiltersChanged();
}

function onFiltersChanged() {
  const active = filtersActive(state.filters);
  document.body.classList.toggle("is-filtering", active);
  refreshPins();
  const s = $("summary");
  if (s) {
    if (active) {
      const n = state.pins.filter((p) => p.matchCount > 0).length;
      s.innerHTML = `<span>${n ? `${n} location${n === 1 ? "" : "s"} match` : "No locations match"}</span>`;
      const r = el("button", "link-btn", "Reset filters");
      r.type = "button";
      r.addEventListener("click", resetFilters);
      s.append(r);
    } else {
      const n = state.pins.length;
      s.innerHTML = `<span>${n} location${n === 1 ? "" : "s"} in stock</span>`;
    }
  }
  const fl = document.querySelector(".filter-legend");
  if (fl) fl.hidden = !active;
  // spotlight: darken the land so pins pop
  world.polygonCapColor(() => (active ? landColorSpot : landColor));
  renderFlags();
  renderDetail();
}

// ---------------------------------------------------------------- flags
function renderFlags() {
  const wrap = $("flags");
  wrap.innerHTML = "";
  const filtering = filtersActive(state.filters);
  for (const c of countriesFromPins(state.pins)) {
    const b = el("button", "flag");
    b.type = "button";
    const url = flagUrl(c.cc);
    if (url) b.innerHTML = `<img src="${url}" alt="" />`;
    else b.textContent = c.cc;
    const selected = state.sel?.type === "country" && state.sel.key === c.cc;
    b.setAttribute("aria-pressed", String(selected));
    b.setAttribute("aria-label", `${c.name}, ${c.count} packages in stock`);
    b.title = c.name;
    if (filtering) b.classList.add(c.matchCount ? "match" : "dim");
    b.addEventListener("click", () => selectCountry(c.cc));
    wrap.append(b);
  }
  $("flagsCaption").textContent = state.sel?.type === "country" ? countryName(state.sel.key) : "Jump to a country";
}

const countryName = (cc) => state.pins.find((p) => p.cc === cc)?.country ?? cc;

// ---------------------------------------------------------------- detail panel
function renderDetail() {
  const root = $("detail");
  const stage = $("stage");
  const sel = state.sel;
  if (!sel) {
    root.hidden = true;
    stage.classList.remove("has-detail");
    $("backBtn").hidden = true;
    return;
  }
  const filtering = filtersActive(state.filters);
  root.hidden = false;
  stage.classList.add("has-detail");
  $("backBtn").hidden = false;
  root.innerHTML = "";

  const head = el("div", "d-head");
  const close = el("button", "icon-btn", '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg>');
  close.type = "button";
  close.setAttribute("aria-label", "Close and zoom back out");
  close.addEventListener("click", deselect);
  const body = el("div", "d-body");

  if (sel.type === "location") {
    const pin = state.pins.find((p) => p.key === sel.key);
    if (!pin) return deselect();
    const flag = flagUrl(pin.cc);
    const top = el("div", "d-top");
    top.innerHTML = `<div><h2 class="d-title">${esc(pin.city)}</h2><div class="d-sub">${flag ? `<img src="${flag}" alt="" />` : ""}${esc(pin.country)}</div></div>`;
    top.append(close);
    const isAgh = pin.packages.some((p) => p.kind === "agh");
    const meta = el("div", "d-meta");
    meta.innerHTML = `<span class="tag">${isAgh ? "AGH site" : "Partner network"}</span><span>${pin.count} in stock${filtering ? ` · ${pin.matchCount} match` : ""}</span>`;
    head.append(top, meta);
    const list = [...pin.packages].sort((a, b) => (matches(b, state.filters) - matches(a, state.filters)) || a.hourly - b.hourly);
    for (const p of list) body.append(packageCard(p, filtering ? matches(p, state.filters) : null));
    if (pin.approx) body.append(el("p", "note", "Approximate location: the provider's region name doesn't identify an exact city."));
  } else {
    const pins = state.pins.filter((p) => p.cc === sel.key);
    const flag = flagUrl(sel.key);
    const name = countryName(sel.key);
    const total = pins.reduce((s, p) => s + p.count, 0);
    const top = el("div", "d-top");
    top.innerHTML = `<div><h2 class="d-title">${esc(name)}</h2><div class="d-sub">${flag ? `<img src="${flag}" alt="" />` : ""}${pins.length} location${pins.length === 1 ? "" : "s"} with stock</div></div>`;
    top.append(close);
    const meta = el("div", "d-meta");
    meta.innerHTML = `<span>${total} packages in stock</span>`;
    head.append(top, meta);
    const sorted = [...pins].sort((a, b) => (b.matchCount > 0) - (a.matchCount > 0) || b.count - a.count);
    for (const p of sorted) {
      const row = el("button", "card loc-row" + (filtering ? (p.matchCount ? " is-match" : " is-dim") : ""));
      row.type = "button";
      row.innerHTML = `<div class="card-top"><span class="card-name">${esc(p.city)}</span><span class="badge">${p.count} in stock</span></div>
        <div class="specs">${filtering ? `${p.matchCount} match · ` : ""}from ${fmtHourly(p.best.hourly)}/hr</div>`;
      row.addEventListener("click", () => selectLocation(p.key));
      body.append(row);
    }
  }
  root.append(head, body);
}

function packageCard(p, match) {
  const card = el("div", "card" + (match === true ? " is-match" : match === false ? " is-dim" : ""));
  const gpu = p.gpuType ? `${p.gpuCount}× ${gpuLabel(p.gpuType)}` : "CPU";
  const specs = [`${p.vcpus} vCPUs`, `${fmtGb(p.ramGb)} RAM`, `${fmtDisk(p.diskGb)} disk`];
  if (p.vramGb) specs.push(`${fmtGb(p.vramGb)} VRAM`);
  const extra = [p.deployment === "baremetal" ? "Bare metal" : p.kind === "partner" ? "VM" : null, p.interconnect].filter(Boolean);
  card.innerHTML = `
    <div class="card-top"><span class="card-name">${esc(packageTitle(p))}</span><span class="badge${p.gpuType ? "" : " cpu"}">${esc(gpu)}</span></div>
    <div class="specs">${esc(specs.join(" · "))}${extra.length ? `<br>${esc(extra.join(" · "))}` : ""}</div>
    <div class="price-row">
      <div><span class="price">${fmtHourly(p.hourly)}<small> /hr</small></span><span class="monthly">${fmtMonthly(p.monthly)} /mo est.</span></div>
      <a class="rent" href="${DASHBOARD_URL}" target="_blank" rel="noopener">Rent on AGH Cloud</a>
    </div>`;
  return card;
}

// ---------------------------------------------------------------- misc UI
function renderUpdated() {
  const d = new Date(state.inv.updatedAt);
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hourCycle: "h23" }).format(d);
  const stale = Date.now() - d.getTime() > 36 * 3600 * 1000;
  $("updated").textContent = `Inventory last updated ${fmt} UTC · refreshes daily${stale ? " · may be out of date" : ""}`;
}

function renderAll() {
  refreshPins();
  renderFlags();
  renderDetail();
}

const toggle = $("filtersToggle");
toggle.addEventListener("click", () => {
  const open = document.body.classList.toggle("filters-open");
  toggle.setAttribute("aria-expanded", String(open));
});
$("stage").addEventListener("click", () => {
  document.body.classList.remove("filters-open");
  toggle.setAttribute("aria-expanded", "false");
});

// ---------------------------------------------------------------- boot
async function boot() {
  $("status").textContent = "Loading inventory…";
  try {
    const res = await fetch(new URL("inventory.json", document.baseURI), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.inv = await res.json();
  } catch (err) {
    $("status").textContent = `Couldn't load inventory (${err.message}).`;
    return;
  }
  $("status").textContent = "";
  state.opts = filterOptions(state.inv);
  buildFilters();
  renderUpdated();
  onFiltersChanged();
  window.__agh = { state, world, selectCountry, selectLocation, deselect, setRotate }; // handy for debugging
}
boot();
