import "./style.css";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from "maplibre-gl";
import type {
  AllLayoutProperties,
  AllPaintProperties,
  LayerSpecification,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div id="map"></div>

  <div class="panel">
    <div class="titleBox">Funchal — screenshot-style basemap <span class="toggleWindow"><button id="toggleWindow"> - </button></span></div>
   
    <div id="window" style="display: block;">
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
      <label>Marker size</label>
      <input
        id="markerSize"
        type="range"
        min="0.05"
        max="10"
        step="0.05"
        value="0.05"
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
      <label>
        <input id="outlines" type="checkbox" />
        outlines
      </label>
      <label>
        <input id="roundedStreets" type="checkbox" />
        rounded streets ends/joins
      </label>
      <label>
        <input id="waterways" type="checkbox" />
        waterways
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

  lng: -16.904904,
  lat: 32.6479946,
  zoom: 16.42,
  bearing: 0,
  pitch: 0,

  markerLng: -16.9026988,
  markerLat: 32.647993,
  markerSize: 0.45,

  outlines: false,
  roundedStreets: true,
  waterways: true,
};

let windowOpen = true;

const MARKER_REFERENCE_ZOOM = 14.1; // zoom at which markerSize = "100%"

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const GLYPH_URL =
  "https://raw.githubusercontent.com/Mictilt/roboto-glyphs/main/glyphs/{fontstack}/{range}.pbf";

const FONT_LIST_URL =
  "https://api.github.com/repos/Mictilt/roboto-glyphs/contents/glyphs?ref=main";

const FONT_CACHE_KEY = "mictilt-map-glyph-fonts-v1";

const FONT_CACHE_TTL = 1 * 60 * 60 * 1000;

const theme = {
  land: DEFAULTS.land,
  water: DEFAULTS.water,
  buildings: DEFAULTS.buildings,
  roads: DEFAULTS.roads,
  minorRoads: DEFAULTS.minorRoads,
  streetText: DEFAULTS.streetText,

  streetHalo: "#eeeeee",
  outlines: DEFAULTS.outlines,
  roundedStreets: DEFAULTS.roundedStreets,
  waterways: DEFAULTS.waterways,
  streetSize: DEFAULTS.streetSize,
  font: [DEFAULTS.font],
  markerSize: DEFAULTS.markerSize,
};

