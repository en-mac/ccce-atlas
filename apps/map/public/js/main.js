// Explore Corpus Christi - Main App
// Cesium token is loaded from js/config.js (gitignored)

// App state
const appState = {
    viewer: null,

    // Base Layer Management (mutually exclusive - only one active)
    currentBaseLayer: 'bing-aerial', // ID of currently active base layer
    baseLayerProvider: null, // Reference to active base imagery layer or tileset
    baseLayerType: 'imagery', // 'imagery' or '3dtiles'

    // Overlay Layers (can stack multiple)
    topoLayer: null,
    sectionalLayer: null,
    seamapLayer: null,
    railwayLayer: null,
    trailsLayer: null,
    gibsLayer: null, // NASA GIBS satellite imagery (base layer version)
    gibsOverlayLayer: null, // NASA GIBS science data (overlay version)
    depthMapLayer: null, // AI Depth Map (Depth Anything V2)
    depthBlendMode: 'normal', // Current blend mode for depth map
    owmLayer: null, // OpenWeatherMap
    rainViewerLayer: null,
    rainViewerTimestamp: null,
    rainViewerRefreshInterval: null,

    // Terrain
    flatTerrain: null,
    worldTerrain: null,

    // 3D Buildings
    osmBuildings: null,
    osmBuildingsEnabled: false,
    googleTileset: null,
    googleTilesEnabled: false,

    // Parcel System
    parcelDataSource: null,
    parcelGeoJSON: null,
    parcelTileLoader: null,

    // Selected parcels - unified state tracking both popup + highlight
    // Each entry contains: { instanceId, parcelId, popupId, popupElement, boundaryPrimitive, pointsPrimitive }
    selectedParcels: [],
    nextPopupId: 1, // Counter for generating unique popup IDs

    // POI & Tour
    layers: {}, // POI layers
    selectedEntity: null,
    tour: null,

    // Legacy/Archive
    wellLoader: null,
    waterTableLayer: null,

    // UI State
    sidebar: { collapsed: false },

    // Keyboard State (for Ctrl+Click multi-popup)
    keyboardState: {
        ctrlKey: false,
        metaKey: false
    }
};

// Corpus Christi coordinates for initial view
// Positioned to show both downtown and North Padre Island beaches
const CORPUS_CHRISTI = {
    longitude: -97.3200,
    latitude: 27.7200,
    height: 50000
};

/**
 * Show notification toast to user
 * @param {string} message - Message to display
 * @param {string} type - 'info', 'warning', 'error', or 'success'
 * @param {number} duration - How long to show (ms), default 5000
 */
function showNotification(message, type = 'info', duration = 5000) {
    const toast = document.getElementById('notification-toast');
    const messageEl = toast.querySelector('.notification-message');
    const iconEl = toast.querySelector('.notification-icon');

    // Set message
    messageEl.textContent = message;

    // Set icon based on type
    const icons = {
        info: 'ℹ️',
        warning: '⚠️',
        error: '❌',
        success: '✅'
    };
    iconEl.textContent = icons[type] || icons.info;

    // Remove old type classes and add new one
    toast.classList.remove('warning', 'error', 'success');
    if (type !== 'info') {
        toast.classList.add(type);
    }

    // Show toast
    toast.classList.remove('hidden');

    // Auto-hide after duration
    setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
}

// NASA GIBS Product Configurations
const GIBS_PRODUCTS = {
    // BASE LAYER PRODUCTS (Full-globe imagery)
    base: {
        'VIIRS_SNPP_CorrectedReflectance_TrueColor': {
            label: 'VIIRS True Color',
            layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
            format: 'image/jpeg',
            tileMatrixSetID: 'GoogleMapsCompatible_Level9',
            maximumLevel: 9
        },
        'MODIS_Terra_CorrectedReflectance_TrueColor': {
            label: 'MODIS Terra True Color',
            layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
            format: 'image/jpeg',
            tileMatrixSetID: 'GoogleMapsCompatible_Level9',
            maximumLevel: 9
        },
        'MODIS_Aqua_CorrectedReflectance_TrueColor': {
            label: 'MODIS Aqua True Color',
            layer: 'MODIS_Aqua_CorrectedReflectance_TrueColor',
            format: 'image/jpeg',
            tileMatrixSetID: 'GoogleMapsCompatible_Level9',
            maximumLevel: 9
        },
        'VIIRS_NOAA20_CorrectedReflectance_TrueColor': {
            label: 'VIIRS NOAA-20 True Color',
            layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
            format: 'image/jpeg',
            tileMatrixSetID: 'GoogleMapsCompatible_Level9',
            maximumLevel: 9
        },
        'VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1': {
            label: 'VIIRS False Color',
            layer: 'VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1',
            format: 'image/jpeg',
            tileMatrixSetID: 'GoogleMapsCompatible_Level9',
            maximumLevel: 9
        },
        'BlueMarble_NextGeneration': {
            label: 'Blue Marble',
            layer: 'BlueMarble_NextGeneration',
            format: 'image/jpeg',
            tileMatrixSetID: 'GoogleMapsCompatible_Level8',
            maximumLevel: 8
        },
        'VIIRS_Black_Marble': {
            label: 'Black Marble (Night Lights)',
            layer: 'VIIRS_Black_Marble',
            format: 'image/png',
            tileMatrixSetID: 'GoogleMapsCompatible_Level8',
            maximumLevel: 8,
            isStatic: true // Black Marble doesn't change daily
        }
    },
    // OVERLAY PRODUCTS (Science data)
    overlay: {
        'GHRSST_L4_MUR_Sea_Surface_Temperature': {
            label: 'Sea Surface Temperature',
            layer: 'GHRSST_L4_MUR_Sea_Surface_Temperature',
            format: 'image/png',
            tileMatrixSetID: 'GoogleMapsCompatible_Level7',
            maximumLevel: 7
        },
        'VIIRS_SNPP_Fires_375m_Day': {
            label: 'Fire/Thermal Hotspots',
            layer: 'VIIRS_SNPP_Fires_375m_Day',
            format: 'image/png',
            tileMatrixSetID: 'GoogleMapsCompatible_Level9',
            maximumLevel: 9
        },
        'MODIS_Terra_Snow_Cover': {
            label: 'Snow Cover',
            layer: 'MODIS_Terra_Snow_Cover',
            format: 'image/png',
            tileMatrixSetID: 'GoogleMapsCompatible_Level8',
            maximumLevel: 8
        },
        'MODIS_Aqua_Chlorophyll_A': {
            label: 'Chlorophyll Concentration',
            layer: 'MODIS_Aqua_Chlorophyll_A',
            format: 'image/png',
            tileMatrixSetID: 'GoogleMapsCompatible_Level7',
            maximumLevel: 7
        }
    }
};

/**
 * Initialize the Cesium viewer
 */
