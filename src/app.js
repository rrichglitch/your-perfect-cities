const LANGUAGES = [
  "English", "Mandarin Chinese", "Hindi", "Spanish", "French",
  "Arabic", "Bengali", "Portuguese", "Russian", "Urdu",
  "Indonesian", "German", "Japanese", "Marathi", "Telugu",
  "Turkish", "Tamil", "Vietnamese", "Korean", "Italian",
  "Gujarati", "Polish", "Ukrainian", "Malayalam", "Kannada",
  "Oriya", "Burmese", "Persian", "Thai", "Dutch"
];

const LANG_CODES = {
  "English": "en", "Mandarin Chinese": "zh", "Hindi": "hi", "Spanish": "es",
  "French": "fr", "Arabic": "ar", "Bengali": "bn", "Portuguese": "pt",
  "Russian": "ru", "Urdu": "ur", "Indonesian": "id", "German": "de",
  "Japanese": "ja", "Marathi": "mr", "Telugu": "te", "Turkish": "tr",
  "Tamil": "ta", "Vietnamese": "vi", "Korean": "ko", "Italian": "it",
  "Gujarati": "gu", "Polish": "pl", "Ukrainian": "uk", "Malayalam": "ml",
  "Kannada": "kn", "Oriya": "or", "Burmese": "my", "Persian": "fa",
  "Thai": "th", "Dutch": "nl"
};

const DIMENSIONS = [
  { key: "walkability", label: "Walkability & Transit" },
  { key: "affordability", label: "Affordability" },
  { key: "safety", label: "Safety & Stability" },
  { key: "climate", label: "Climate Comfort" },
  { key: "economy", label: "Economic Opportunity" },
  { key: "culture", label: "Cultural Amenities" },
  { key: "healthcare", label: "Healthcare Quality" },
  { key: "digital", label: "Digital Infrastructure" },
  { key: "scale", label: "Urban Scale & Density" },
  { key: "education", label: "Education Access" },
  { key: "intellect", label: "Intellectual Emphasis" },
  { key: "tradition", label: "Tradition & Continuity" },
  { key: "individualism", label: "Individualism vs Collectivism" },
  { key: "spiritual", label: "Spiritual / Religious Depth" },
  { key: "innovation", label: "Innovation & Risk-Taking" },
  { key: "trust", label: "Social Trust & Harmony" },
  { key: "art", label: "Art & Aesthetic Values" },
  { key: "longterm", label: "Long-Term Orientation" },
  { key: "rationalism", label: "Rationalism & Evidence" },
  { key: "wisdom", label: "Local Wisdom Traditions" },
];

const SECTIONS = [
  { start: 0, end: 10, title: "City Characteristics" },
  { start: 10, end: 20, title: "Culture & Wisdom" },
];

const DEFAULT_PREFS = [
  2, -1, 3, 2, 3, 1, 3, 2, -1, 2,
  1, 0, 2, 1, 2, 1, 0, 0, 2, 0,
];

let currentCities = [];
let deckgl = null;
let currentZoom = null;
let landData = null;
let stateData = null;
let conn = null;
let translations = {};
let currentLang = "en";
let selectedLanguages = ["", "", ""];
let pendingUpdate = false;
let pinnedCity = null;       // city the tooltip is currently anchored to
let pinnedCityKey = null;    // identifier used to detect "still hovering the same city"
let tooltipOver = false;     // true while the cursor is over the tooltip itself

/* ------------------------------------------------------------------ */
/* Sphere mesh & grid                                                  */
/* ------------------------------------------------------------------ */

function createSphereMesh(radius = 1, latSteps = 32, lonSteps = 64) {
  const positions = [];
  const normals = [];
  const texCoords = [];
  const indices = [];

  for (let lat = 0; lat <= latSteps; lat++) {
    const theta = (lat * Math.PI) / latSteps;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    for (let lon = 0; lon <= lonSteps; lon++) {
      const phi = (lon * 2 * Math.PI) / lonSteps;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const x = cosPhi * sinTheta;
      const y = cosTheta;
      const z = sinPhi * sinTheta;
      positions.push(radius * x, radius * y, radius * z);
      normals.push(x, y, z);
      texCoords.push(1 - lon / lonSteps, 1 - lat / latSteps);
    }
  }

  for (let lat = 0; lat < latSteps; lat++) {
    for (let lon = 0; lon < lonSteps; lon++) {
      const first = lat * (lonSteps + 1) + lon;
      const second = first + lonSteps + 1;
      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices),
  };
}