let map: MapLibreMap | null = null;
let marker: Marker | null = null;

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

  if (params.size === 0) {
    return DEFAULTS;
  }

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
    markerSize: DEFAULTS.markerSize,

    outlines: DEFAULTS.outlines,
    roundedStreets: DEFAULTS.roundedStreets,
    waterways: DEFAULTS.waterways,
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
    "streetText",
  ]) {
    const value = params.get(key);

    if (value && isValidHex(value)) {
      state[key as keyof typeof state] = value.toLowerCase() as never;
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

  const markerSize = Number(params.get("mSize"));

  if (Number.isFinite(markerSize) && markerSize >= 0.05 && markerSize <= 10) {
    state.markerSize = markerSize;
  }

  const outlines = params.get("outlines");

  if (outlines === "0" || outlines === "1") {
    state.outlines = outlines === "1";
  }

  const roundedStreets = params.get("roundedStreets");

  if (roundedStreets === "0" || roundedStreets === "1") {
    state.roundedStreets = roundedStreets === "1";
  }

  const waterways = params.get("waterways");

  if (waterways === "0" || waterways === "1") {
    state.waterways = waterways === "1";
  }

  const labels = params.get("labels");

  if (labels === "0" || labels === "1") {
    state.labels = labels === "1";
  }

  const pois = params.get("pois");

  if (pois === "0" || pois === "1") {
    state.pois = pois === "1";
  }

  const numberParam = (
    name: string,
    fallback: number,
    min: number,
    max: number
  ) => {
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
  state.markerSize = numberParam("mSize", DEFAULTS.markerSize, 0.05, 10);

  return state;
}

const INITIAL_STATE = readInitialStateFromURL();
console.log("INITIAL_STATE", INITIAL_STATE);
/*
 * Apply URL/default state to the controls.
 */
function syncControlsFromState() {
  (document.getElementById("land") as HTMLInputElement).value =
    INITIAL_STATE.land;
  (document.getElementById("water") as HTMLInputElement).value =
    INITIAL_STATE.water;
  (document.getElementById("buildings") as HTMLInputElement).value =
    INITIAL_STATE.buildings;
  (document.getElementById("roads") as HTMLInputElement).value =
    INITIAL_STATE.roads;
  (document.getElementById("minorRoads") as HTMLInputElement).value =
    INITIAL_STATE.minorRoads;
  (document.getElementById("streetText") as HTMLInputElement).value =
    INITIAL_STATE.streetText;
  (document.getElementById("streetSize") as HTMLInputElement).value =
    INITIAL_STATE.streetSize.toString();
  (document.getElementById("labels") as HTMLInputElement).checked =
    INITIAL_STATE.labels;
  (document.getElementById("pois") as HTMLInputElement).checked =
    INITIAL_STATE.pois;
  (document.getElementById("outlines") as HTMLInputElement).checked =
    INITIAL_STATE.outlines;
  (document.getElementById("roundedStreets") as HTMLInputElement).checked =
    INITIAL_STATE.roundedStreets;
  (document.getElementById("waterways") as HTMLInputElement).checked =
    INITIAL_STATE.waterways;
  (document.getElementById("markerSize") as HTMLInputElement).value =
    INITIAL_STATE.markerSize.toString();
  theme.land = INITIAL_STATE.land;
  theme.water = INITIAL_STATE.water;
  theme.buildings = INITIAL_STATE.buildings;
  theme.roads = INITIAL_STATE.roads;
  theme.minorRoads = INITIAL_STATE.minorRoads;
  theme.streetText = INITIAL_STATE.streetText;
  theme.streetSize = INITIAL_STATE.streetSize;
  theme.outlines = INITIAL_STATE.outlines;
  theme.roundedStreets = INITIAL_STATE.roundedStreets;
  theme.waterways = INITIAL_STATE.waterways;
  theme.font = [INITIAL_STATE.font];
  theme.markerSize = INITIAL_STATE.markerSize;
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
  params.set("mSize", String(theme.markerSize));
  params.set("outlines", theme.outlines ? "1" : "0");
  params.set("roundedStreets", theme.roundedStreets ? "1" : "0");
  params.set("waterways", theme.waterways ? "1" : "0");
  params.set(
    "labels",
    (document.getElementById("labels") as HTMLInputElement).checked ? "1" : "0"
  );

  params.set(
    "pois",
    (document.getElementById("pois") as HTMLInputElement).checked ? "1" : "0"
  );

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
  } else {
    params.set("mLng", String(DEFAULTS.markerLng));
    params.set("mLat", String(DEFAULTS.markerLat));
  }

  const url = new URL(window.location.href);

  url.search = params.toString();

  return url.toString();
}
function darken(hex: string, amount: number) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (num & 0xff) - Math.round(255 * amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
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
  if (urlUpdateTimer) {
    clearTimeout(urlUpdateTimer);
  }
  urlUpdateTimer = setTimeout(updateShareURL, 100);
}

/*
 * ================================================================
 * MAP
 * ================================================================
 */

function setPaint(
  id: string,
  property: keyof AllPaintProperties,
  value: AllPaintProperties[keyof AllPaintProperties]
) {
  try {
    if (map && map.getLayer(id)) {
      map.setPaintProperty(id, property, value);
    }
  } catch (error) {}
}

function setLayout(
  id: string,
  property: keyof AllLayoutProperties,
  value: AllLayoutProperties[keyof AllLayoutProperties]
) {
  try {
    if (map && map.getLayer(id)) {
      map.setLayoutProperty(id, property, value);
    }
  } catch (error) {}
}

function sourceLayer(layer: { ["source-layer"]?: string }) {
  return layer["source-layer"] ?? "";
}

function classifySymbol(layer: LayerSpecification) {
  const id = layer.id.toLowerCase();
  const source = sourceLayer(
    layer as { ["source-layer"]?: string }
  ).toLowerCase();

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
  if (flattenedBuildings || !map) {
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

  const showLabels = (document.getElementById("labels") as HTMLInputElement)
    .checked;
  const showPois = (document.getElementById("pois") as HTMLInputElement)
    .checked;

  for (const layer of map.getStyle().layers || []) {
    const id = layer.id;
    const source = sourceLayer(
      layer as { ["source-layer"]?: string }
    ).toLowerCase();

    /*
     * ------------------------------------------------------------
     * SYMBOLS / TEXT
     * ------------------------------------------------------------
     */

    if (layer.type === "symbol") {
      const classification = classifySymbol(layer as LayerSpecification);

      if (classification.isStreet) {
        setLayout(id, "visibility", showLabels ? "visible" : "none");
        setLayout(id, "text-font", theme.font);
        setLayout(id, "text-size", theme.streetSize);

        if (source === "transportation_name") {
          setLayout(id, "text-field", [
            "coalesce",
            ["get", "name"],
            ["get", "ref"],
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
        setPaint(id, "fill-color", [
          "match",
          ["get", "class"],
          ["river", "lake"],
          theme.waterways ? theme.water : theme.land,
          theme.water,
        ]);
      } else if (id === "landcover_wetland") {
        // Dry/seasonal riverbeds (like Funchal's ribeiras) are tagged
        // "wetland" and rendered with a hatch pattern, not as "water" —
        // hide it outright since fill-color can't override the pattern.
        setLayout(id, "visibility", theme.waterways ? "visible" : "none");
      } else if (source === "building") {
        setPaint(id, "fill-color", theme.buildings);
        setPaint(
          id,
          "fill-outline-color",
          theme.outlines ? darken(theme.buildings, 0.15) : theme.buildings
        );
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

    // ------------------------------------------------------------
    // ROAD CASINGS ("outlines") — a subtle rim slightly darker than
    // the road itself, like Google's faint street edges
    // ------------------------------------------------------------
    if (
      layer.type === "line" &&
      (id.toLowerCase().includes("casing") ||
        id.toLowerCase().includes("outline"))
    ) {
      setLayout(id, "visibility", theme.outlines ? "visible" : "none");
      setPaint(id, "line-color", darken(theme.roads, 0.12));
    }

    // ------------------------------------------------------------
    // ROUNDED STREET ENDS/JOINS
    // ------------------------------------------------------------
    if (layer.type === "line" && source === "transportation") {
      setLayout(id, "line-cap", theme.roundedStreets ? "round" : "butt");
      setLayout(id, "line-join", theme.roundedStreets ? "round" : "miter");
    }

    // ------------------------------------------------------------
    // WATERWAYS (rivers/streams) — distinct from land, doesn't
    // vanish into the lake/ocean fill
    // ------------------------------------------------------------
    if (layer.type === "line" && source === "waterway") {
      setLayout(id, "visibility", theme.waterways ? "visible" : "none");
      setPaint(id, "line-color", darken(theme.land, 0.28));
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
        theme.minorRoads,
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

  (document.getElementById("status") as HTMLDivElement).textContent =
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

let markerInner: HTMLImageElement | null = null;

function addMarker() {
  if (!map) return;

  // Outer element — MapLibre owns this element's `transform` entirely.
  const container = document.createElement("div");
  container.style.display = "block";
  container.style.cursor = "grab";

  // Inner element — we own this element's `transform` entirely.
  const img = document.createElement("img");
  img.src = "/marker.svg";
  img.style.width = `20px`;
  img.style.height = `35px`;
  img.style.display = "block";
  img.style.transformOrigin = "50% 100%";
  img.alt = "marker";

  container.appendChild(img);
  markerInner = img;

  marker = new Marker({
    element: container,
    anchor: "bottom",
    rotationAlignment: "map",
    pitchAlignment: "map",
    draggable: true,
  })
    .setLngLat([INITIAL_STATE.markerLng, INITIAL_STATE.markerLat])
    .addTo(map);

  updateMarkerScale();

  marker.on("dragstart", () => {
    container.style.cursor = "grabbing";
  });
  marker.on("dragend", () => {
    container.style.cursor = "grab";
    scheduleURLUpdate();
    (document.getElementById("status") as HTMLDivElement).textContent =
      "Marker moved — share link updated";
  });
  map.on("zoom", updateMarkerScale);
  updateMarkerScale();
}

function updateMarkerScale() {
  if (!map || !markerInner) return;

  const userScale = theme.markerSize;
  const zoomFactor = Math.pow(2, map.getZoom() - MARKER_REFERENCE_ZOOM);
  const scale = userScale * zoomFactor;

  markerInner.style.transform = `scale(${scale})`;
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

  // Optional: silence the null-ref_length filter warnings by dropping
  // the offending highway-shield / road_shield layers, since you're
  // hiding all non-street symbol layers anyway.
  style.layers = style.layers.filter(
    (l: LayerSpecification) =>
      ![
        "highway-shield-non-us",
        "highway-shield-us-interstate",
        "road_shield_us",
      ].includes(l.id)
  );

  map = new MapLibreMap({
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
        '<a href="https://www.openfreemap.org">OpenFreeMap</a>',
      ],
    },
  });

  map.setMaxPitch(0);
  map.touchPitch.disable();

  map.addControl(
    new NavigationControl({ visualizePitch: false }),
    "bottom-right"
  );
  // map.on("click", (e) => {
  //   if (map) {
  //     console.log(map.queryRenderedFeatures(e.point));
  //   }
  // });
  map.addControl(
    new ScaleControl({ maxWidth: 100, unit: "metric" }),
    "bottom-left"
  );

  map.on("load", () => {
    syncControlsFromState();
    applyStyle();
    addMarker();
    updateShareURL();
  });

  map.on("styledata", () => {
    if (map && map.isStyleLoaded()) {
      applyStyle();
    }
  });

  /*
   * Pan/zoom/bearing changes also become shareable.
   */
  map.on("moveend", scheduleURLUpdate);

  map.on("error", (event) => {
    console.error("MapLibre error:", event);

    (document.getElementById("status") as HTMLDivElement).textContent =
      "Map error — check the browser console.";
  });
}

function toggleWindow() {
  windowOpen = !windowOpen;
  if (windowOpen) {
    document.getElementById("toggleWindow")!.textContent = " - ";
    document.getElementById("window")!.style.display = "block";
  } else {
    document.getElementById("toggleWindow")!.textContent = " + ";
    document.getElementById("window")!.style.display = "none";
  }
}

(document.getElementById("toggleWindow") as HTMLButtonElement).addEventListener(
  "click",
  toggleWindow
);
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

function cacheFonts(fonts: string[]) {
  try {
    localStorage.setItem(
      FONT_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), fonts })
    );
  } catch (error) {}
}

function populateFontSelect(fonts: string[]) {
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
      (document.getElementById("font") as HTMLSelectElement).value =
        INITIAL_STATE.font;
    }

    return;
  }

  const response = await fetch(FONT_LIST_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) {
    throw new Error("GitHub font-list request failed: " + response.status);
  }

  const entries = await response.json();

  const fonts = entries
    .filter((entry: any) => entry.type === "dir" && entry.name)
    .map((entry: any) => entry.name)
    .sort((a: string, b: string) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

  cacheFonts(fonts);
  populateFontSelect(fonts);

  /*
   * Preserve the font from the URL.
   */
  if (fonts.includes(INITIAL_STATE.font)) {
    theme.font = [INITIAL_STATE.font];
    (document.getElementById("font") as HTMLSelectElement).value =
      INITIAL_STATE.font;
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
  ["streetText", "streetText"],
];

for (const [id, key] of colorBindings) {
  (document.getElementById(id) as HTMLInputElement).addEventListener(
    "input",
    (event) => {
      theme[key as keyof typeof theme] = (event.target as HTMLInputElement)
        .value as never;
      applyStyle();
      scheduleURLUpdate();
    }
  );
}

(document.getElementById("markerSize") as HTMLInputElement).addEventListener(
  "input",
  (event) => {
    theme.markerSize = Number((event.target as HTMLInputElement).value);
    updateMarkerScale();
    scheduleURLUpdate();
  }
);

(document.getElementById("streetSize") as HTMLInputElement).addEventListener(
  "input",
  (event) => {
    theme.streetSize = Number((event.target as HTMLInputElement).value);
    applyStyle();
    scheduleURLUpdate();
  }
);

(document.getElementById("font") as HTMLSelectElement).addEventListener(
  "change",
  (event) => {
    if (!(event.target as HTMLSelectElement).value) {
      return;
    }

    theme.font = [(event.target as HTMLSelectElement).value];
    applyStyle();
    scheduleURLUpdate();
  }
);

(document.getElementById("labels") as HTMLInputElement).addEventListener(
  "change",
  () => {
    applyStyle();
    scheduleURLUpdate();
  }
);

(document.getElementById("pois") as HTMLInputElement).addEventListener(
  "change",
  () => {
    applyStyle();
    scheduleURLUpdate();
  }
);

(document.getElementById("outlines") as HTMLInputElement).addEventListener(
  "change",
  (event) => {
    theme.outlines = (event.target as HTMLInputElement).checked;
    applyStyle();
    scheduleURLUpdate();
  }
);

(
  document.getElementById("roundedStreets") as HTMLInputElement
).addEventListener("change", (event) => {
  theme.roundedStreets = (event.target as HTMLInputElement).checked;
  applyStyle();
  scheduleURLUpdate();
});

(document.getElementById("waterways") as HTMLInputElement).addEventListener(
  "change",
  (event) => {
    theme.waterways = (event.target as HTMLInputElement).checked;
    applyStyle();
    scheduleURLUpdate();
  }
);
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
function defaultStyles() {
  theme.land = DEFAULTS.land;
  theme.water = DEFAULTS.water;
  theme.buildings = DEFAULTS.buildings;
  theme.roads = DEFAULTS.roads;
  theme.minorRoads = DEFAULTS.minorRoads;
  theme.streetText = DEFAULTS.streetText;
  theme.streetSize = DEFAULTS.streetSize;
  theme.font = [DEFAULTS.font];
  theme.markerSize = DEFAULTS.markerSize;
  (document.getElementById("labels") as HTMLInputElement).checked =
    DEFAULTS.labels;
  (document.getElementById("pois") as HTMLInputElement).checked = DEFAULTS.pois;
  (document.getElementById("land") as HTMLInputElement).value = DEFAULTS.land;
  (document.getElementById("water") as HTMLInputElement).value = DEFAULTS.water;
  (document.getElementById("buildings") as HTMLInputElement).value =
    DEFAULTS.buildings;
  (document.getElementById("roads") as HTMLInputElement).value = DEFAULTS.roads;
  (document.getElementById("minorRoads") as HTMLInputElement).value =
    DEFAULTS.minorRoads;
  (document.getElementById("streetText") as HTMLInputElement).value =
    DEFAULTS.streetText;
  (document.getElementById("streetSize") as HTMLInputElement).value =
    DEFAULTS.streetSize.toString();
  (document.getElementById("markerSize") as HTMLInputElement).value =
    DEFAULTS.markerSize.toString();
  (document.getElementById("outlines") as HTMLInputElement).checked =
    DEFAULTS.outlines;
  (document.getElementById("roundedStreets") as HTMLInputElement).checked =
    DEFAULTS.roundedStreets;
  (document.getElementById("waterways") as HTMLInputElement).checked =
    DEFAULTS.waterways;
  const fontSelect = document.getElementById("font") as HTMLSelectElement;

  if (
    Array.from(fontSelect.options).some(
      (option: HTMLOptionElement) => option.value === DEFAULTS.font
    )
  ) {
    fontSelect.value = DEFAULTS.font;
  }

  if (map) {
    map.jumpTo({
      center: [DEFAULTS.lng, DEFAULTS.lat],
      zoom: DEFAULTS.zoom,
      bearing: DEFAULTS.bearing,
      pitch: 0,
    });
  }

  if (marker) {
    marker.setLngLat([DEFAULTS.markerLng, DEFAULTS.markerLat]);
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

  (document.getElementById("status") as HTMLDivElement).textContent =
    "Reset to original settings";
}
(document.getElementById("reset") as HTMLButtonElement).addEventListener(
  "click",
  () => {
    defaultStyles();
  }
);

/*
 * ================================================================
 * COPY SHARE LINK
 * ================================================================
 */

(document.getElementById("copyLink") as HTMLButtonElement).addEventListener(
  "click",
  async () => {
    updateShareURL();

    const value = (document.getElementById("shareUrl") as HTMLInputElement)
      .value;

    try {
      await navigator.clipboard.writeText(value);
      (document.getElementById("status") as HTMLDivElement).textContent =
        "Share link copied to clipboard";
    } catch (error) {
      const input = document.getElementById("shareUrl") as HTMLInputElement;

      input.select();

      (document.getElementById("status") as HTMLDivElement).textContent =
        "Select/copy the URL manually";
    }
  }
);

/*
 * ================================================================
 * START
 * ================================================================
 */

syncControlsFromState();

createMap().catch((error) => {
  console.error(error);
  (document.getElementById("status") as HTMLDivElement).textContent =
    "Map error — check the browser console.";
});

discoverFonts().catch((error) => {
  console.error(error);
  // Font list failed — don't touch the map status, just leave the
  // font <select> disabled/showing "Loading glyphs…" or fall back
  // to the default font silently.
});