async function initViewer() {
    // Set Cesium ion access token
    Cesium.Ion.defaultAccessToken = CESIUM_ACCESS_TOKEN;

    // Create flat terrain provider (simple ellipsoid - no elevation)
    appState.flatTerrain = new Cesium.EllipsoidTerrainProvider();

    // Create the viewer with Bing Maps as base imagery
    appState.viewer = new Cesium.Viewer('cesiumContainer', {
        // Use Bing Maps Aerial (default Cesium base layer)
        baseLayerPicker: false,

        // Start with flat terrain (user can enable 3D terrain via toggle)
        terrainProvider: appState.flatTerrain,

        // UI configuration
        timeline: false,
        animation: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,

        // Use 3D scene mode for proper ground-level polygon rendering
        sceneMode: Cesium.SceneMode.SCENE3D,

        // Enable lighting for better visuals
        requestRenderMode: false,
        maximumRenderTimeChange: Infinity
    });

    // Store reference to Cesium's default base layer (Bing Maps Aerial with default key)
    // Cesium creates this automatically when baseLayerPicker is false
    appState.baseLayerProvider = appState.viewer.imageryLayers.get(0);
    appState.baseLayerType = 'imagery';
    appState.currentBaseLayer = 'bing-aerial';
    console.log('✅ Base layer initialized (Cesium default Bing Maps)');

    // Load world terrain asynchronously for 3D terrain toggle
    try {
        appState.worldTerrain = await Cesium.Terrain.fromWorldTerrain();
        console.log('✅ World terrain provider loaded and ready');
    } catch (error) {
        console.warn('Could not load world terrain:', error);
        appState.worldTerrain = appState.flatTerrain; // Fallback to flat terrain
    }

    // Load OSM Buildings (free global 3D buildings from OpenStreetMap)
    try {
        appState.osmBuildings = await Cesium.createOsmBuildingsAsync();
        appState.viewer.scene.primitives.add(appState.osmBuildings);
        appState.osmBuildings.show = false; // Start hidden (user can toggle on)
        console.log('✅ OSM Buildings tileset loaded (global 3D buildings from OpenStreetMap)');
    } catch (error) {
        console.warn('Could not load OSM Buildings:', error);
    }

    // Load Google Photorealistic 3D Tiles (premium - requires API key)
    // Only attempt if API key is configured
    if (GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY.length > 0) {
        try {
            appState.googleTileset = await Cesium.Cesium3DTileset.fromUrl(
                `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_MAPS_API_KEY}`,
                {
                    // Show attribution
                    credit: new Cesium.Credit('Google Maps Platform', false)
                }
            );
            appState.viewer.scene.primitives.add(appState.googleTileset);
            appState.googleTileset.show = false; // Start hidden (user can toggle on)
            console.log('✅ Google Photorealistic 3D Tiles loaded (premium quality)');
        } catch (error) {
            console.warn('Could not load Google 3D Tiles:', error);
            showNotification('Google 3D Tiles unavailable - check API key', 'warning');
        }
    } else {
        console.log('ℹ️  Google 3D Tiles disabled (no API key configured)');
    }

    // Parcels will be loaded on-demand when switching to Property mode
    // This prevents the initial 117K parcel load from freezing the browser

    // Set initial camera position over Corpus Christi
    appState.viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
            CORPUS_CHRISTI.longitude,
            CORPUS_CHRISTI.latitude,
            CORPUS_CHRISTI.height
        ),
        orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-90),
            roll: 0.0
        }
    });

    // Enable depth testing for better occlusion
    appState.viewer.scene.globe.depthTestAgainstTerrain = true;

    // OpenTopoMap is now a selectable BASE LAYER (use radio button in UI)
    // It's no longer an overlay that stacks on top

    // Add FAA VFR Sectional Charts as overlay
    // Official FAA tile service - updated on 56-day AIRAC cycle
    if (typeof FAA_VFR_SECTIONAL_SERVICE_ID !== 'undefined' && FAA_VFR_SECTIONAL_SERVICE_ID) {
        try {
            const sectionalProvider = new Cesium.UrlTemplateImageryProvider({
                url: `https://tiles.arcgis.com/tiles/${FAA_VFR_SECTIONAL_SERVICE_ID}/arcgis/rest/services/VFR_Sectional/MapServer/tile/{z}/{y}/{x}`,
                minimumLevel: 5,  // Don't request tiles at world-view zoom levels
                maximumLevel: 13,
                credit: 'VFR Sectional Charts: Federal Aviation Administration (FAA)'
            });

            appState.sectionalLayer = appState.viewer.imageryLayers.addImageryProvider(sectionalProvider);
            appState.sectionalLayer.alpha = 0.6; // Navigation overlays: 60% (allows base layer to show through)
            appState.sectionalLayer.show = false; // Start with sectional hidden
            console.log('✅ Aviation sectional chart layer added successfully');
        } catch (error) {
            console.warn('Could not load sectional chart layer:', error);
        }
    } else {
        console.log('ℹ️  Aviation sectional disabled (FAA_VFR_SECTIONAL_SERVICE_ID not configured)');
    }

    // Add OpenSeaMap as nautical chart overlay
    // Shows buoys, harbors, depth contours, shipping routes, etc.
    try {
        const seamapProvider = new Cesium.UrlTemplateImageryProvider({
            url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
            maximumLevel: 18,
            credit: 'Nautical Charts: © OpenSeaMap contributors'
        });

        appState.seamapLayer = appState.viewer.imageryLayers.addImageryProvider(seamapProvider);
        appState.seamapLayer.alpha = 1.0; // 100% opacity - no slider
        appState.seamapLayer.show = false; // Start with seamap hidden
        console.log('✅ OpenSeaMap nautical chart layer added successfully');
    } catch (error) {
        console.warn('Could not load OpenSeaMap layer:', error);
    }

    // Add OpenRailwayMap as railway infrastructure overlay
    // Shows rail tracks, stations, signals, switches, electrification, etc.
    try {
        const railwayProvider = new Cesium.UrlTemplateImageryProvider({
            url: 'https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
            subdomains: ['a', 'b', 'c'],
            maximumLevel: 18,
            credit: 'Railway Infrastructure: © OpenRailwayMap contributors'
        });

        appState.railwayLayer = appState.viewer.imageryLayers.addImageryProvider(railwayProvider);
        appState.railwayLayer.alpha = 1.0; // 100% opacity - no slider
        appState.railwayLayer.show = false; // Start with railway hidden
        console.log('✅ OpenRailwayMap layer added successfully');
    } catch (error) {
        console.warn('Could not load OpenRailwayMap layer:', error);
    }

    // Add Waymarked Trails as hiking/cycling/skiing route overlay
    // Shows marked trails with route numbers, difficulty, and trail types
    try {
        const trailsProvider = new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
            maximumLevel: 18,
            credit: 'Trail Routes: © Waymarked Trails, © OpenStreetMap contributors'
        });

        appState.trailsLayer = appState.viewer.imageryLayers.addImageryProvider(trailsProvider);
        appState.trailsLayer.alpha = 1.0; // 100% opacity - no slider
        appState.trailsLayer.show = false; // Start with trails hidden
        console.log('✅ Waymarked Trails layer added successfully');
    } catch (error) {
        console.warn('Could not load Waymarked Trails layer:', error);
    }

    // Add AI Depth Map overlay (Depth Anything V2)
    // Shows AI-generated depth estimation for Nueces County
    // Dark pixels = closer/higher (buildings), Light pixels = farther/lower (ground, water)
    if (typeof DEPTH_TILES_BASE_URL !== 'undefined' && DEPTH_TILES_BASE_URL) {
        try {
            const depthMapProvider = new Cesium.UrlTemplateImageryProvider({
                url: `${DEPTH_TILES_BASE_URL.replace(/\/$/, '')}/tiles/depth/15/{x}/{y}.png`,
                minimumLevel: 15, // Fixed zoom level - tiles only exist at level 15
                maximumLevel: 15, // Fixed zoom level - tiles only exist at level 15
                credit: 'AI Depth Map: Depth Anything V2',

                // Limit tile requests to Nueces County (prevents excessive 404s)
                // Coverage: Nueces County, TX (~2,100 km²)
                rectangle: Cesium.Rectangle.fromDegrees(
                    -97.9, // west
                    27.5,  // south
                    -97.0, // east
                    28.0   // north
                ),

                // Handle transparency and missing tiles gracefully
                hasAlphaChannel: true,
                errorEvent: new Cesium.Event()
            });

            // Handle tile load errors gracefully (404s expected at boundaries)
            depthMapProvider.errorEvent.addEventListener((error) => {
                console.debug('Depth tile not found (expected at boundaries):', error);
            });

            appState.depthMapLayer = appState.viewer.imageryLayers.addImageryProvider(depthMapProvider);
            appState.depthMapLayer.alpha = 0.6; // 60% opacity default
            appState.depthMapLayer.show = false; // Start hidden
            console.log('✅ AI Depth Map layer added successfully (Nueces County)');
        } catch (error) {
            console.warn('Could not load AI Depth Map layer:', error);
            showNotification('AI Depth Map layer unavailable - make sure ai-tiles tile server is running on port 8002', 'warning');
        }
    } else {
        console.log('ℹ️  AI Depth Map disabled (DEPTH_TILES_BASE_URL not configured)');
    }

    // NASA GIBS True Color imagery is now a selectable BASE LAYER (use radio button in UI)
    // A separate GIBS OVERLAY for science data (SST, fires, etc.) will be added later

    // Add OpenWeatherMap precipitation layer
    // NOTE: Free API keys may have limitations or expire
    // Shows rain, snow, and precipitation intensity from weather models
    if (typeof OWM_API_KEY !== 'undefined' && OWM_API_KEY) {
    try {
        const owmProvider = new Cesium.UrlTemplateImageryProvider({
            url: `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_API_KEY}`,
            maximumLevel: 15,
            credit: 'Weather Data: © OpenWeatherMap',
            errorEvent: new Cesium.Event()
        });

        // Handle tile load errors (API key issues)
        owmProvider.errorEvent.addEventListener((error) => {
            if (error && (error.statusCode === 401 || error.statusCode === 403)) {
                showNotification(
                    'Weather Model unavailable: API key may need renewal. See console for details.',
                    'warning',
                    6000
                );
            }
        });

        appState.owmLayer = appState.viewer.imageryLayers.addImageryProvider(owmProvider);
        appState.owmLayer.alpha = 1.0; // 100% opacity - no slider
        appState.owmLayer.show = false; // Start hidden
        console.log('✅ OpenWeatherMap precipitation layer initialized');
    } catch (error) {
        console.warn('Could not load OpenWeatherMap layer:', error);
        showNotification('Weather Model layer unavailable', 'warning');
    }
    } else {
        console.log('ℹ️  Weather Model disabled (OWM_API_KEY not configured)');
    }

    // Add RainViewer real-time radar layer
    // NOTE: RainViewer tiles have CORS restrictions on localhost
    // Layer will work in production but may show 403 errors in development
    appState.rainViewerTimestamp = null;
    appState.rainViewerRefreshInterval = null;
    appState.rainViewerCorsWarningShown = false;

    async function updateRainViewerLayer() {
        try {
            // Fetch latest radar timestamps (this API call works)
            const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
            const data = await response.json();

            if (data && data.radar && data.radar.past && data.radar.past.length > 0) {
                // Get most recent radar frame
                const latestRadar = data.radar.past[data.radar.past.length - 1];
                const timestamp = latestRadar.time;
                // RainViewer requires the opaque `path` token in the URL.
                // The numeric-timestamp URL format (/v2/radar/{time}/...) now
                // returns HTTP 410 Gone — only the `path` field works.
                const radarPath = latestRadar.path;
                const tileHost = data.host || 'https://tilecache.rainviewer.com';

                // Only rebuild the layer if the frame changed
                if (timestamp !== appState.rainViewerTimestamp) {
                    appState.rainViewerTimestamp = timestamp;

                    // Remove old layer if it exists
                    if (appState.rainViewerLayer) {
                        appState.viewer.imageryLayers.remove(appState.rainViewerLayer);
                    }

                    // Create new layer with latest frame.
                    // NOTE: Tile loading may fail on localhost due to CORS.
                    const rainViewerProvider = new Cesium.UrlTemplateImageryProvider({
                        url: `${tileHost}${radarPath}/256/{z}/{x}/{y}/2/1_1.png`,
                        maximumLevel: 15,
                        credit: 'Radar Data: © RainViewer',
                        errorEvent: new Cesium.Event() // Suppress Cesium error popups
                    });

                    // Suppress tile load errors (CORS issue on localhost)
                    rainViewerProvider.errorEvent.addEventListener((error) => {
                        if (!appState.rainViewerCorsWarningShown && error && error.statusCode === 0) {
                            appState.rainViewerCorsWarningShown = true;
                            showNotification(
                                'Live Radar requires production deployment. Tile loading blocked by CORS on localhost.',
                                'warning',
                                7000
                            );
                        }
                    });

                    appState.rainViewerLayer = appState.viewer.imageryLayers.addImageryProvider(rainViewerProvider);
                    appState.rainViewerLayer.alpha = 1.0; // 100% opacity - no slider
                    appState.rainViewerLayer.show = false;
                    console.log(`✅ RainViewer radar layer initialized (will work in production)`);
                }
            }
        } catch (error) {
            console.warn('Could not load RainViewer API:', error);
            showNotification('Live Radar temporarily unavailable', 'warning');
        }
    }

    // Initial load
    updateRainViewerLayer();

    // Auto-refresh every 10 minutes (600000ms)
    appState.rainViewerRefreshInterval = setInterval(updateRainViewerLayer, 600000);

    // Store reference to Bing base layer (default)
    appState.baseLayerProvider = appState.viewer.imageryLayers.get(0);
    appState.currentBaseLayer = 'bing-aerial';
    appState.baseLayerType = 'imagery';
}