const EARTH_RADIUS_M = 6371000;
const SPHERE_MESH = createSphereMesh(EARTH_RADIUS_M * 0.99, 24, 48);

function createGridGeoJSON() {
  const features = [];
  for (let lat = -60; lat <= 60; lat += 30) {
    const coords = [];
    for (let lon = -180; lon <= 180; lon += 10) coords.push([lon, lat]);
    features.push({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} });
  }
  for (let lon = -180; lon < 180; lon += 30) {
    const coords = [];
    for (let lat = -90; lat <= 90; lat += 10) coords.push([lon, lat]);
    features.push({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} });
  }
  return { type: "FeatureCollection", features };
}

const GRID_DATA = createGridGeoJSON();

/* ------------------------------------------------------------------ */
/* Color helpers                                                      */
/* ------------------------------------------------------------------ */

function heatColor(t) {
  if (t < 0.25) {
    const s = t / 0.25;
    return [0, Math.round(s * 180), 255];
  }
  if (t < 0.50) {
    const s = (t - 0.25) / 0.25;
    return [0, 180 + Math.round(s * 75), 255];
  }
  if (t < 0.75) {
    const s = (t - 0.50) / 0.25;
    return [Math.round(s * 255), 255, Math.round((1 - s) * 255)];
  }
  const s = (t - 0.75) / 0.25;
  return [255, Math.round((1 - s) * 255), 0];
}

/* ------------------------------------------------------------------ */
/* UI Builders                                                        */
/* ------------------------------------------------------------------ */

function applyTranslations() {
  const t = translations;
  if (!t || Object.keys(t).length === 0) return;

  const setText = (id, key) => {
    const el = document.getElementById(id);
    if (el && t[key]) el.textContent = t[key];
  };

  setText("app-title", "title");
  setText("app-subtitle", "subtitle");
  setText("lang-section-title", "language");
  setText("label-primary-panel", "primary");
  setText("label-secondary-panel", "secondary");
  setText("label-tertiary-panel", "tertiary");
  setText("panel-title", "top_matches");
  setText("panel-subtitle", "your_top_20");
  setText("legend-title", "match_score");
  setText("legend-low", "low");
  setText("legend-high", "high");
  setText("reset", "reset");
  setText("random", "surprise_me");

  const sectionTitles = document.querySelectorAll(".section-title");
  sectionTitles.forEach((el, idx) => {
    if (idx === 0 && t.city_characteristics && el.id !== "lang-section-title") {
      el.textContent = t.city_characteristics;
    }
    if (idx === 1 && t.culture_wisdom) el.textContent = t.culture_wisdom;
  });

  DIMENSIONS.forEach((dim, i) => {
    const labelEl = document.querySelector(`#slider-${i}`)?.previousElementSibling?.querySelector("span:first-child");
    if (labelEl && t[dim.key]) labelEl.textContent = t[dim.key];
  });
}

function populateLanguageSelects() {
  const ids = ["lang-primary", "lang-secondary", "lang-tertiary",
               "modal-lang-primary", "modal-lang-secondary", "modal-lang-tertiary"];
  ids.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">--</option>';
    LANGUAGES.forEach(lang => {
      const opt = document.createElement("option");
      opt.value = lang;
      opt.textContent = lang;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
  });
}

function showLanguageModal() {
  const modal = document.getElementById("lang-modal");
  if (!modal) return;
  populateLanguageSelects();
  modal.classList.add("active");
}

function hideLanguageModal() {
  const modal = document.getElementById("lang-modal");
  if (!modal) return;
  modal.classList.remove("active");
}

function handleLanguageConfirm() {
  const primary = document.getElementById("modal-lang-primary")?.value || "";
  const secondary = document.getElementById("modal-lang-secondary")?.value || "";
  const tertiary = document.getElementById("modal-lang-tertiary")?.value || "";

  selectedLanguages = [primary, secondary, tertiary];
  localStorage.setItem("placeMatcherLangs", JSON.stringify(selectedLanguages));

  const panelPrimary = document.getElementById("lang-primary");
  const panelSecondary = document.getElementById("lang-secondary");
  const panelTertiary = document.getElementById("lang-tertiary");
  if (panelPrimary) panelPrimary.value = primary;
  if (panelSecondary) panelSecondary.value = secondary;
  if (panelTertiary) panelTertiary.value = tertiary;

  if (primary) {
    currentLang = LANG_CODES[primary] || "en";
    localStorage.setItem("placeMatcherLang", currentLang);
    loadTranslationsFromDb();
  }

  hideLanguageModal();
  requestUpdate();
}

