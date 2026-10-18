// Footprints page. All data comes from ../data/footprints.json — edit that file
// (or run `node scripts/add-city.mjs <city>`) to light up a new city.
(async () => {
  const $ = (sel) => document.querySelector(sel);
  const { esc } = Footmap;

  let places;
  try {
    places = await Footmap.load("../data/footprints.json");
  } catch (err) {
    $("#map").innerHTML =
      '<p class="empty">Could not load the city data. To preview locally, run python3 -m http.server instead of opening the HTML file directly.</p>';
    console.error(err);
    return;
  }

  const fm = Footmap.create($("#map"), { interactive: true });
  // Keep tiles and overlays aligned when the viewport or status text resizes the map.
  const mapResize = new ResizeObserver(() => fm.map.invalidateSize({ pan: false }));
  mapResize.observe($("#map"));
  const boundaries = CityBoundaries.attach(fm.map, $("#boundary-status"));

  const years = [...new Set(places.flatMap((p) => p.visits.map((v) => v.slice(0, 4)).filter(Boolean)))].sort().reverse();
  years.forEach((y) => $("#year").insertAdjacentHTML("beforeend", `<option value="${y}">${y}</option>`));
  const firstYear = years.at(-1);

  let layerMode = "both";

  function visible() {
    const year = $("#year").value;
    return places
      .map((p) => ({ ...p, trips: year ? p.visits.filter((v) => v.startsWith(year)).length : p.visits.length }))
      .filter((p) => p.trips > 0 || (!year && p.lived));
  }

  function render(fit = false) {
    const list = visible();
    fm.render(list, layerMode);
    boundaries.setPlaces(list);
    if (fit) fm.fit(list);
    renderStats(list);
    renderList(list);
  }

  function renderStats(list) {
    const pad = (n) => String(n).padStart(2, "0");
    const rows = [
      [pad(list.length), "cities"],
      [pad(new Set(list.map((p) => p.country)).size), "countries"],
      [pad(list.reduce((n, p) => n + p.trips, 0)), "trips"],
    ];
    if (firstYear && !$("#year").value) rows.push([firstYear, "since"]);
    $("#stats").innerHTML = rows.map(([n, label]) => `<div><dt>${label}</dt><dd>${n}</dd></div>`).join("");
  }

  function renderList(list) {
    if (!list.length) {
      $("#places").innerHTML = $("#year").value
        ? '<p class="empty">// No visits recorded for this year.</p>'
        : '<p class="empty">// No visits recorded yet.</p>';
      return;
    }
    const byCountry = new Map();
    for (const p of list) {
      if (!byCountry.has(p.country)) byCountry.set(p.country, []);
      byCountry.get(p.country).push(p);
    }
    $("#places").innerHTML = [...byCountry]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([country, ps]) => `
        <div class="country">
          <h2>${esc(country)}<small>${ps.length}</small></h2>
          <div class="chips">
            ${ps.sort((a, b) => b.trips - a.trips).map((p) =>
              `<button class="chip" type="button" data-name="${esc(p.name)}">${esc(p.name)}<span class="count">×${p.trips}</span></button>`
            ).join("")}
          </div>
        </div>`).join("");
  }

  $("#places").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    const m = chip && fm.markers.get(chip.dataset.name);
    if (!m) return;
    fm.map.flyTo(m.getLatLng(), Math.max(fm.map.getZoom(), 7), { duration: 0.8 });
    $("#map").scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => m.openTooltip(), 850);
  });

  document.querySelectorAll("[data-layer]").forEach((b) => b.addEventListener("click", () => {
    layerMode = b.dataset.layer;
    document.querySelectorAll("[data-layer]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  }));

  $("#year").addEventListener("change", () => render(true));

  render(true);
})();