/**
 * Enter GIBS isolated mode - hide all UI elements except GIBS controls
 */
function enterGIBSMode() {
    console.log('🛰️  Entering GIBS isolated mode');

    // Hide UI sections
    const togglesSection = document.getElementById('toggles-section');

    if (togglesSection) togglesSection.style.display = 'none';

    // Hide all POI data sources
    for (const layerName in appState.layers) {
        if (appState.layers[layerName]) {
            appState.layers[layerName].show = false;
        }
    }

    // Hide all overlay layers (except GIBS Science which is complementary satellite data)
    if (appState.sectionalLayer) appState.sectionalLayer.show = false;
    if (appState.seamapLayer) appState.seamapLayer.show = false;
    if (appState.railwayLayer) appState.railwayLayer.show = false;
    if (appState.trailsLayer) appState.trailsLayer.show = false;
    if (appState.depthMapLayer) appState.depthMapLayer.show = false;
    if (appState.owmLayer) appState.owmLayer.show = false;
    if (appState.rainViewerLayer) appState.rainViewerLayer.show = false;
    // Keep GIBS Science overlay available (SST, fires, snow, etc. - complementary science data)

    // Hide parcels
    if (appState.parcelDataSource) {
        appState.parcelDataSource.show = false;
    }

    // Stop run club tour if running
    if (appState.runClubTour && appState.runClubTour.isRunning) {
        appState.runClubTour.stop();
    }

    // Force flat terrain
    if (appState.viewer.terrainProvider !== appState.flatTerrain) {
        appState.viewer.terrainProvider = appState.flatTerrain;
        // Uncheck the terrain toggle
        const terrainToggle = document.getElementById('terrain-toggle');
        if (terrainToggle) terrainToggle.checked = false;
    }
}

/**
 * Exit GIBS isolated mode - restore all UI elements and their previous states
 */
function exitGIBSMode() {
    console.log('🗺️  Exiting GIBS isolated mode');

    // Show UI sections
    const togglesSection = document.getElementById('toggles-section');

    if (togglesSection) togglesSection.style.display = '';

    // Restore POI data sources (show all by default, user can filter)
    for (const layerName in appState.layers) {
        if (appState.layers[layerName]) {
            appState.layers[layerName].show = true;
        }
    }

    // Restore overlay layers based on their checkbox states
    const sectionalToggle = document.getElementById('sectional-toggle');
    if (sectionalToggle && sectionalToggle.checked && appState.sectionalLayer) {
        appState.sectionalLayer.show = true;
    }

    const seamapToggle = document.getElementById('seamap-toggle');
    if (seamapToggle && seamapToggle.checked && appState.seamapLayer) {
        appState.seamapLayer.show = true;
    }

    const railwayToggle = document.getElementById('railway-toggle');
    if (railwayToggle && railwayToggle.checked && appState.railwayLayer) {
        appState.railwayLayer.show = true;
    }

    const trailsToggle = document.getElementById('trails-toggle');
    if (trailsToggle && trailsToggle.checked && appState.trailsLayer) {
        appState.trailsLayer.show = true;
    }

    // Weather & Radar (consolidated toggle)
    const weatherToggle = document.getElementById('weather-toggle');
    if (weatherToggle && weatherToggle.checked) {
        if (appState.owmLayer) appState.owmLayer.show = true;
        if (appState.rainViewerLayer) appState.rainViewerLayer.show = true;
    }

    const gibsOverlayToggle = document.getElementById('gibs-overlay-toggle');
    if (gibsOverlayToggle && gibsOverlayToggle.checked && appState.gibsOverlayLayer) {
        appState.gibsOverlayLayer.show = true;
    }

    const parcelsToggle = document.getElementById('parcels-toggle');
    if (parcelsToggle && parcelsToggle.checked && appState.parcelDataSource) {
        appState.parcelDataSource.show = true;
    }

    // Restore terrain based on toggle state
    const terrainToggle = document.getElementById('terrain-toggle');
    if (terrainToggle && terrainToggle.checked) {
        appState.viewer.terrainProvider = appState.worldTerrain;
    }
}

/**
 * Switch between base layers (mutually exclusive)
 *
 * Manages the transition between different base map layers (satellite imagery,
 * topographic maps, NASA satellite data). Only one base layer can be active at a time,
 * but overlay layers (weather, navigation) are preserved during switches.
 *
 * Base Layer Types:
 * - 'bing-aerial': Bing Maps satellite imagery (Cesium Ion asset)
 * - 'opentopomap': OpenStreetMap-based topographic map with contours
 * - 'gibs-imagery': NASA GIBS satellite imagery with date selection
 *
 * Special Behavior:
 * - Switching to GIBS enters "isolated mode" (hides non-science overlays)
 * - Switching away from GIBS exits isolated mode (restores overlays)
 * - Layer ordering: Base layer always at index 0, overlays stack on top
 *
 * @async
 * @param {string} layerId - ID of the base layer to switch to ('bing-aerial', 'opentopomap', 'gibs-imagery')
 * @returns {Promise<void>}
 *
 * @example
 * // Switch to topographic map
 * await switchBaseLayer('opentopomap');
 *
 * // Switch to NASA satellite imagery (enters GIBS mode)
 * await switchBaseLayer('gibs-imagery');
 */