function initLanguageFromStorage() {
  const savedLangs = localStorage.getItem("placeMatcherLangs");
  const savedLang = localStorage.getItem("placeMatcherLang");

  populateLanguageSelects();

  if (savedLangs) {
    try {
      selectedLanguages = JSON.parse(savedLangs);
      const [primary, secondary, tertiary] = selectedLanguages;

      const panelPrimary = document.getElementById("lang-primary");
      const panelSecondary = document.getElementById("lang-secondary");
      const panelTertiary = document.getElementById("lang-tertiary");
      if (panelPrimary) panelPrimary.value = primary || "";
      if (panelSecondary) panelSecondary.value = secondary || "";
      if (panelTertiary) panelTertiary.value = tertiary || "";

      if (primary) {
        if (savedLang) {
          currentLang = savedLang;
          loadTranslationsFromDb();
        }
        hideLanguageModal();
        return;
      }
    } catch (e) {
      console.error("Error parsing saved languages:", e);
    }
  }
}

function buildSliders() {
  const container = document.getElementById("sliders");
  container.innerHTML = "";

  SECTIONS.forEach((sec) => {
    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = sec.title;
    container.appendChild(title);

    for (let i = sec.start; i < sec.end; i++) {
      const dim = DIMENSIONS[i];
      const row = document.createElement("div");
      row.className = "slider-row";

      const labelRow = document.createElement("div");
      labelRow.className = "slider-label";
      labelRow.innerHTML = `<span>${dim.label}</span><span class="slider-val" id="val-${i}">${DEFAULT_PREFS[i]}</span>`;

      const input = document.createElement("input");
      input.type = "range";
      input.min = -5;
      input.max = 5;
      input.step = 0.5;
      input.value = DEFAULT_PREFS[i];
      input.id = `slider-${i}`;
      input.addEventListener("input", () => {
        document.getElementById(`val-${i}`).textContent = input.value;
        requestUpdate();
      }, { passive: true });

      row.appendChild(labelRow);
      row.appendChild(input);
      container.appendChild(row);
    }
  });
}

/* ------------------------------------------------------------------ */
/* SpaceTimeDB Data & Update Logic                                     */
/* ------------------------------------------------------------------ */

function getQueryVector() {
  return DIMENSIONS.map((_, i) => parseFloat(document.getElementById(`slider-${i}`).value));
}

function getSelectedLanguages() {
  const primary = document.getElementById("lang-primary")?.value || "";
  const secondary = document.getElementById("lang-secondary")?.value || "";
  const tertiary = document.getElementById("lang-tertiary")?.value || "";
  return [primary, secondary, tertiary].filter(l => l);
}

function loadTranslationsFromDb() {
  if (!conn) return;
  const trans = {};
  for (const row of conn.db.translation.iter()) {
    if (row.langCode === currentLang) {
      trans[row.key] = row.value;
    }
  }
  translations = trans;
  applyTranslations();
}

let debounceTimer;
function requestUpdate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(updateScores, 150);
}

let lastQueryStr = null;

function updateScores() {
  if (!conn || pendingUpdate) return;
  const query = getQueryVector();
  const langs = getSelectedLanguages();
  const queryStr = query.join(",") + "|" + langs.join(",");
  if (queryStr === lastQueryStr) return;
  lastQueryStr = queryStr;

  pendingUpdate = true;
  const loadingEl = document.getElementById("loading");
  if (loadingEl) loadingEl.style.display = "block";

  try {
    conn.reducers.scoreCities({ query, languages: langs });
  } catch (err) {
    console.error("Failed to call scoreCities reducer:", err);
  } finally {
    // Note: pendingUpdate and loading are cleared when new rows arrive
    // via the onInsert callback, or after a timeout
    setTimeout(() => {
      pendingUpdate = false;
      if (loadingEl) loadingEl.style.display = "none";
    }, 500);
  }
}

