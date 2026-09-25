
import "./style.css";
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div id="map"></div>

  <div class="panel">
    <h1>Funchal — screenshot-style basemap</h1>

    <div class="row">
      <label>Water</label>
      <input id="water" type="color" value="#d2d2d2" />
    </div>

    <div class="row">
      <label>Land</label>
      <input id="land" type="color" value="#eeeeee" />
    </div>

    <div class="row">
      <label>Buildings</label>
      <input id="buildings" type="color" value="#dddddd" />
    </div>

    <div class="row">
      <label>Major roads</label>
      <input id="roads" type="color" value="#f8f8f8" />
    </div>

    <div class="row">
      <label>Minor roads</label>
      <input id="minorRoads" type="color" value="#f3f3f3" />
    </div>

    <div class="row">
      <label>Street text</label>
      <input id="streetText" type="color" value="#777777" />
    </div>

    <div class="row">
      <label>Street size</label>
      <input
        id="streetSize"
        type="range"
        min="8"
        max="20"
        step="0.5"
        value="12"
      />
    </div>

    <div class="row">
      <label>Font</label>
      <select id="font" disabled>
        <option>Loading glyphs…</option>
      </select>
    </div>

    <div class="checks">
      <label>
        <input id="labels" type="checkbox" checked />
        street names
      </label>

      <label>
        <input id="pois" type="checkbox" />
        POIs
      </label>
    </div>

    <div class="actions">
      <button id="reset" type="button">Reset selections</button>
      <button id="copyLink" type="button">Copy share link</button>
    </div>

    <div class="share">
      <input id="shareUrl" readonly aria-label="Share URL" />
      <button id="openLink" type="button">Open</button>
    </div>

    <div class="hint">
      Changes are stored in the URL so the current map style and view can be
      shared directly.
    </div>

    <div class="status" id="status">Loading vector map…</div>
  </div>