async function switchBaseLayer(layerId) {
    console.log(`Switching base layer to: ${layerId}`);

    // If already on this layer, do nothing
    if (appState.currentBaseLayer === layerId) {
        return;
    }

    // Exit GIBS mode if switching away from GIBS
    if (appState.currentBaseLayer === 'gibs-imagery' && layerId !== 'gibs-imagery') {
        exitGIBSMode();
    }

    // Remove current base layer
    if (appState.baseLayerType === 'imagery' && appState.baseLayerProvider) {
        appState.viewer.imageryLayers.remove(appState.baseLayerProvider);
        appState.baseLayerProvider = null;
    } else if (appState.baseLayerType === '3dtiles' && appState.baseLayerProvider) {
        appState.viewer.scene.primitives.remove(appState.baseLayerProvider);
        appState.baseLayerProvider = null;
    }

    // Add new base layer
    try {
        switch (layerId) {
            case 'bing-aerial':
                // Bing Maps Aerial (Cesium default with built-in key)
                const bingProvider = await Cesium.IonImageryProvider.fromAssetId(2);
                appState.baseLayerProvider = appState.viewer.imageryLayers.addImageryProvider(bingProvider, 0);
                appState.baseLayerType = 'imagery';
                console.log('✅ Switched to Bing Maps Aerial');
                break;

            case 'google-satellite':
                // Google Maps 2D Satellite (15cm resolution).
                // Requires Cesium >= 1.134 (Google2DImageryProvider shipped in 1.134, Oct 2025).
                // The generic IonImageryProvider does not handle externalType GOOGLE_2D_MAPS.
                // Note: fromIonAssetId takes an options object, not a positional assetId.
                const googleProvider = await Cesium.Google2DImageryProvider.fromIonAssetId({
                    assetId: '3830183',
                    mapType: 'satellite',
                });
                appState.baseLayerProvider = appState.viewer.imageryLayers.addImageryProvider(googleProvider, 0);
                appState.baseLayerType = 'imagery';
                console.log('✅ Switched to Google Satellite');
                break;

            case 'opentopomap':
                // OpenTopoMap
                const topoProvider = new Cesium.UrlTemplateImageryProvider({
                    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
                    subdomains: ['a', 'b', 'c'],
                    maximumLevel: 17,
                    credit: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap'
                });
                appState.baseLayerProvider = appState.viewer.imageryLayers.addImageryProvider(topoProvider, 0);
                appState.baseLayerType = 'imagery';
                console.log('✅ Switched to OpenTopoMap');
                break;

            case 'gibs-imagery':
                // NASA GIBS Imagery - use current product and date from UI
                const productId = document.getElementById('gibs-base-product').value;
                const date = document.getElementById('gibs-base-date').value;
                const product = GIBS_PRODUCTS.base[productId];
                const fileExt = product.format === 'image/jpeg' ? 'jpg' : 'png';

                // Black Marble is static, others are date-based
                const gibsUrl = product.isStatic
                    ? `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${product.layer}/default/${product.tileMatrixSetID}/{z}/{y}/{x}.${fileExt}`
                    : `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${product.layer}/default/${date}/${product.tileMatrixSetID}/{z}/{y}/{x}.${fileExt}`;

                const gibsProvider = new Cesium.UrlTemplateImageryProvider({
                    url: gibsUrl,
                    maximumLevel: product.maximumLevel,
                    credit: 'NASA EOSDIS Global Imagery Browse Services (GIBS)'
                });
                appState.baseLayerProvider = appState.viewer.imageryLayers.addImageryProvider(gibsProvider, 0);
                appState.baseLayerType = 'imagery';
                console.log('✅ Switched to NASA GIBS Imagery');

                // Enter GIBS isolated mode
                enterGIBSMode();
                break;

            default:
                console.warn(`Unknown base layer: ${layerId}`);
                return;
        }

        appState.currentBaseLayer = layerId;
    } catch (error) {
        console.error(`Error switching to base layer ${layerId}:`, error);
    }
}

/**
 * Update GIBS base layer with selected product and date
 */
function updateGIBSBaseLayer(productId, date) {
    console.log(`Updating GIBS base layer: ${productId} for date ${date}`);

    // Get product configuration
    const product = GIBS_PRODUCTS.base[productId];
    if (!product) {
        console.error(`Unknown GIBS product: ${productId}`);
        return;
    }

    // Remove current GIBS layer if it exists
    if (appState.baseLayerProvider && appState.baseLayerType === 'imagery') {
        appState.viewer.imageryLayers.remove(appState.baseLayerProvider);
        appState.baseLayerProvider = null;
    }

    try {
        // Format date for GIBS (YYYY-MM-DD)
        const formattedDate = date; // Already in correct format from date picker
        const fileExtension = product.format === 'image/jpeg' ? 'jpg' : 'png';

        // Black Marble is static, others are date-based
        const gibsUrl = product.isStatic
            ? `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${product.layer}/default/${product.tileMatrixSetID}/{z}/{y}/{x}.${fileExtension}`
            : `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${product.layer}/default/${formattedDate}/${product.tileMatrixSetID}/{z}/{y}/{x}.${fileExtension}`;

        // Use UrlTemplateImageryProvider with GIBS REST API URL pattern
        const gibsProvider = new Cesium.UrlTemplateImageryProvider({
            url: gibsUrl,
            maximumLevel: product.maximumLevel,
            credit: 'NASA EOSDIS Global Imagery Browse Services (GIBS)'
        });

        // Add to viewer at base layer position (index 0)
        appState.baseLayerProvider = appState.viewer.imageryLayers.addImageryProvider(gibsProvider, 0);
        appState.baseLayerType = 'imagery';

        console.log(`✅ Updated GIBS base layer to ${product.label} (${formattedDate})`);
    } catch (error) {
        console.error('Error updating GIBS base layer:', error);
    }
}

/**
 * Update GIBS overlay with selected science product and date
 */