function refreshCitiesFromDb() {
  if (!conn) return;
  const myIdentity = conn.identity;
  const results = [];
  // Filter score_result by the current connection's identity. Without
  // this, every connected client sees every other client's stale
  // results in the table, which causes the top-matches panel to show
  // duplicate city names (one entry per call) and hides any language
  // filter the user just applied (since the user's filtered results
  // are buried under a mountain of unfiltered rows from past calls).
  const source = myIdentity
    ? conn.db.score_result.by_identity.filter(myIdentity)
    : conn.db.score_result.iter();
  for (const row of source) {
    results.push({
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      population: Number(row.population),
      score: row.score,
      normScore: row.normScore,
      color: [row.colorR, row.colorG, row.colorB],
    });
  }
  currentCities = results;
  updateTopCities();
  renderLayer();
}

function updateTopCities() {
  const container = document.getElementById("city-list");
  if (!container) return;
  container.innerHTML = "";

  const top = [...currentCities]
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  top.forEach((c, i) => {
    const item = document.createElement("div");
    item.className = "city-item";
    item.innerHTML = `
      <div class="city-rank">${i + 1}</div>
      <div class="city-info">
        <div class="city-name">${c.name}</div>
        <div class="city-score">Match: ${c.score.toFixed(1)}</div>
      </div>
      <div class="city-color-dot" style="background:rgb(${c.color.join(",")})"></div>
    `;
    item.addEventListener("click", () => panToCity(c));
    container.appendChild(item);
  });
}

/* ------------------------------------------------------------------ */
/* Globe fit & zoom helpers                                           */
/* ------------------------------------------------------------------ */

function getGlobeZoom() {
  const wrapper = document.getElementById("globe-wrapper");
  const size = Math.min(wrapper.clientWidth, wrapper.clientHeight);
  const targetDiameter = size * 0.92;
  return Math.log2(targetDiameter / 512);
}

function getCurrentZoom() {
  return currentZoom || getGlobeZoom();
}

function panToCity(city) {
  if (!deckgl || !city) return;
  deckgl.setProps({
    initialViewState: {
      longitude: city.lng,
      latitude: city.lat,
      zoom: getCurrentZoom(),
      transitionDuration: 700,
      transitionEasing: (t) => t * (2 - t),
    },
  });
}

/* ------------------------------------------------------------------ */
/* Globe Rendering (deck.gl)                                          */
/* ------------------------------------------------------------------ */