`;

/*
 * ================================================================
 * ORIGINAL DEFAULT SETTINGS
 * ================================================================
 *
 * These are the settings from the original HTML.
 *
 * URL parameters are treated as overrides.
 *
 * Therefore:
 *
 *   /map.html
 *
 * starts exactly with these settings.
 *
 *   /map.html?water=%23ff0000
 *
 * starts with the original settings, except water is red.
 */

const DEFAULTS = {
  land: "#eeeeee",
  water: "#d2d2d2",
  buildings: "#dddddd",
  roads: "#f8f8f8",
  minorRoads: "#f3f3f3",
  streetText: "#777777",

  streetSize: 12,
  font: "Roboto Regular",

  labels: true,
  pois: false,

  lng: -16.9087,
  lat: 32.6487,
  zoom: 14.1,
  bearing: 0,
  pitch: 0,

  markerLng: -16.9028234,
  markerLat: 32.6475008,
  markerHeading: 182
};

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const GLYPH_URL =
  "https://raw.githubusercontent.com/Mictilt/roboto-glyphs/main/glyphs/{fontstack}/{range}.pbf";

const FONT_LIST_URL =
  "https://api.github.com/repos/Mictilt/roboto-glyphs/contents/glyphs?ref=main";

const FONT_CACHE_KEY = "mictilt-map-glyph-fonts-v1";

const FONT_CACHE_TTL = 24 * 60 * 60 * 1000;

const theme = {
  land: DEFAULTS.land,
  water: DEFAULTS.water,
  buildings: DEFAULTS.buildings,
  roads: DEFAULTS.roads,
  minorRoads: DEFAULTS.minorRoads,
  streetText: DEFAULTS.streetText,

  streetHalo: "#eeeeee",

  streetSize: DEFAULTS.streetSize,
  font: [DEFAULTS.font]
};

let map: maplibregl.Map | null = null;
let marker = null;

/*
 * ================================================================
 * URL STATE
 * ================================================================
 */

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value || "");
}

function readInitialStateFromURL() {
  const params = new URLSearchParams(window.location.search);

  /*
   * Start with the ORIGINAL settings.
   */
  const state = {
    land: DEFAULTS.land,
    water: DEFAULTS.water,
    buildings: DEFAULTS.buildings,
    roads: DEFAULTS.roads,
    minorRoads: DEFAULTS.minorRoads,
    streetText: DEFAULTS.streetText,

    streetSize: DEFAULTS.streetSize,
    font: DEFAULTS.font,

    labels: DEFAULTS.labels,
    pois: DEFAULTS.pois,

    lng: DEFAULTS.lng,
    lat: DEFAULTS.lat,
    zoom: DEFAULTS.zoom,
    bearing: DEFAULTS.bearing,
    pitch: DEFAULTS.pitch,

    markerLng: DEFAULTS.markerLng,
    markerLat: DEFAULTS.markerLat,
    markerHeading: DEFAULTS.markerHeading
  };

  /*
   * Then apply ONLY parameters that are present.
   *
   * This is important: adding a new URL parameter does not cause
   * the other settings to fall back to something else.
   */

  for (const key of [
    "land",
    "water",
    "buildings",
    "roads",
    "minorRoads",
    "streetText"
  ]) {
    const value = params.get(key);

    if (isValidHex(value)) {
      state[key] = value.toLowerCase();
    }
  }

  const size = Number(params.get("streetSize"));

  if (Number.isFinite(size) && size >= 8 && size <= 20) {
    state.streetSize = size;
  }

  const font = params.get("font");

  if (font) {
    state.font = font;
  }

  const labels = params.get("labels");

  if (labels === "0" || labels === "1") {
    state.labels = labels === "1";
  }

  const pois = params.get("pois");

  if (pois === "0" || pois === "1") {
    state.pois = pois === "1";
  }

  const numberParam = (name, fallback, min, max) => {
    const value = Number(params.get(name));

    if (Number.isFinite(value) && value >= min && value <= max) {
      return value;
    }

    return fallback;
  };

  state.lng = numberParam("lng", DEFAULTS.lng, -180, 180);
  state.lat = numberParam("lat", DEFAULTS.lat, -90, 90);
  state.zoom = numberParam("z", DEFAULTS.zoom, 0, 22);
  state.bearing = numberParam("b", DEFAULTS.bearing, -180, 180);

  /*
   * Pitch intentionally remains locked at zero.
   */
  state.pitch = 0;

  state.markerLng = numberParam("mLng", DEFAULTS.markerLng, -180, 180);
  state.markerLat = numberParam("mLat", DEFAULTS.markerLat, -90, 90);
  state.markerHeading = numberParam(
    "mHeading",
    DEFAULTS.markerHeading,
    -180,
    360
  );

  return state;
}

const INITIAL_STATE = readInitialStateFromURL();

/*
 * Apply URL/default state to the controls.
 */
function syncControlsFromState() {
  (document.getElementById("land") as HTMLInputElement).value = INITIAL_STATE.land;
  (document.getElementById("water") as HTMLInputElement).value = INITIAL_STATE.water;
  (document.getElementById("buildings") as HTMLInputElement).value = INITIAL_STATE.buildings;
  (document.getElementById("roads") as HTMLInputElement).value = INITIAL_STATE.roads;
  (document.getElementById("minorRoads") as HTMLInputElement).value = INITIAL_STATE.minorRoads;
  (document.getElementById("streetText") as HTMLInputElement).value = INITIAL_STATE.streetText;
  (document.getElementById("streetSize") as HTMLInputElement).value = INITIAL_STATE.streetSize;
  (document.getElementById("labels") as HTMLInputElement).checked = INITIAL_STATE.labels;
  (document.getElementById("pois") as HTMLInputElement).checked = INITIAL_STATE.pois;

  theme.land = INITIAL_STATE.land;
  theme.water = INITIAL_STATE.water;
  theme.buildings = INITIAL_STATE.buildings;
  theme.roads = INITIAL_STATE.roads;
  theme.minorRoads = INITIAL_STATE.minorRoads;
  theme.streetText = INITIAL_STATE.streetText;
  theme.streetSize = INITIAL_STATE.streetSize;
  theme.font = [INITIAL_STATE.font];
}

/*
 * Build a URL containing the CURRENT state.
 *
 * The URL always includes the complete state. This makes links
 * deterministic and easy to share.
 */
function buildShareURL() {
  const params = new URLSearchParams();

  params.set("land", theme.land);
  params.set("water", theme.water);
  params.set("buildings", theme.buildings);
  params.set("roads", theme.roads);
  params.set("minorRoads", theme.minorRoads);
  params.set("streetText", theme.streetText);
  params.set("streetSize", String(theme.streetSize));
  params.set("font", theme.font[0]);

  params.set(
    "labels",
    (document.getElementById("labels") as HTMLInputElement).checked ? "1" : "0"
  );

  params.set("pois", (document.getElementById("pois") as HTMLInputElement).checked ? "1" : "0");

  if (map) {
    const center = map.getCenter();

    params.set("lng", center.lng.toFixed(7));
    params.set("lat", center.lat.toFixed(7));
    params.set("z", map.getZoom().toFixed(2));
    params.set("b", map.getBearing().toFixed(1));
  } else {
    params.set("lng", String(DEFAULTS.lng));
    params.set("lat", String(DEFAULTS.lat));
    params.set("z", String(DEFAULTS.zoom));
    params.set("b", String(DEFAULTS.bearing));
  }

  if (marker) {
    const markerLngLat = marker.getLngLat();

    params.set("mLng", markerLngLat.lng.toFixed(7));
    params.set("mLat", markerLngLat.lat.toFixed(7));
    params.set("mHeading", String(marker.getRotation()));
  } else {
    params.set("mLng", String(DEFAULTS.markerLng));
    params.set("mLat", String(DEFAULTS.markerLat));
    params.set("mHeading", String(DEFAULTS.markerHeading));
  }

  const url = new URL(window.location.href);

  url.search = params.toString();

  return url.toString();
}

function updateShareURL() {
  const url = buildShareURL();

  /*
   * Replace rather than push a new browser-history entry.
   * Changing a slider therefore doesn't create 100 history entries.
   */
  window.history.replaceState(null, "", url);

  (document.getElementById("shareUrl") as HTMLInputElement).value = url;
}

let urlUpdateTimer: number | null = null;

function scheduleURLUpdate() {
  clearTimeout(urlUpdateTimer);
  urlUpdateTimer = setTimeout(updateShareURL, 100);
}

/*
 * ================================================================
 * MAP
 * ================================================================
 */

function setPaint(id: string, property: keyof maplibregl.AllPaintProperties, value: any) {
  try {
    if (map && map.getLayer(id)) {
      map.setPaintProperty(id, property, value);
    }
  } catch (error) {}
}

function setLayout(id: string, property: keyof maplibregl.AllLayoutProperties, value: any) {
  try {
    if (map && map.getLayer(id)) {
      map.setLayoutProperty(id, property, value);
    }
  } catch (error) {}
}

function sourceLayer(layer: maplibregl.AnyLayer) {
  return layer["source-layer"] || "";
}

function classifySymbol(layer: maplibregl.AnyLayer) {
  const id = layer.id.toLowerCase();
  const source = sourceLayer(layer).toLowerCase();

  const isStreet =
    source === "transportation_name" ||
    id.includes("road-label") ||
    id.includes("road_name") ||
    id.includes("transportation_name");

  const isPoi =
    source === "poi" || source === "aeroway_label" || id.includes("poi");

  return { isStreet, isPoi };
}

let flattenedBuildings = false;

function flattenBuildings() {
  if (flattenedBuildings) {
    return;
  }

  try {
    /*
     * The base style hands buildings off to a fill-extrusion
     * ('building-3d') layer above zoom 14, and that layer is
     * hidden below (NO 3D BUILDINGS). Extend the flat 'building'
     * fill layer so buildings keep rendering at every zoom
     * instead of disappearing past z14.
     */
    if (map.getLayer("building")) {
      map.setLayerZoomRange("building", 13, 24);
      flattenedBuildings = true;
    }
  } catch (error) {}
}

function applyStyle() {
  if (!map || !map.isStyleLoaded()) {
    return;
  }

  flattenBuildings();

  const showLabels = (document.getElementById("labels") as HTMLInputElement).checked;
  const showPois = (document.getElementById("pois") as HTMLInputElement).checked;

  for (const layer of map.getStyle().layers || []) {
    const id = layer.id;
    const source = sourceLayer(layer).toLowerCase();

    /*
     * ------------------------------------------------------------
     * SYMBOLS / TEXT
     * ------------------------------------------------------------
     */

    if (layer.type === "symbol") {
      const classification = classifySymbol(layer);

      if (classification.isStreet) {
        setLayout(id, "visibility", showLabels ? "visible" : "none");
        setLayout(id, "text-font", theme.font);
        setLayout(id, "text-size", theme.streetSize);

        if (source === "transportation_name") {
          setLayout(id, "text-field", [
            "coalesce",
            ["get", "name"],
            ["get", "ref"]
          ]);
        }

        setPaint(id, "text-color", theme.streetText);
        setPaint(id, "text-halo-color", theme.streetHalo);
        setPaint(id, "text-halo-width", 1.25);
        setPaint(id, "text-halo-blur", 0.1);
      } else if (classification.isPoi) {
        setLayout(id, "visibility", showPois ? "visible" : "none");
      } else {
        /*
         * Hide city/country/place/water/etc.
         * The screenshot-style map is intentionally focused
         * on street names.
         */
        setLayout(id, "visibility", "none");
      }

      continue;
    }

    /*
     * ------------------------------------------------------------
     * NO 3D BUILDINGS
     * ------------------------------------------------------------
     */

    if (layer.type === "fill-extrusion") {
      setLayout(id, "visibility", "none");
      continue;
    }

    /*
     * ------------------------------------------------------------
     * FILLS
     * ------------------------------------------------------------
     */

    if (layer.type === "fill") {
      if (source === "water") {
        setPaint(id, "fill-color", theme.water);
      } else if (source === "building") {
        setPaint(id, "fill-color", theme.buildings);
      } else if (
        source === "land" ||
        source === "landuse" ||
        source === "landcover" ||
        source === "park"
      ) {
        setPaint(id, "fill-color", theme.land);

        /*
         * The base style outlines parks in bright green
         * (fill-outline-color). Neutralize it so no green
         * lines are visible.
         */
        setPaint(id, "fill-outline-color", theme.land);
      }

      continue;
    }

    /*
     * ------------------------------------------------------------
     * BACKGROUND
     * ------------------------------------------------------------
     */

    if (layer.type === "background") {
      setPaint(id, "background-color", theme.land);
      continue;
    }

    /*
     * ------------------------------------------------------------
     * ROADS
     * ------------------------------------------------------------
     */

    if (layer.type === "line" && source === "transportation") {
      setPaint(id, "line-color", [
        "match",
        ["get", "class"],
        "motorway",
        theme.roads,
        "trunk",
        theme.roads,
        "primary",
        theme.roads,
        "secondary",
        theme.roads,
        "tertiary",
        theme.roads,
        "minor",
        theme.minorRoads,
        "service",
        theme.minorRoads,
        theme.minorRoads
      ]);
    }

    /*
     * ------------------------------------------------------------
     * WATERWAYS
     * ------------------------------------------------------------
     */

    if (layer.type === "line" && source === "waterway") {
      setPaint(id, "line-color", theme.water);
    }

    /*
     * ------------------------------------------------------------
     * ROAD CASINGS / OUTLINES
     * ------------------------------------------------------------
     */

    if (
      layer.type === "line" &&
      (id.toLowerCase().includes("casing") ||
        id.toLowerCase().includes("outline"))
    ) {
      setPaint(id, "line-color", "#dedede");
    }
  }

  document.getElementById("status").textContent =
    "Loaded • vector tiles • shareable style";
}

/*
 * ================================================================
 * MARKER
 * ================================================================
 *
 * Draggable, so its position can be adjusted directly on the map.
 * Dragging updates the shareable URL, same as panning/zooming.
 */

function addMarker() {
  const el = document.createElement("img");

  el.src = "./assets/marker.svg";
  el.style.width = "20px";
  el.style.height = "32px";
  el.style.display = "block";
  el.style.cursor = "grab";
  el.alt = "marker";

  marker = new maplibregl.Marker({
    element: el,
    anchor: "bottom",
    rotation: INITIAL_STATE.markerHeading,
    rotationAlignment: "map",
    pitchAlignment: "map",
    draggable: true
  })
    .setLngLat([INITIAL_STATE.markerLng, INITIAL_STATE.markerLat])
    .addTo(map);

  marker.on("dragstart", () => {
    el.style.cursor = "grabbing";
  });

  marker.on("dragend", () => {
    el.style.cursor = "grab";
    scheduleURLUpdate();

    document.getElementById("status").textContent =
      "Marker moved — share link updated";
  });
}

async function createMap() {
  const response = await fetch(STYLE_URL);

  if (!response.ok) {
    throw new Error("Could not load OpenFreeMap style");
  }

  const style = await response.json();

  /*
   * Your own glyph repository.
   */
  style.glyphs = GLYPH_URL;

  map = new maplibregl.Map({
    container: "map",
    style,

    center: [INITIAL_STATE.lng, INITIAL_STATE.lat],
    zoom: INITIAL_STATE.zoom,
    pitch: 0,
    bearing: INITIAL_STATE.bearing,
    maxPitch: 0,

    attributionControl: {
      compact: false,
      customAttribution: [
        '<a href="https://www.openfreemap.org">OpenFreeMap</a>'
      ]
    }
  });

  map.setMaxPitch(0);
  map.touchPitch.disable();

  map.addControl(
    new maplibregl.NavigationControl({ visualizePitch: false }),
    "bottom-right"
  );

  map.addControl(
    new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }),
    "bottom-left"
  );

  map.on("load", () => {
    syncControlsFromState();
    applyStyle();
    addMarker();
    updateShareURL();
  });

  map.on("styledata", () => {
    if (map.isStyleLoaded()) {
      applyStyle();
    }
  });

  /*
   * Pan/zoom/bearing changes also become shareable.
   */
  map.on("moveend", scheduleURLUpdate);

  map.on("error", event => {
    console.error("MapLibre error:", event);

    document.getElementById("status").textContent =
      "Map error — check the browser console.";
  });
}

/*
 * ================================================================
 * FONT DISCOVERY
 * ================================================================
 */

function getCachedFonts() {
  try {
    const raw = localStorage.getItem(FONT_CACHE_KEY);

    if (!raw) {
      return null;
    }

    const cached = JSON.parse(raw);

    if (!cached || !Array.isArray(cached.fonts) || !cached.savedAt) {
      return null;
    }

    if (Date.now() - cached.savedAt > FONT_CACHE_TTL) {
      return null;
    }

    return cached.fonts;
  } catch (error) {
    return null;
  }
}

function cacheFonts(fonts) {
  try {
    localStorage.setItem(
      FONT_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), fonts })
    );
  } catch (error) {}
}

function populateFontSelect(fonts) {
  const select = document.getElementById("font") as HTMLSelectElement;

  select.innerHTML = "";

  for (const name of fonts) {
    const option = document.createElement("option");

    option.value = name;
    option.textContent = name;

    select.appendChild(option);
  }

  if (fonts.includes(theme.font[0])) {
    select.value = theme.font[0];
  } else if (fonts.length) {
    /*
     * Only use the first discovered
     * font if the URL requested a font
     * that no longer exists.
     */
    theme.font = [fonts[0]];
    select.value = fonts[0];
  }

  select.disabled = fonts.length === 0;
}

async function discoverFonts() {
  /*
   * Use cached discovery first.
   */
  const cached = getCachedFonts();

  if (cached && cached.length) {
    populateFontSelect(cached);

    /*
     * If the URL specified a font
     * that exists in the repository,
     * preserve it.
     */
    if (cached.includes(INITIAL_STATE.font)) {
      theme.font = [INITIAL_STATE.font];
      document.getElementById("font").value = INITIAL_STATE.font;
    }

    return;
  }

  const response = await fetch(FONT_LIST_URL, {
    headers: { Accept: "application/vnd.github+json" }
  });

  if (!response.ok) {
    throw new Error("GitHub font-list request failed: " + response.status);
  }

  const entries = await response.json();

  const fonts = entries
    .filter(entry => entry.type === "dir" && entry.name)
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  cacheFonts(fonts);
  populateFontSelect(fonts);

  /*
   * Preserve the font from the URL.
   */
  if (fonts.includes(INITIAL_STATE.font)) {
    theme.font = [INITIAL_STATE.font];
    document.getElementById("font").value = INITIAL_STATE.font;
  }
}

/*
 * ================================================================
 * CONTROLS
 * ================================================================
 */

const colorBindings = [
  ["water", "water"],
  ["land", "land"],
  ["buildings", "buildings"],
  ["roads", "roads"],
  ["minorRoads", "minorRoads"],
  ["streetText", "streetText"]
];

for (const [id, key] of colorBindings) {
  document.getElementById(id).addEventListener("input", event => {
    theme[key] = event.target.value;
    applyStyle();
    scheduleURLUpdate();
  });
}

document.getElementById("streetSize").addEventListener("input", event => {
  theme.streetSize = Number(event.target.value);
  applyStyle();
  scheduleURLUpdate();
});

document.getElementById("font").addEventListener("change", event => {
  if (!event.target.value) {
    return;
  }

  theme.font = [event.target.value];
  applyStyle();
  scheduleURLUpdate();
});

document.getElementById("labels").addEventListener("change", () => {
  applyStyle();
  scheduleURLUpdate();
});

document.getElementById("pois").addEventListener("change", () => {
  applyStyle();
  scheduleURLUpdate();
});

/*
 * ================================================================
 * RESET
 * ================================================================
 *
 * Reset means:
 *
 *   1. Restore the ORIGINAL values.
 *   2. Restore the original Funchal map position.
 *   3. Restore the original marker position/heading.
 *   4. Remove all custom query parameters.
 *
 * The resulting URL is simply:
 *
 *   /your-map.html
 *
 */

document.getElementById("reset").addEventListener("click", () => {
  theme.land = DEFAULTS.land;
  theme.water = DEFAULTS.water;
  theme.buildings = DEFAULTS.buildings;
  theme.roads = DEFAULTS.roads;
  theme.minorRoads = DEFAULTS.minorRoads;
  theme.streetText = DEFAULTS.streetText;
  theme.streetSize = DEFAULTS.streetSize;
  theme.font = [DEFAULTS.font];

  document.getElementById("labels").checked = DEFAULTS.labels;
  document.getElementById("pois").checked = DEFAULTS.pois;
  document.getElementById("land").value = DEFAULTS.land;
  document.getElementById("water").value = DEFAULTS.water;
  document.getElementById("buildings").value = DEFAULTS.buildings;
  document.getElementById("roads").value = DEFAULTS.roads;
  document.getElementById("minorRoads").value = DEFAULTS.minorRoads;
  document.getElementById("streetText").value = DEFAULTS.streetText;
  document.getElementById("streetSize").value = DEFAULTS.streetSize;

  const fontSelect = document.getElementById("font");

  if ([...fontSelect.options].some(option => option.value === DEFAULTS.font)) {
    fontSelect.value = DEFAULTS.font;
  }

  if (map) {
    map.jumpTo({
      center: [DEFAULTS.lng, DEFAULTS.lat],
      zoom: DEFAULTS.zoom,
      bearing: DEFAULTS.bearing,
      pitch: 0
    });
  }

  if (marker) {
    marker.setLngLat([DEFAULTS.markerLng, DEFAULTS.markerLat]);
    marker.setRotation(DEFAULTS.markerHeading);
  }

  /*
   * Remove the query string
   * completely.
   */
  window.history.replaceState(null, "", window.location.pathname);

  applyStyle();

  /*
   * Re-add the current state
   * to the visible share box.
   */
  updateShareURL();

  document.getElementById("status").textContent = "Reset to original settings";
});

/*
 * ================================================================
 * COPY SHARE LINK
 * ================================================================
 */

document.getElementById("copyLink").addEventListener("click", async () => {
  updateShareURL();

  const value = document.getElementById("shareUrl").value;

  try {
    await navigator.clipboard.writeText(value);
    document.getElementById("status").textContent =
      "Share link copied to clipboard";
  } catch (error) {
    const input = document.getElementById("shareUrl");

    input.select();

    document.getElementById("status").textContent =
      "Select/copy the URL manually";
  }
});

/*
 * ================================================================
 * START
 * ================================================================
 */

syncControlsFromState();

Promise.all([createMap(), discoverFonts()]).catch(error => {
  console.error(error);

  document.getElementById("status").textContent =
    "Startup error — check the browser console.";
});