function updateGIBSOverlay(productId, date) {
    console.log(`Updating GIBS overlay: ${productId} for date ${date}`);

    // Get product configuration
    const product = GIBS_PRODUCTS.overlay[productId];
    if (!product) {
        console.error(`Unknown GIBS overlay product: ${productId}`);
        return;
    }

    // Remove current GIBS overlay if it exists
    if (appState.gibsOverlayLayer) {
        appState.viewer.imageryLayers.remove(appState.gibsOverlayLayer);
        appState.gibsOverlayLayer = null;
    }

    try {
        // Format date for GIBS (YYYY-MM-DD)
        const formattedDate = date; // Already in correct format from date picker
        const fileExtension = product.format === 'image/jpeg' ? 'jpg' : 'png';

        // Use UrlTemplateImageryProvider with GIBS REST API URL pattern
        const gibsProvider = new Cesium.UrlTemplateImageryProvider({
            url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${product.layer}/default/${formattedDate}/${product.tileMatrixSetID}/{z}/{y}/{x}.${fileExtension}`,
            maximumLevel: product.maximumLevel,
            credit: 'NASA EOSDIS Global Imagery Browse Services (GIBS)'
        });

        // Get current opacity from slider
        const opacity = parseInt(document.getElementById('gibs-overlay-opacity').value);

        // Add to viewer as an overlay (not at index 0)
        appState.gibsOverlayLayer = appState.viewer.imageryLayers.addImageryProvider(gibsProvider);
        appState.gibsOverlayLayer.alpha = opacity / 100;

        console.log(`✅ Updated GIBS overlay to ${product.label} (${formattedDate})`);
    } catch (error) {
        console.error('Error updating GIBS overlay:', error);
    }
}

/**
 * Initialize data sources and UI after viewer is ready
 */
async function initDataSources() {
    // Handle entity selection (marker clicks)
    appState.viewer.selectedEntityChanged.addEventListener((entity) => {
        if (entity && entity.properties) {
            // This is a POI marker
            showInfoPanel(entity);
            // Don't fly to entity - just show the info panel
        }
    });

    // Handle primitive clicks (for parcels and wells using Primitives API)
    const handler = new Cesium.ScreenSpaceEventHandler(appState.viewer.scene.canvas);
    handler.setInputAction((click) => {
        const pickedObject = appState.viewer.scene.pick(click.position);

        // DEBUG: trace click pipeline
        console.log('[CLICK] pickedObject:', pickedObject);
        console.log('[CLICK] parcelTileLoader:', appState.parcelTileLoader);
        console.log('[CLICK] parcelMetadata size:', appState.parcelTileLoader?.parcelMetadata?.size);

        if (Cesium.defined(pickedObject) && pickedObject.primitive) {
            console.log('[CLICK] picked id:', pickedObject.id, 'primitive type:', pickedObject.primitive?.constructor?.name);

            // Healthcare provider point? (Phase-1 Nueces layer)
            if (appState.healthcareLayer) {
                const props = appState.healthcareLayer.pickPoint(pickedObject);
                if (props && typeof showHealthcareCard === 'function') {
                    showHealthcareCard(props);
                    return;
                }
            }

            // Check if this is a well point first
            if (appState.wellLoader) {
                const wellData = appState.wellLoader.getWellAtPosition(click.position);
                if (wellData) {
                    const metadata = appState.wellLoader.selectWell(wellData.primitive);
                    if (metadata) {
                        showWellInfo(metadata);
                        return; // Don't check for parcels
                    }
                }
            }

            // Check if this is a parcel primitive
            if (appState.parcelTileLoader) {
                const parcelData = appState.parcelTileLoader.pickParcel(pickedObject);
                console.log('[CLICK] pickParcel result:', parcelData);
                if (parcelData) {
                    // Get the world position of the click for elevation sampling
                    const ray = appState.viewer.camera.getPickRay(click.position);
                    const position = appState.viewer.scene.globe.pick(ray, appState.viewer.scene);

                    // Pass instanceId (pickedObject.id) to the function
                    // Note: Highlighting is now done inside showParcelInfoFromPrimitive
                    showParcelInfoFromPrimitive(parcelData, position, pickedObject.id);
                    return;
                }
            }
        }

        // If clicked on the globe (no primitive), query water table at that point
        const ray = appState.viewer.camera.getPickRay(click.position);
        const position = appState.viewer.scene.globe.pick(ray, appState.viewer.scene);

        // Position click handling removed (water table feature archived)
        // Click handling for parcels is done through parcel primitive picking above
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Handle mouse move for well hover effects
    handler.setInputAction((movement) => {
        if (appState.wellLoader) {
            const wellData = appState.wellLoader.getWellAtPosition(movement.endPosition);
            if (wellData) {
                appState.wellLoader.highlightWell(wellData.primitive);
                appState.viewer.canvas.style.cursor = 'pointer';
            } else {
                appState.wellLoader.highlightWell(null);
                appState.viewer.canvas.style.cursor = 'default';
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    return appState.viewer;
}

// flyToEntity function moved to layers.js to be available earlier in load order

/**
 * Initialize parcel tile loading system
 */
async function initializeParcelTiles() {
    try {
        console.log('🔧 Initializing parcel tile system...');
        const checkbox = document.getElementById('parcels-toggle');
        checkbox.disabled = true;

        // Create tile loader
        appState.parcelTileLoader = new ParcelTileLoader(appState.viewer);

        // Initialize (download and index data)
        await appState.parcelTileLoader.initialize();

        checkbox.disabled = false;
        checkbox.checked = true;

        // Reconcile: enables rendering iff zoom is currently sufficient,
        // otherwise leaves the checkbox checked and applies the "pending zoom"
        // visual cue (and shows the toast).
        appState.parcelTileLoader.reconcile();

        console.log('✅ Parcel tiles ready - zoom in to see parcels');
    } catch (error) {
        console.error('Failed to initialize tiles:', error);
        const checkbox = document.getElementById('parcels-toggle');
        checkbox.disabled = false;
        checkbox.checked = false;
    }
}


/**
 * Create cluster icon canvas
 */
function createClusterIcon(count) {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');

    // Draw circle
    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(20, 20, 18, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    return canvas;
}

/**
 * Update loading UI in Property sidebar
 */
function updateParcelLoadingUI(loading, error = false, progress = 0) {
    const toggle = document.getElementById('parcels-toggle');
    const label = document.querySelector('.toggle-label');

    if (loading) {
        toggle.disabled = true;
        if (progress > 0) {
            label.textContent = `Loading parcels... ${progress}%`;
        } else {
            label.textContent = 'Loading parcels...';
        }
    } else if (error) {
        toggle.disabled = true;
        label.textContent = 'Error loading parcels';
    } else {
        toggle.disabled = false;
        const count = appState.layers.parcels?.count || 117930;
        label.textContent = `Show Parcels (${(count / 1000).toFixed(0)}K)`;
    }
}

/**
 * Add camera height filtering for performance
 * Only show parcels when zoomed in close
 */
function addCameraHeightFilter() {
    appState.viewer.camera.changed.addEventListener(() => {
        if (!appState.parcelDataSource || appState.currentMode !== 'property') return;

        const cameraHeight = appState.viewer.camera.positionCartographic.height;
        const parcelsToggle = document.getElementById('parcels-toggle');

        // Show parcels when zoomed in (< 15km) AND toggle is on
        // Clustering handles the rest - zoomed out shows clusters, zoomed in shows individual parcels
        const shouldShow = cameraHeight < 15000 && parcelsToggle.checked;

        if (appState.parcelDataSource.show !== shouldShow) {
            appState.parcelDataSource.show = shouldShow;
            if (!shouldShow && cameraHeight >= 15000) {
                console.log('ℹ️  Parcels hidden - zoom in below 15km to see them');
            } else if (shouldShow) {
                console.log('✅ Parcels visible');
            }
        }
    });
}

/**
 * Show info panel with parcel property details
 * Note: Parcels are now entities, so this works with selectedEntityChanged
 */
function showParcelInfo(entity) {
    const panel = document.getElementById('info-panel');
    const content = document.getElementById('info-content');

    // Check if this is a parcel entity (has TAXID property)
    const props = entity.properties;
    if (!props || !props.TAXID) return;

    // Extract property information from entity properties
    const taxId = props.TAXID?.getValue() || 'Unknown';
    const address = props.SITE_ADDR?.getValue() || 'Unknown Address';
    const zipCode = props.ZIP_CODE?.getValue() || '';
    const objectId = props.OBJECTID?.getValue() || '';

    // Build HTML for parcel info
    let html = `
        <h3>Property Parcel</h3>
        <span class="category-badge" style="background: #10b981; color: white;">
            🏘️ Property Information
        </span>
        <div class="parcel-details">
            <p class="address">📍 ${address}</p>
            ${zipCode ? `<p><strong>ZIP Code:</strong> ${zipCode}</p>` : ''}
            ${parcelId !== 'Unknown' ? `<p><strong>Parcel ID:</strong> ${parcelId}</p>` : ''}
        </div>
    `;

    content.innerHTML = html;
    panel.classList.remove('hidden');
}

/**
 * Sample elevation at a given position using USGS Elevation API
 * Returns orthometric height (above mean sea level), not ellipsoid height
 */
async function sampleElevation(position) {
    try {
        // Convert Cartesian3 position to lat/lon
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        const longitude = Cesium.Math.toDegrees(cartographic.longitude);
        const latitude = Cesium.Math.toDegrees(cartographic.latitude);

        // Query USGS Elevation Point Query Service
        // This returns orthometric height (mean sea level), not ellipsoid height
        const url = `https://epqs.nationalmap.gov/v1/json?x=${longitude}&y=${latitude}&units=Meters&includeDate=false`;

        const response = await fetch(url);
        if (!response.ok) {
            console.warn('Elevation API returned error:', response.status);
            return null;
        }

        const data = await response.json();

        if (data.value !== null && data.value !== undefined) {
            const heightMeters = parseFloat(data.value);
            const heightFeet = heightMeters * 3.28084; // Convert meters to feet

            return {
                meters: Math.round(heightMeters * 10) / 10,
                feet: Math.round(heightFeet)
            };
        }
    } catch (error) {
        console.warn('Could not sample elevation:', error);
    }
    return null;
}


/**
 * Find parcel data at a specific lat/lon point
 * Returns parcel properties if found, null otherwise
 */
function findParcelAtPoint(lon, lat) {
    if (!appState.parcelTileLoader || !appState.parcelTileLoader.isInitialized) {
        return null;
    }

    // Check all loaded tiles to see if any contain this point
    for (const [tileKey, tileData] of appState.parcelTileLoader.loadedTiles) {
        // Get all parcels in this tile
        for (const [instanceId, parcelData] of appState.parcelTileLoader.parcelMetadata) {
            if (instanceId.startsWith(`${tileKey}:`)) {
                // Simple point-in-polygon check using coordinates
                // This is a basic implementation - could be improved with proper polygon containment
                if (parcelData.coordinates && parcelData.coordinates.length > 0) {
                    const ring = parcelData.coordinates[0];
                    if (isPointInPolygon(lon, lat, ring)) {
                        return parcelData;
                    }
                }
            }
        }
    }
    return null;
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 *
 * This implements the ray casting (even-odd rule) algorithm for point-in-polygon testing.
 * It works by casting a horizontal ray from the test point to infinity and counting how
 * many times it crosses the polygon boundary. If the count is odd, the point is inside.
 *
 * Algorithm:
 * 1. Cast a horizontal ray from the point (x,y) to the right (+x direction)
 * 2. For each edge of the polygon, check if the ray intersects it
 * 3. Count intersections - odd = inside, even = outside
 *
 * Edge cases handled:
 * - Vertices: Only counts intersection once per vertex
 * - Horizontal edges: Handled by the (yi > y) !== (yj > y) condition
 *
 * Time complexity: O(n) where n is the number of polygon vertices
 * Space complexity: O(1)
 *
 * @param {number} x - X coordinate of the test point (longitude)
 * @param {number} y - Y coordinate of the test point (latitude)
 * @param {Array<Array<number>>} polygon - Array of [x, y] coordinate pairs defining the polygon
 * @returns {boolean} True if point is inside polygon, false otherwise
 *
 * @example
 * const polygon = [[0,0], [10,0], [10,10], [0,10], [0,0]]; // Square
 * isPointInPolygon(5, 5, polygon);   // true (center of square)
 * isPointInPolygon(15, 15, polygon); // false (outside square)
 * isPointInPolygon(0, 5, polygon);   // true (on edge, edge case)
 *
 * @see https://en.wikipedia.org/wiki/Point_in_polygon#Ray_casting_algorithm
 */
function isPointInPolygon(x, y, polygon) {
    let inside = false;

    // Iterate through each edge of the polygon
    // j is the previous vertex, i is the current vertex
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];

        // Check if the horizontal ray from (x,y) crosses this edge
        // Conditions:
        // 1. (yi > y) !== (yj > y): Edge crosses the horizontal line y=test_y
        // 2. x < ...: Ray intersection point is to the right of test point
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

        // Toggle inside/outside state for each intersection
        if (intersect) inside = !inside;
    }

    return inside;
}

/**
 * Find all POI entities within a parcel's boundaries
 *
 * Performs spatial analysis to determine which points of interest (restaurants, parks, etc.)
 * fall within the boundaries of a property parcel. Uses the point-in-polygon algorithm
 * to test each POI marker against the parcel's polygon.
 *
 * This enables enhanced parcel info panels that show "What's on this property?"
 *
 * @param {Array<Array<Array<number>>>} parcelCoordinates - Polygon coordinates in GeoJSON format:
 *                                                           [[[lon,lat], [lon,lat], ...]]
 *                                                           (array of rings, we use outer ring [0])
 * @returns {Array<Cesium.Entity>} Array of POI entities found within the parcel
 *
 * @example
 * const parcelCoords = [[[lon1,lat1], [lon2,lat2], [lon3,lat3], [lon4,lat4]]];
 * const poisInside = findPOIsInParcel(parcelCoords);
 * console.log(`Found ${poisInside.length} POIs on this parcel`);
 * poisInside.forEach(poi => console.log(poi.name));
 */
function findPOIsInParcel(parcelCoordinates) {
    if (!parcelCoordinates || parcelCoordinates.length === 0) {
        return [];
    }

    const poisFound = [];
    const ring = parcelCoordinates[0]; // Outer ring of polygon

    // Check all loaded POI layers
    for (const [categoryId, layer] of Object.entries(appState.layers)) {
        if (layer.dataSource && layer.dataSource.entities) {
            for (const entity of layer.dataSource.entities.values) {
                if (entity.position) {
                    const position = entity.position.getValue(Cesium.JulianDate.now());
                    const cartographic = Cesium.Cartographic.fromCartesian(position);
                    const lon = Cesium.Math.toDegrees(cartographic.longitude);
                    const lat = Cesium.Math.toDegrees(cartographic.latitude);

                    if (isPointInPolygon(lon, lat, ring)) {
                        poisFound.push(entity);
                    }
                }
            }
        }
    }

    return poisFound;
}

/**
 * Close a specific parcel selection (removes both popup and highlight)
 * @param {string} popupId - The popup ID to close
 */
function closeParcelSelection(popupId) {
    // Find selected parcel
    const index = appState.selectedParcels.findIndex(p => p.popupId === popupId);
    if (index === -1) return;

    const selection = appState.selectedParcels[index];

    // Remove popup from DOM
    const popupElement = document.getElementById(popupId);
    if (popupElement) popupElement.remove();

    // Remove highlight primitives from scene
    if (selection.boundaryPrimitive) {
        appState.viewer.scene.primitives.remove(selection.boundaryPrimitive);
    }
    if (selection.pointsPrimitive) {
        appState.viewer.scene.primitives.remove(selection.pointsPrimitive);
    }

    // Remove from array
    appState.selectedParcels.splice(index, 1);
    console.log(`✅ Closed parcel selection: ${popupId} (${appState.selectedParcels.length} remaining)`);
}

/**
 * Close all parcel selections (removes all popups and highlights)
 */
function closeAllParcelSelections() {
    // Close each selection (removes popup + highlight)
    for (const selection of appState.selectedParcels) {
        const popupElement = document.getElementById(selection.popupId);
        if (popupElement) popupElement.remove();

        if (selection.boundaryPrimitive) {
            appState.viewer.scene.primitives.remove(selection.boundaryPrimitive);
        }
        if (selection.pointsPrimitive) {
            appState.viewer.scene.primitives.remove(selection.pointsPrimitive);
        }
    }

    // Clear the array
    appState.selectedParcels = [];
    console.log('✅ All parcel selections closed');
}

/**
 * Create a new parcel info popup element
 * Returns the popup DOM element
 */
function createParcelPopup(popupId, properties, clickPosition) {
    // Create popup panel
    const panel = document.createElement('div');
    panel.id = popupId;
    panel.className = 'info-panel';

    // Extract property information
    const parcelId = properties.parcel_id || properties.TAXID || properties.simple_geo || 'Unknown';
    const address = properties.address || properties.situs_disp || properties.SITE_ADDR || 'Unknown Address';
    const zipCode = properties.zip_code || properties.addr_zip || properties.ZIP_CODE || '';
    const owner = properties.owner || properties.file_as_na || '';
    const appraisedValue = properties.appraised_value || properties.appraised_ || properties.market_value || properties.market || 0;
    const acreage = properties.land_acres || 0;
    const yearBuilt = properties.year_built || properties.yr_blt || '';
    const propType = properties.prop_type || properties.prop_type_ || '';
    const zoning = properties.zoning || '';

    // Build popup HTML
    let html = `
        <div class="info-panel-header">
            <span class="info-panel-title">Property: ${parcelId}</span>
            <div class="info-panel-buttons">
                <button class="panel-btn minimize-btn" title="Minimize">−</button>
                <button class="panel-btn close-btn" title="Close">&times;</button>
            </div>
        </div>
        <div class="info-content">
            <h3>Property Parcel</h3>
            <span class="category-badge" style="background: #10b981; color: white;">
                🏘️ Property Information
            </span>
            <div class="parcel-details">
                <p class="address">📍 ${address}</p>
                ${zipCode ? `<p><strong>ZIP Code:</strong> ${zipCode}</p>` : ''}
                ${parcelId !== 'Unknown' ? `<p><strong>Parcel ID:</strong> ${parcelId}</p>` : ''}

                ${owner || appraisedValue || acreage ? `
                    <div style="margin-top: 15px; padding: 12px; background: #f0fdf4; border-left: 3px solid #10b981; border-radius: 4px;">
                        <h4 style="margin: 0 0 8px 0; color: #166534;">📊 Property Details</h4>
                        ${owner ? `<p><strong>Owner:</strong> ${owner}</p>` : ''}
                        ${appraisedValue > 0 ? `<p><strong>Appraised Value:</strong> $${parseInt(appraisedValue).toLocaleString()}</p>` : ''}
                        ${acreage > 0 ? `<p><strong>Acreage:</strong> ${parseFloat(acreage).toFixed(2)} acres</p>` : ''}
                        ${appraisedValue > 0 && acreage > 0 ? `<p><strong>Value per Acre:</strong> $${parseInt(appraisedValue / acreage).toLocaleString()}/acre</p>` : ''}
                        ${yearBuilt ? `<p><strong>Year Built:</strong> ${yearBuilt}</p>` : ''}
                        ${zoning ? `<p><strong>Zoning:</strong> ${zoning}</p>` : ''}
                        ${propType ? `<p><strong>Type:</strong> ${propType}</p>` : ''}
                    </div>
                ` : ''}
                ${properties.water_depth_m ? `
                    <div style="margin-top: 15px; padding: 12px; background: #f0f9ff; border-left: 3px solid #0369a1; border-radius: 4px;">
                        <h4 style="margin: 0 0 8px 0; color: #0369a1;">🌊 Water Table Depth</h4>
                        <p style="font-size: 1.1em;"><strong>Depth to Water:</strong> ${properties.water_depth_m.toFixed(1)} meters (${(properties.water_depth_m * 3.28084).toFixed(1)} feet)</p>
                        <p style="font-size: 0.85em; color: #64748b; margin-top: 5px;">
                            <strong>Source:</strong> Fan et al. (2017) global water table model
                        </p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    // Find POIs within this parcel
    const poisInParcel = findPOIsInParcel(properties.coordinates);
    if (poisInParcel.length > 0) {
        let poiHtml = `
            <details style="margin-top: 15px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
                <summary style="cursor: pointer; font-weight: 600; color: #667eea; user-select: none;">
                    📍 POIs on this Property (${poisInParcel.length})
                </summary>
                <div style="margin-top: 10px;">
        `;

        for (const poi of poisInParcel) {
            const poiName = poi.name || poi.properties?.name?.getValue() || 'Unknown';
            const poiCategory = poi.category || 'unknown';
            const categoryConfig = CATEGORIES[poiCategory] || { name: 'Unknown', color: '#666', icon: '📍' };

            poiHtml += `
                <div style="padding: 8px 12px; margin-bottom: 8px; background: #f9fafb; border-left: 3px solid ${categoryConfig.color}; border-radius: 4px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 16px;">${categoryConfig.icon}</span>
                        <strong>${poiName}</strong>
                    </div>
                    <span style="font-size: 0.85em; color: #6b7280;">${categoryConfig.name}</span>
                </div>
            `;
        }

        poiHtml += `
                </div>
            </details>
        `;

        // Insert POI section before closing tag
        const contentEnd = html.lastIndexOf('</div>');
        html = html.slice(0, contentEnd) + poiHtml + html.slice(contentEnd);
    }

    panel.innerHTML = html;

    // Set up button event listeners
    const minimizeBtn = panel.querySelector('.minimize-btn');
    const closeBtn = panel.querySelector('.close-btn');

    minimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('minimized');

        if (panel.classList.contains('minimized')) {
            minimizeBtn.textContent = '□';
            minimizeBtn.title = 'Maximize';
        } else {
            minimizeBtn.textContent = '−';
            minimizeBtn.title = 'Minimize';
        }
    });

    closeBtn.addEventListener('click', () => closeParcelSelection(popupId));

    // Make popup draggable
    makePanelDraggable(panel);

    // Add to DOM
    document.getElementById('app').appendChild(panel);

    // Load elevation data asynchronously
    if (clickPosition) {
        sampleElevation(clickPosition).then(elevationData => {
            if (elevationData) {
                const parcelDetails = panel.querySelector('.parcel-details');
                if (parcelDetails) {
                    const elevationHtml = `
                        <div style="margin-top: 15px; padding: 12px; background: #eff6ff; border-left: 3px solid #3b82f6; border-radius: 4px;">
                            <h4 style="margin: 0 0 8px 0; color: #1e40af;">🏔️ Elevation</h4>
                            <p><strong>Ground Level:</strong> ${elevationData.feet} ft (${elevationData.meters} m)</p>
                        </div>
                    `;
                    const waterTable = parcelDetails.querySelector('div[style*="0369a1"]');
                    if (waterTable) {
                        waterTable.insertAdjacentHTML('beforebegin', elevationHtml);
                    } else {
                        parcelDetails.insertAdjacentHTML('beforeend', elevationHtml);
                    }
                }
            }
        }).catch(err => {
            console.warn('Failed to load elevation data:', err);
        });
    }

    return panel;
}

