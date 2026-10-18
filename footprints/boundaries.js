// WGS-84 boundaries, matching the Esri basemap. Load city detail only in view.
// Source and coordinate system: https://geojson.cn/data/atlas/china (v1.5.3).
window.CityBoundaries = (() => {
  const SOURCE = "https://geojson.cn/api/china/1.5.3";
  const MUNICIPALITIES = new Set(["110000", "120000", "310000", "500000", "710000", "810000", "820000"]);

  function attach(map, status) {
    const pane = map.createPane("city-boundaries");
    pane.style.cssText = "z-index:340;pointer-events:none";
    const style = () => ({
      color: window.siteTheme.isDark() ? "#a7b6ca" : "#53677e",
      weight: map.getZoom() >= 7 ? 1.5 : 1.1,
      opacity: 0.7,
      fill: false,
      interactive: false,
    });
    const provinces = L.geoJSON(null, { pane: "city-boundaries", style, interactive: false }).addTo(map);
    const cities = L.geoJSON(null, { pane: "city-boundaries", style, interactive: false }).addTo(map);
    // Keep fills separate: selected cities remain visible even when zoomed out.
    const highlights = L.geoJSON(null, {
      pane: "city-boundaries", interactive: false,
      style: () => ({
        color: "#f28c28", weight: 1.8, opacity: 1,
        fill: true, fillColor: "#ff982f",
        fillOpacity: window.siteTheme.isDark() ? 0.5 : 0.38,
        interactive: false,
      }),
    }).addTo(map);
    const cityFeatures = [];
    const overseas = new Map();
    let selected = [];
    let overseasQueue = Promise.resolve();
    const loaded = new Set();
    const pending = new Set();
    let regions = [];
    const failures = new Set();

    function showStatus() {
      status.hidden = false;
      status.textContent = failures.size
        ? "Some city boundaries could not be loaded. Pan or zoom the map to retry."
        : pending.size ? "Loading city boundaries…" : "Orange areas: cities visited";
    }

    const isChina = (place) => ["China", "中国", "CN"].includes(place.country);
    const normalize = (name) => String(name ?? "").trim().replace(/市$/, "");
    function matches(feature, place) {
      const props = feature.properties;
      if (place.boundaryCode) return String(props.code) === String(place.boundaryCode);
      return [props.name, props.fullname].some((name) => normalize(name) === normalize(place.name));
    }

    function refreshHighlights() {
      highlights.clearLayers();
      for (const feature of cityFeatures) {
        if (selected.some((place) => isChina(place) && matches(feature, place))) {
          highlights.addData(feature);
        }
      }
      for (const place of selected) {
        const feature = overseas.get(`${place.country}:${place.name}`);
        if (feature) highlights.addData(feature);
      }
      highlights.bringToFront();
    }

    // A small, serialized search queue for cities outside the Chinese dataset.
    // Cache polygons across visits and keep requests over one second apart.
    function loadOverseas(place) {
      const key = `${place.country}:${place.name}`;
      const taskKey = `osm:${key}`;
      if (overseas.has(key) || pending.has(taskKey)) return;
      pending.add(taskKey);
      showStatus();
      overseasQueue = overseasQueue.then(async () => {
        try {
          // An explicit boundary takes precedence over search and its cache.
          // Tokyo uses the 23 wards, rather than the prefecture and its islands.
          if (place.boundaryUrl) {
            const response = await fetch(place.boundaryUrl, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error(`City boundary: HTTP ${response.status}`);
            const boundary = await response.json();
            if (place.boundaryCode && Array.isArray(boundary.features)) {
              boundary.features = boundary.features.filter((f) =>
                String(f.properties?.code ?? f.properties?.adcode) === String(place.boundaryCode));
            }
            if (boundary.type !== "FeatureCollection" || !boundary.features?.length ||
                !boundary.features.every((f) => ["Polygon", "MultiPolygon"].includes(f.geometry?.type))) {
              throw new Error(`Invalid city boundary: ${key}`);
            }
            overseas.set(key, boundary);
            failures.delete(taskKey);
            refreshHighlights();
            return;
          }
          let feature;
          try { feature = JSON.parse(localStorage.getItem(`city-polygon-v1:${key}`)); } catch {}
          if (!feature || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) {
            const params = new URLSearchParams({
              q: place.boundaryQuery || `${place.name}, ${place.country}`,
              format: "geojson", polygon_geojson: "1", polygon_threshold: "0.005",
              featureType: "settlement", limit: "5",
            });
            try {
              const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
                signal: AbortSignal.timeout(15000),
              });
              if (!response.ok) throw new Error(`City polygon: HTTP ${response.status}`);
              const data = await response.json();
              feature = data.features?.find((f) =>
                ["Polygon", "MultiPolygon"].includes(f.geometry?.type) &&
                L.geoJSON(f).getBounds().contains([place.lat, place.lng]));
              if (!feature) throw new Error(`City polygon not found: ${key}`);
              try { localStorage.setItem(`city-polygon-v1:${key}`, JSON.stringify(feature)); } catch {}
            } finally {
              await new Promise((resolve) => setTimeout(resolve, 1100));
            }
          }
          overseas.set(key, feature);
          failures.delete(taskKey);
          refreshHighlights();
        } catch (error) {
          failures.add(taskKey);
          console.warn("City polygon unavailable", key, error);
        } finally {
          pending.delete(taskKey);
          showStatus();
        }
      });
    }
    map.attributionControl.addAttribution('Boundaries: <a href="https://geojson.cn">GeoJSON.CN</a> / <a href="https://datav.aliyun.com/portal/school/atlas/area_selector">DataV</a> / &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> / <a href="https://www.gsi.go.jp/kankyochiri/gm_jpn.html">Global Map Japan (GSI)</a>');

    async function fetchBoundaries(code) {
      const response = await fetch(`${SOURCE}/${code}.json`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Boundaries: HTTP ${response.status}`);
      const data = await response.json();
      if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
        throw new Error("Invalid boundary data");
      }
      return data;
    }

    async function loadRegion(code) {
      pending.add(code);
      showStatus();
      try {
        const data = await fetchBoundaries(code);
        cities.addData(data);
        cityFeatures.push(...data.features);
        refreshHighlights();
        loaded.add(code);
        failures.delete(code);
      } catch (error) {
        failures.add(code);
        console.warn("City boundaries unavailable", code, error);
      } finally {
        pending.delete(code);
        showStatus();
      }
    }

    function update() {
      provinces.setStyle(style);
      cities.setStyle(style);
      if (!map.hasLayer(cities) && map.getZoom() >= 5) cities.addTo(map);
      if (map.getZoom() < 5 && map.hasLayer(cities)) map.removeLayer(cities);
      const bounds = map.getBounds();
      const visible = regions.filter(({ code, bounds: regionBounds }) =>
        !MUNICIPALITIES.has(code) && (
          (map.getZoom() >= 5 && regionBounds.intersects(bounds)) ||
          selected.some((place) => isChina(place) && regionBounds.contains([place.lat, place.lng]))
        ));
      for (const { code } of visible) {
        if (!loaded.has(code) && !pending.has(code)) void loadRegion(code);
      }
      for (const place of selected) {
        if (place.boundaryUrl || !isChina(place)) loadOverseas(place);
      }
      showStatus();
    }

    async function initialize() {
      pending.add("100000");
      showStatus();
      try {
        const data = await fetchBoundaries("100000");
        provinces.addData(data);
        cityFeatures.push(...data.features.filter((f) => MUNICIPALITIES.has(String(f.properties?.code))));
        refreshHighlights();
        regions = data.features.filter((f) => /^\d{6}$/.test(String(f.properties?.code)) && f.geometry)
          .map((feature) => ({
            code: String(feature.properties.code),
            bounds: L.geoJSON(feature).getBounds(),
          }));
        failures.delete("100000");
        map.on("moveend", update);
        map.whenReady(update);
      } catch (error) {
        failures.add("100000");
        console.warn("Boundary index unavailable", error);
        // Retry on a later map interaction; map and city markers remain usable.
        map.once("moveend", initialize);
      } finally {
        pending.delete("100000");
        showStatus();
      }
    }

    window.addEventListener("themechange", () => {
      provinces.setStyle(style);
      cities.setStyle(style);
      refreshHighlights();
    });
    void initialize();
    return {
      setPlaces(places) {
        selected = places;
        refreshHighlights();
        // Explicit and foreign polygons load independently of the Chinese index.
        for (const place of selected) {
          if (place.boundaryUrl || !isChina(place)) loadOverseas(place);
        }
        if (regions.length) map.whenReady(update);
      },
    };
  }

  return { attach };
})();
