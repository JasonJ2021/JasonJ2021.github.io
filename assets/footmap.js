// Shared footprint map, used by the homepage preview and the full footprints page.
//   const places = await Footmap.load("data/footprints.json");
//   const fm = Footmap.create(el, { interactive: true });
//   fm.render(places, "both" | "dots" | "heat");
window.Footmap = (() => {
  // Esri gray canvas: no API key, reachable from mainland China. Base + labels per theme.
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
  const TILES = {
    light: [`${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`],
    dark: [`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`],
  };
  const ATTRIBUTION = "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors";
  const HEAT = {
    light: { 0.2: "#ffd8a8", 0.45: "#ffa94d", 0.7: "#f76707", 1: "#c92a2a" },
    dark: { 0.15: "#9a5b0e", 0.4: "#e8901f", 0.7: "#ffc266", 1: "#fff4d6" },
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ffb547";

  async function load(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const places = await res.json();
    // visits may be omitted (counts as one trip)
    return places.map((p) => ({ ...p, visits: p.visits?.length ? p.visits : [""], trips: p.visits?.length || 1 }));
  }

  function create(el, { interactive = true } = {}) {
    const map = L.map(el, {
      worldCopyJump: true,
      zoomControl: interactive,
      attributionControl: true,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      touchZoom: interactive,
    });
    map.attributionControl.setPrefix(false);

    const theme = () => (window.siteTheme.isDark() ? "dark" : "light");
    const [b, l] = TILES[theme()];
    const base = L.tileLayer(b, { attribution: ATTRIBUTION, maxZoom: 16 }).addTo(map);
    map.createPane("labels").style.cssText = "z-index:350;pointer-events:none"; // above base, below dots
    const labels = L.tileLayer(l, { maxZoom: 16, pane: "labels" }).addTo(map);

    const dots = L.layerGroup();
    const heat = L.heatLayer([], { radius: 38, blur: 28, maxZoom: 8, minOpacity: 0.35, gradient: HEAT[theme()] });
    const markers = new Map();
    let last = { list: [], mode: "both" };

    function render(list, mode = last.mode) {
      last = { list, mode };
      dots.clearLayers();
      markers.clear();
      const color = accent();

      heat.setLatLngs(list.map((p) => [p.lat, p.lng, p.lived ? 1 : Math.min(1, 0.35 + p.trips * 0.2)]));
      for (const p of list) {
        const m = L.circleMarker([p.lat, p.lng], {
          radius: 4 + Math.sqrt(p.trips) * 2.5 + (p.lived ? 2 : 0),
          color: "#fff",
          weight: 1.25,
          fillColor: color,
          fillOpacity: 1,
          className: p.lived ? "city-dot lived" : "city-dot",
          interactive,
        });
        if (interactive) {
          const dates = p.visits.filter(Boolean).join(" · ");
          m.bindTooltip(
            `<strong>${esc(p.name)}</strong>${p.lived ? " · home" : ""}
             <small>${esc(p.country)} · ×${p.trips}</small>
             ${dates ? `<small>${esc(dates)}</small>` : ""}
             ${p.note ? `<small>${esc(p.note)}</small>` : ""}`,
            { className: "city-tip", direction: "top", offset: [0, -6] }
          );
        }
        m.addTo(dots);
        markers.set(p.name, m);
      }

      map.removeLayer(dots);
      map.removeLayer(heat);
      if (mode !== "dots") heat.addTo(map);
      if (mode !== "heat") dots.addTo(map);
    }

    function fit(list, maxZoom = 6) {
      if (list.length > 1) map.fitBounds(L.latLngBounds(list.map((p) => [p.lat, p.lng])), { padding: [48, 48], maxZoom });
      else if (list.length === 1) map.setView([list[0].lat, list[0].lng], maxZoom);
      else map.setView([30, 110], 3);
    }

    window.addEventListener("themechange", () => {
      const t = theme();
      base.setUrl(TILES[t][0]);
      labels.setUrl(TILES[t][1]);
      heat.setOptions({ gradient: HEAT[t] });
      requestAnimationFrame(() => render(last.list, last.mode)); // dots pick up the new --accent
    });

    return { map, render, fit, markers };
  }

  return { load, create, esc };
})();