/**
 * Show info panel with parcel property details from primitive
 * Supports multi-selection - popups only close when user clicks X
 * @param {Object} properties - Parcel metadata properties
 * @param {Cesium.Cartesian3} clickPosition - 3D position of the click
 * @param {string} instanceId - Cesium instance ID (e.g., "14/3740/6870:0:0")
 */
async function showParcelInfoFromPrimitive(properties, clickPosition, instanceId) {
    const parcelId = properties.parcel_id || properties.TAXID || properties.simple_geo;

    // Check if Cmd (Mac) or Ctrl (Win/Linux) is held for multi-select
    const isMultiSelect = appState.keyboardState.metaKey || appState.keyboardState.ctrlKey;

    // If NOT multi-selecting, close all existing popups first (default behavior)
    if (!isMultiSelect && appState.selectedParcels.length > 0) {
        console.log('🔄 Single-click mode: closing existing popups');
        closeAllParcelSelections();
    }

    // Check if this parcel is already selected (prevent duplicates)
    const existingSelection = appState.selectedParcels.find(p => p.parcelId === parcelId);
    if (existingSelection) {
        console.log(`⚠️ Parcel ${parcelId} already selected - ignoring duplicate click`);
        showNotification('This property is already selected', 'info', 2000);
        return;
    }

    // Check if we've hit the 3-parcel limit (only matters in multi-select mode)
    if (appState.selectedParcels.length >= 3) {
        showNotification('Maximum 3 properties can be compared at once. Close a popup or use regular click to replace.', 'warning', 5000);
        return;
    }

    // Generate unique popup ID
    const popupId = `parcel-popup-${appState.nextPopupId++}`;

    // Create the popup
    const panel = createParcelPopup(popupId, properties, clickPosition);

    // Highlight the parcel boundary (returns primitives)
    const primitives = await appState.parcelTileLoader.highlightParcel(instanceId);

    // Track in unified selected parcels state
    appState.selectedParcels.push({
        instanceId: instanceId,
        parcelId: parcelId,
        popupId: popupId,
        popupElement: panel,
        boundaryPrimitive: primitives?.boundaryPrimitive || null,
        pointsPrimitive: primitives?.pointsPrimitive || null
    });

    console.log(`✅ Selected parcel: ${parcelId} (${appState.selectedParcels.length}/3 selected)`);
}