function renderLayer() {
  const layers = [];

  layers.push(
    new deck.SimpleMeshLayer({
      id: "base-sphere",
      data: [{}],
      mesh: SPHERE_MESH,
      getPosition: [0, 0, 0],
      getColor: [30, 55, 110],
      opacity: 1,
      coordinateSystem: deck.COORDINATE_SYSTEM.CARTESIAN,
      parameters: { cull: false, depthTest: true },
    })
  );

  layers.push(
    new deck.GeoJsonLayer({
      id: "grid",
      data: GRID_DATA,
      getLineColor: [200, 210, 235, 100],
      lineWidthMinPixels: 0.7,
      filled: false,
      stroked: true,
      opacity: 1,
      pickable: false,
    })
  );

  if (landData) {
    layers.push(
      new deck.GeoJsonLayer({
        id: "land",
        data: landData,
        getFillColor: [100, 150, 85],
        getLineColor: [210, 220, 240],
        lineWidthMinPixels: 1.5,
        filled: true,
        stroked: true,
        opacity: 1,
        pickable: false,
      })
    );
  }

  if (stateData) {
    layers.push(
      new deck.GeoJsonLayer({
        id: "states",
        data: stateData,
        getLineColor: [170, 190, 210],
        lineWidthMinPixels: 0.6,
        filled: false,
        stroked: true,
        opacity: 1,
        pickable: false,
      })
    );
  }

  const sortedCities = [...currentCities].sort((a, b) => a.population - b.population);
  // Defensive: pipeline filters out cities with no real population, but if any
  // 0s slip through (e.g. a hand-edited seed.rs), treat them as a small but
  // visible default so they don't render as invisible dots.
  const effectivePop = (d) => (d.population > 0 ? d.population : 50000);
  layers.push(
    new deck.ScatterplotLayer({
      id: "cities",
      data: sortedCities,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: (d) => Math.sqrt(effectivePop(d)) * 35,
      radiusMinPixels: 2.5,
      radiusMaxPixels: 32,
      getFillColor: (d) => [...d.color, 200],
      getLineColor: [255, 255, 255, 160],
      lineWidthMinPixels: 1.0,
      opacity: 0.8,
      filled: true,
      stroked: true,
      billboard: false,
      pickable: true,
      parameters: {
        blend: true,
        blendFunc: [770, 1],
        blendEquation: 32776,
        depthTest: true,
        depthWrite: false,
      },
      onHover: (info) => {
        const tooltip = document.getElementById("tooltip");
        const rect = deckgl.canvas.getBoundingClientRect();
        if (info.object) {
          // Compute the dot's pixel position on the canvas. Try the
          // viewport projection first (so the tip is anchored to the
          // dot's actual location, even if the cursor is at the edge
          // of the pickable radius). Fall back to the cursor position
          // if projection is unavailable.
          let px = null;
          if (info.coordinate && deckgl.viewManager) {
            const vp = deckgl.viewManager.getViewport();
            if (vp && vp.project) {
              const xy = vp.project(info.coordinate);
              if (xy && Number.isFinite(xy[0]) && Number.isFinite(xy[1])) {
                px = [rect.left + xy[0], rect.top + xy[1]];
              }
            }
          }
          if (!px) {
            // Fallback: anchor to the cursor position on the canvas. For
            // small dots this is effectively the same as the dot's
            // position.
            px = [rect.left + info.x, rect.top + info.y];
          }
          pinnedCity = info.object;
          pinnedCityKey = `${info.object.name}|${info.object.lat}|${info.object.lng}`;
          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${info.object.lat},${info.object.lng}`;
          tooltip.style.display = "block";
          tooltip.style.left = `${px[0]}px`;
          tooltip.style.top = `${px[1]}px`;
          tooltip.style.transform = "translate(-50%, calc(-100% - 14px))";
          tooltip.innerHTML = `
            <div class="tooltip-name">${info.object.name}</div>
            <div class="tooltip-meta">Pop: ${info.object.population > 0 ? info.object.population.toLocaleString() : "unknown"}</div>
            <div class="tooltip-score">Match: ${info.object.score.toFixed(1)}</div>
            <a class="tooltip-link" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>
          `;
        }
        // We DON'T hide the tooltip on `info.object === null`. The
        // tooltip's lifecycle is owned by the dot (hover start) and the
        // tooltip element's mouseleave. This way the cursor can move from
        // the dot up into the tip without the tip hiding.
      },
      onClick: (info) => {
        if (info.object) panToCity(info.object);
      },
    })
  );

  deckgl.setProps({ layers });
}

function initGlobe() {
  const wrapper = document.getElementById("globe-wrapper");
  const zoom = getGlobeZoom();
  currentZoom = zoom;

  deckgl = new deck.DeckGL({
    container: "globe",
    views: new deck._GlobeView(),
    initialViewState: {
      longitude: 20,
      latitude: 25,
      zoom: zoom,
      transitionDuration: 300,
      transitionEasing: (t) => t * (2 - t),
    },
    controller: true,
    onViewStateChange: ({ viewState }) => {
      currentZoom = viewState.zoom;
      // If a tooltip is pinned to a city, re-project it so the tip
      // stays anchored to the moving dot during pan/zoom.
      if (pinnedCity && tooltipOver === false) {
        // Only re-pin if the cursor is NOT over the tip (otherwise leave
        // it where the user is reading it).
        const tooltip = document.getElementById("tooltip");
        const rect = deckgl.canvas.getBoundingClientRect();
        const vp = deckgl.viewManager && deckgl.viewManager.getViewport();
        if (tooltip && vp && vp.project) {
          const xy = vp.project([pinnedCity.lng, pinnedCity.lat]);
          if (xy && Number.isFinite(xy[0]) && Number.isFinite(xy[1])) {
            tooltip.style.left = `${rect.left + xy[0]}px`;
            tooltip.style.top = `${rect.top + xy[1]}px`;
          }
        }
      }
    },
    glOptions: { alpha: true, premultipliedAlpha: false },
    parameters: { clearColor: [0, 0, 0, 0], depthTest: true },
    layers: [],
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const newZoom = getGlobeZoom();
      deckgl.setProps({
        initialViewState: {
          longitude: 20, latitude: 25, zoom: newZoom,
          transitionDuration: 200,
          transitionEasing: (t) => t * (2 - t),
        },
      });
    }, 100);
  });

  fetch("./ne_110m_admin_0_countries.geojson")
    .then((r) => r.json())
    .then((data) => { landData = data; renderLayer(); })
    .catch((err) => console.warn("Could not load world map data:", err));

  fetch("./ne_110m_admin_1_states_provinces.geojson")
    .then((r) => r.json())
    .then((data) => { stateData = data; renderLayer(); })
    .catch((err) => console.warn("Could not load state map data:", err));
}

/* ------------------------------------------------------------------ */
/* Starfield                                                           */
/* ------------------------------------------------------------------ */

function initStarfield() {
  const canvas = document.getElementById("starfield");
  const wrapper = document.getElementById("globe-wrapper");
  const ctx = canvas.getContext("2d");
  let stars = [];
  const STAR_COUNT = 1200;

  function resize() {
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    canvas.width = w;
    canvas.height = h;
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() < 0.9 ? 1 : (Math.random() < 0.5 ? 2 : 3),
        opacity: Math.random() * 0.7 + 0.3,
      });
    }
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of stars) {
      ctx.globalAlpha = s.opacity;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  resize();
  window.addEventListener("resize", resize);

  // Tooltip "stay open while cursor is on the tip" support: track
  // mouseenter/mouseleave on the tooltip element itself. The deck.gl hover
  // handler reads `tooltipOver` and skips hiding the tip if the cursor
  // is currently over the tip.
  const tooltipEl = document.getElementById("tooltip");
  if (tooltipEl) {
    tooltipEl.addEventListener("mouseenter", () => { tooltipOver = true; });
    tooltipEl.addEventListener("mouseleave", () => {
      tooltipOver = false;
      // If the cursor leaves the tip and isn't back over a city dot, hide
      // it. The next deck.gl hover event will set this back to true if
      // a dot is under the cursor.
      tooltipEl.style.display = "none";
      pinnedCity = null;
      pinnedCityKey = null;
    });
  }
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

function initControls() {
  ["lang-primary", "lang-secondary", "lang-tertiary"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", () => {
        const primary = document.getElementById("lang-primary")?.value || "";
        if (primary) {
          currentLang = LANG_CODES[primary] || "en";
          localStorage.setItem("placeMatcherLang", currentLang);
          loadTranslationsFromDb();
        }
        selectedLanguages = [
          document.getElementById("lang-primary")?.value || "",
          document.getElementById("lang-secondary")?.value || "",
          document.getElementById("lang-tertiary")?.value || "",
        ];
        localStorage.setItem("placeMatcherLangs", JSON.stringify(selectedLanguages));
        requestUpdate();
      });
    }
  });

  document.getElementById("reset").addEventListener("click", () => {
    DIMENSIONS.forEach((_, i) => {
      const s = document.getElementById(`slider-${i}`);
      s.value = DEFAULT_PREFS[i];
      document.getElementById(`val-${i}`).textContent = DEFAULT_PREFS[i];
    });
    requestUpdate();
  });

  document.getElementById("random").addEventListener("click", () => {
    DIMENSIONS.forEach((_, i) => {
      const val = Math.random() * 10 - 5;
      const rounded = Math.round(val * 2) / 2;
      const s = document.getElementById(`slider-${i}`);
      s.value = rounded;
      document.getElementById(`val-${i}`).textContent = rounded;
    });
    requestUpdate();
  });

  document.getElementById("modal-confirm")?.addEventListener("click", handleLanguageConfirm);
}

/* ------------------------------------------------------------------ */
/* SpaceTimeDB Callback Setup                                          */
/* ------------------------------------------------------------------ */

function setupDbCallbacks() {
  if (!conn) return;

  // When score results change, refresh the globe
  conn.db.score_result.onInsert(() => {
    refreshCitiesFromDb();
    pendingUpdate = false;
    const loadingEl = document.getElementById("loading");
    if (loadingEl) loadingEl.style.display = "none";
  });

  conn.db.score_result.onUpdate(() => {
    refreshCitiesFromDb();
  });

  conn.db.score_result.onDelete(() => {
    refreshCitiesFromDb();
  });

  // When translations arrive, apply them
  conn.db.translation.onInsert(() => {
    loadTranslationsFromDb();
  });

  // Initial load
  refreshCitiesFromDb();
  loadTranslationsFromDb();
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

export function initApp(connection) {
  conn = connection;

  initStarfield();
  buildSliders();
  initControls();
  initLanguageFromStorage();
  initGlobe();
  setupDbCallbacks();

  // Trigger initial score with defaults
  setTimeout(() => {
    requestUpdate();
  }, 1000);
}