/**
 * Reset camera to initial Corpus Christi view
 */
function resetCamera() {
    appState.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
            CORPUS_CHRISTI.longitude,
            CORPUS_CHRISTI.latitude,
            CORPUS_CHRISTI.height
        ),
        orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-90),
            roll: 0.0
        },
        duration: 2.0
    });

    // Clear selection
    appState.viewer.selectedEntity = undefined;
    hideInfoPanel();
}

/**
 * Initialize the app
 */
async function init() {
    try {
        // Initialize Cesium viewer
        await initViewer();

        // Initialize data sources and click handlers
        await initDataSources();

        // Load all POI layers
        await loadAllLayers();

        // Load transit routes
        await loadTransitRoutes();

        // Load school districts
        await loadSchoolDistricts();

        // Load top property owners
        await loadTopOwners();
        console.log('✅ Top owners data loaded');

        // Initialize Run Club Tour
        appState.runClubTour = new RunClubTour(appState.viewer, appState.googleTileset);
        console.log('✅ Run Club Tour initialized');

        // Initialize UI
        initUI();
        initColorControls();
        initializeTopOwnersControls();
        console.log('✅ Top owners controls initialized');

        // Healthcare tab (Phase-1 Nueces provider layer, desktop only)
        if (typeof initHealthcareTab === 'function') {
            initHealthcareTab(appState.viewer);
            console.log('✅ Healthcare layer initialized');
        }

        // Set up event listeners
        setupEventListeners();

        // Initialize overlay visibility based on default base layer (bing-aerial)
        updateOverlayVisibility('bing-aerial');

        console.log('Explore Corpus Christi initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
        alert('Error loading the application. Please check your Cesium token and try again.');
    }
}


/**
 * Toggle sidebar collapse state
 */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const isCollapsed = sidebar.classList.contains('collapsed');

    sidebar.classList.toggle('collapsed');
    appState.sidebar.collapsed = !isCollapsed;
}

/**
 * Toggle parcel visibility
 */
function toggleParcels(visible) {
    const parcelLayer = appState.layers.parcels;
    if (parcelLayer && parcelLayer.dataSource) {
        parcelLayer.dataSource.show = visible;
    }
}

/**
 * Update depth map blend mode
 * Note: This is a simplified implementation using Cesium's nightAlpha/dayAlpha
 * properties to simulate blend effects. True CSS blend modes aren't directly
 * supported for individual imagery layers in Cesium's WebGL rendering.
 *
 * @param {string} blendMode - 'normal', 'multiply', 'overlay', or 'soft-light'
 */
function updateDepthBlendMode(blendMode) {
    if (!appState.depthMapLayer) {
        console.warn('Depth map layer not initialized');
        return;
    }

    // Store the current blend mode
    appState.depthBlendMode = blendMode;

    // Adjust layer properties based on blend mode
    // This is an approximation - true blend modes require custom shaders
    switch (blendMode) {
        case 'multiply':
            // Multiply effect: increase opacity and use darker rendering
            // This approximates the darkening effect of multiply blend
            appState.depthMapLayer.alpha = 0.8;
            appState.depthMapLayer.brightness = 0.7;
            console.log('Depth blend mode: multiply (approximated via brightness)');
            break;

        case 'overlay':
            // Overlay effect: high contrast
            appState.depthMapLayer.alpha = 0.7;
            appState.depthMapLayer.contrast = 1.3;
            appState.depthMapLayer.brightness = 1.0;
            console.log('Depth blend mode: overlay (approximated via contrast)');
            break;

        case 'soft-light':
            // Soft-light: subtle enhancement
            appState.depthMapLayer.alpha = 0.5;
            appState.depthMapLayer.brightness = 0.9;
            appState.depthMapLayer.contrast = 1.1;
            console.log('Depth blend mode: soft-light (approximated)');
            break;

        case 'normal':
        default:
            // Normal: reset to defaults
            appState.depthMapLayer.alpha = 0.6;
            appState.depthMapLayer.brightness = 1.0;
            appState.depthMapLayer.contrast = 1.0;
            console.log('Depth blend mode: normal');
            break;
    }

    // Update opacity slider to reflect the change
    const opacitySlider = document.getElementById('depth-map-opacity');
    const opacityValue = document.getElementById('depth-map-opacity-value');
    if (opacitySlider && opacityValue) {
        const newOpacity = Math.round(appState.depthMapLayer.alpha * 100);
        opacitySlider.value = newOpacity;
        opacityValue.textContent = `${newOpacity}%`;
    }
}

/**
 * Update overlay section visibility based on selected base layer
 *
 * NASA GIBS base layer has compatibility issues with certain overlays,
 * so we hide incompatible sections and show a notification to the user.
 *
 * @param {string} baseLayerValue - The value of the selected base layer radio button
 */
function updateOverlayVisibility(baseLayerValue) {
    const navigation = document.getElementById('overlay-navigation');
    const recreation = document.getElementById('overlay-recreation');
    const weather = document.getElementById('overlay-weather');
    const science = document.getElementById('overlay-science');

    if (baseLayerValue === 'gibs-imagery') {
        // NASA GIBS: Hide incompatible overlays, show science only
        if (navigation) navigation.style.display = 'none';
        if (recreation) recreation.style.display = 'none';
        if (weather) weather.style.display = 'none';
        if (science) science.style.display = 'block';

        // Disable any active incompatible overlays
        const sectional = document.getElementById('sectional-toggle');
        const seamap = document.getElementById('seamap-toggle');
        const railway = document.getElementById('railway-toggle');
        const trails = document.getElementById('trails-toggle');
        const weather = document.getElementById('weather-toggle');

        [sectional, seamap, railway, trails, weather].forEach(toggle => {
            if (toggle && toggle.checked) {
                toggle.checked = false;
                toggle.dispatchEvent(new Event('change'));
            }
        });

        // Show notification to user
        showNotification(
            'NASA GIBS mode: Some overlays are incompatible and have been hidden.',
            'info',
            5000
        );
    } else {
        // Bing Maps Aerial, Google Satellite, or OpenTopoMap: Show everything
        // (recreation stays hidden — see HTML comment on overlay-recreation)
        if (navigation) navigation.style.display = 'block';
        if (weather) weather.style.display = 'block';
        if (science) science.style.display = 'block';
    }
}

/**
 * Set up global event listeners
 */
function setupEventListeners() {
    // Reset camera button
    document.getElementById('reset-camera').addEventListener('click', resetCamera);

    // Property controls - reconcile render state from user intent + zoom.
    // The reconciler keeps the checkbox as the single source of truth for
    // intent, and decides whether to render based on intent + current zoom.
    document.getElementById('parcels-toggle').addEventListener('change', async (e) => {
        const checkbox = e.target;

        if (!appState.parcelTileLoader) {
            console.log('Initializing parcel tile loader...');
            checkbox.disabled = true;
            await initializeParcelTiles();
            checkbox.disabled = false;
        }

        appState.parcelTileLoader?.reconcile();
    });

    // School Districts controls
    document.getElementById('school-districts-toggle').addEventListener('change', (e) => {
        toggleSchoolDistricts(e.target.checked);
    });

    // 3D Buildings controls (OSM)
    document.getElementById('osm-buildings-toggle').addEventListener('change', (e) => {
        if (appState.osmBuildings) {
            appState.osmBuildings.show = e.target.checked;
            appState.osmBuildingsEnabled = e.target.checked;
            console.log(`OSM Buildings: ${e.target.checked ? 'enabled' : 'disabled'}`);
        } else {
            console.warn('OSM Buildings tileset not loaded');
            e.target.checked = false;
        }
    });

    // Base layer radio button handler
    document.querySelectorAll('input[name="base-layer"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                switchBaseLayer(e.target.value);

                // Show/hide GIBS settings panel
                const gibsSettings = document.getElementById('gibs-base-settings');
                if (e.target.value === 'gibs-imagery') {
                    gibsSettings.style.display = 'block';
                } else {
                    gibsSettings.style.display = 'none';
                }

                // Update overlay section visibility
                updateOverlayVisibility(e.target.value);
            }
        });
    });

    // Initialize GIBS date picker (GIBS has 2-3 day delay, so use 3 days ago)
    const gibsDatePicker = document.getElementById('gibs-base-date');
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);
    const gibsDate = threeDaysAgo.toISOString().split('T')[0];
    gibsDatePicker.value = gibsDate;
    gibsDatePicker.max = gibsDate; // Don't allow future dates (GIBS has delay)

    // GIBS base product change handler
    document.getElementById('gibs-base-product').addEventListener('change', (e) => {
        if (appState.currentBaseLayer === 'gibs-imagery') {
            const productId = e.target.value;
            const date = document.getElementById('gibs-base-date').value;
            updateGIBSBaseLayer(productId, date);
        }
    });

    // GIBS base date change handler
    document.getElementById('gibs-base-date').addEventListener('change', (e) => {
        if (appState.currentBaseLayer === 'gibs-imagery') {
            const productId = document.getElementById('gibs-base-product').value;
            const date = e.target.value;
            updateGIBSBaseLayer(productId, date);
        }
    });

    // Sectional chart toggle
    document.getElementById('sectional-toggle').addEventListener('change', (e) => {
        const sectionalOpacityControls = document.getElementById('sectional-opacity-controls');

        // Show/hide opacity controls based on checkbox state
        if (e.target.checked) {
            sectionalOpacityControls.style.display = 'block';
        } else {
            sectionalOpacityControls.style.display = 'none';
        }

        // Toggle sectional layer visibility
        if (appState.sectionalLayer) {
            appState.sectionalLayer.show = e.target.checked;
        }
    });

    // Sectional chart opacity control
    document.getElementById('sectional-opacity').addEventListener('input', (e) => {
        const opacity = parseInt(e.target.value);
        document.getElementById('sectional-opacity-value').textContent = `${opacity}%`;
        if (appState.sectionalLayer) {
            appState.sectionalLayer.alpha = opacity / 100;
        }
    });

    // OpenSeaMap toggle (no opacity control - fixed at 100%)
    document.getElementById('seamap-toggle').addEventListener('change', (e) => {
        if (appState.seamapLayer) {
            appState.seamapLayer.show = e.target.checked;
        }
    });

    // OpenRailwayMap toggle (no opacity control - fixed at 100%)
    document.getElementById('railway-toggle').addEventListener('change', (e) => {
        if (appState.railwayLayer) {
            appState.railwayLayer.show = e.target.checked;
        }
    });

    // Waymarked Trails toggle (no opacity control - fixed at 100%)
    document.getElementById('trails-toggle').addEventListener('change', (e) => {
        if (appState.trailsLayer) {
            appState.trailsLayer.show = e.target.checked;
        }
    });


    // Transit routes are now managed by transit.js
    // Individual route and stop toggles are dynamically created

    // NASA GIBS is now a base layer (handled by radio buttons above)
    // A future GIBS OVERLAY for science data will be added later

    // Consolidated Weather & Radar toggle
    document.getElementById('weather-toggle').addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        let hasAnyLayer = false;

        // Try to show OpenWeatherMap precipitation layer
        if (appState.owmLayer) {
            appState.owmLayer.show = isEnabled;
            hasAnyLayer = true;
        }

        // Try to show RainViewer radar layer
        if (appState.rainViewerLayer) {
            appState.rainViewerLayer.show = isEnabled;
            hasAnyLayer = true;
        }

        // If enabled but no layers available, show notification and uncheck
        if (isEnabled && !hasAnyLayer) {
            showNotification('Weather data temporarily unavailable', 'warning', 4000);
            e.target.checked = false;
            return;
        }

        // On enable, fly to a continental altitude so the user can see the
        // whole CONUS — weather systems span thousands of km, so anything
        // closer is too zoomed in to be useful as context.
        if (isEnabled && hasAnyLayer) {
            appState.viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(
                    -98.5,  // CONUS geographic center longitude (Kansas)
                    39.5,   // CONUS geographic center latitude
                    5000000 // ~5000km altitude — frames the entire continental US
                ),
                orientation: {
                    heading: Cesium.Math.toRadians(0),
                    pitch: Cesium.Math.toRadians(-90),
                    roll: 0.0
                },
                duration: 2.0
            });
        }
    });

    // GIBS overlay toggle
    document.getElementById('gibs-overlay-toggle').addEventListener('change', (e) => {
        const gibsOverlaySettings = document.getElementById('gibs-overlay-settings');

        // Show/hide settings panel based on checkbox state
        if (e.target.checked) {
            gibsOverlaySettings.style.display = 'block';
            // Initialize overlay with Sea Surface Temperature and date
            const productId = 'GHRSST_L4_MUR_Sea_Surface_Temperature';
            const date = document.getElementById('gibs-overlay-date').value;
            updateGIBSOverlay(productId, date);
        } else {
            gibsOverlaySettings.style.display = 'none';
            // Remove overlay layer
            if (appState.gibsOverlayLayer) {
                appState.viewer.imageryLayers.remove(appState.gibsOverlayLayer);
                appState.gibsOverlayLayer = null;
            }
        }
    });

    // Initialize GIBS overlay date picker (use same date as base layer)
    const gibsOverlayDatePicker = document.getElementById('gibs-overlay-date');
    gibsOverlayDatePicker.value = gibsDate; // Use same 3-days-ago date
    gibsOverlayDatePicker.max = gibsDate;

    // GIBS overlay date change handler
    document.getElementById('gibs-overlay-date').addEventListener('change', (e) => {
        if (appState.gibsOverlayLayer) {
            const productId = 'GHRSST_L4_MUR_Sea_Surface_Temperature';
            const date = e.target.value;
            updateGIBSOverlay(productId, date);
        }
    });

    // GIBS overlay opacity control
    document.getElementById('gibs-overlay-opacity').addEventListener('input', (e) => {
        const opacity = parseInt(e.target.value);
        document.getElementById('gibs-overlay-opacity-value').textContent = `${opacity}%`;
        if (appState.gibsOverlayLayer) {
            appState.gibsOverlayLayer.alpha = opacity / 100;
        }
    });

    // Close info panel button
    document.getElementById('close-panel').addEventListener('click', hideInfoPanel);

    // Run Club Route controls
    document.getElementById('run-club-quick').addEventListener('click', () => {
        appState.runClubTour.start('quick-tour');
    });

    document.getElementById('run-club-pause').addEventListener('click', () => {
        const btn = document.getElementById('run-club-pause');
        if (appState.runClubTour.isPaused) {
            appState.runClubTour.resume();
            btn.textContent = '⏸️ Pause';
        } else {
            appState.runClubTour.pause();
            btn.textContent = '▶️ Resume';
        }
    });

    document.getElementById('run-club-stop').addEventListener('click', () => {
        appState.runClubTour.stop();
    });
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Track Ctrl/Cmd key state for multi-popup comparison
// Cesium's ScreenSpaceEventHandler doesn't expose keyboard modifiers,
// so we track them separately with DOM event listeners
document.addEventListener('keydown', (e) => {
    if (e.key === 'Control') appState.keyboardState.ctrlKey = true;
    if (e.key === 'Meta') appState.keyboardState.metaKey = true;
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'Control') appState.keyboardState.ctrlKey = false;
    if (e.key === 'Meta') appState.keyboardState.metaKey = false;
});
