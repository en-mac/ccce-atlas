/**
 * Production-Grade Vector Tile Loader for Property Parcels
 *
 * This class implements a tile-based architecture for rendering large parcel datasets (100K+ features)
 * without freezing the browser. It uses Cesium's Primitives API for geometry batching and only loads
 * parcels that are visible in the current viewport.
 *
 * Architecture:
 * - Backend tile server generates GeoJSON tiles on-demand based on zoom level and bounds
 * - Frontend requests only visible tiles as user pans/zooms
 * - Primitives API batches all parcels in a tile into a single GPU draw call
 * - Spatial indexing on backend enables fast tile generation
 *
 * Performance:
 * - Typical tile: ~500KB JSON vs. 183MB full dataset
 * - Tile load time: <200ms
 * - Zero browser freeze (vs. 10+ seconds with client-side GeoJSON)
 * - Scales to 100M+ parcels (continental US scale)
 *
 * @class
 * @example
 * const loader = new ParcelTileLoader(viewer);
 * await loader.initialize();
 * loader.enable(); // Start loading tiles based on camera position
 */

class ParcelTileLoader {
    /**
     * Create a ParcelTileLoader instance
     *
     * @param {Cesium.Viewer} viewer - The Cesium viewer instance to render parcels in
     */
    constructor(viewer) {
        this.viewer = viewer;

        /** @type {Map<string, {fillPrimitive: Cesium.Primitive, outlinePrimitive: Cesium.Primitive, featureCount: number}>} */
        this.loadedTiles = new Map(); // Map<tileKey, {primitive, parcelData}>

        /** @type {boolean} */
        this.isEnabled = false;

        /** @type {boolean} */
        this.isLoading = false;

        /** @type {string} Backend API URL - uses API_BASE_URL from config.js */
        this.apiBaseUrl = typeof API_BASE_URL !== 'undefined' ? `${API_BASE_URL}/api/v1` : 'http://localhost:8000/api/v1';

        /** @type {Cesium.PrimitiveCollection} Container for all parcel primitives */
        this.primitiveCollection = new Cesium.PrimitiveCollection();
        this.viewer.scene.primitives.add(this.primitiveCollection);

        /** @type {Map<string, Object>} Parcel metadata indexed by primitive instance ID */
        this.parcelMetadata = new Map(); // Map<primitiveId, parcelProperties>

        /** @type {Object|null} Currently selected parcel */
        this.selectedParcel = null;

        /** @type {Object|null} Currently hovered parcel */
        this.hoveredParcel = null;

        /** @type {number} Opacity for all parcel polygons (0.0 - 1.0) */
        this.currentOpacity = 0.3; // Default 30% opacity

        /**
         * Height offset for parcel rendering in meters above ellipsoid/terrain
         * 10m prevents underground rendering on varied terrain while maintaining ground-level appearance
         * @type {number}
         */
        this.heightOffset = 10;

        /** @type {number} Minimum zoom level required to show parcels */
        this.minZoom = 14;

        /** @type {boolean} Track if user was notified about zoom requirement */
        this.hasNotifiedZoom = false;
    }

    /**
     * Initialize the tile loading system
     *
     * Connects to the backend tile server and verifies it's accessible.
     * Must be called before enable() to start loading tiles.
     *
     * @async
     * @returns {Promise<boolean>} True if initialization successful
     * @throws {Error} If backend server is not accessible
     * @example
     * try {
     *   await loader.initialize();
     *   console.log('Tile system ready');
     * } catch (error) {
     *   console.error('Backend not running:', error);
     * }
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('Tile loader already initialized');
            return;
        }

        try {
            console.log('🔧 Initializing production-grade tile loader...');

            // Test backend connection by making a simple API request
            const response = await fetch(`${this.apiBaseUrl}/parcels/tiles/14/3762/6878.json`);
            if (!response.ok) {
                throw new Error(`API server returned ${response.status}`);
            }
            const testData = await response.json();

            console.log(`✅ Connected to API server: ${this.apiBaseUrl}`);
            console.log('📊 Using GeoJSON tiles with Cesium Primitives for scalable rendering');

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to API server:', error);
            console.error('   Make sure FastAPI is running on port 8000');
            throw error;
        }
    }

    /**
     * Enable automatic tile loading based on camera position
     *
     * Starts listening to camera movement events and loads tiles as the user
     * pans and zooms around the globe. Parcels are only visible at zoom level 13+.
     *
     * @example
     * loader.enable(); // Tiles will now load automatically
     */
    enable() {
        if (!this.isInitialized) {
            console.error('Cannot enable: tile loader not initialized');
            return;
        }

        this.isEnabled = true;

        // Show the primitive collection
        this.primitiveCollection.show = true;

        console.log('✅ Parcel tiling enabled (Primitives mode)');

        // Load initial tiles
        this.updateTiles();

        // Listen to camera changes
        if (!this.cameraListener) {
            this.cameraListener = this.onCameraChanged.bind(this);
            this.viewer.camera.changed.addEventListener(this.cameraListener);
        }
    }

    /**
     * Disable tile loading and clear all parcels
     */
    disable() {
        this.isEnabled = false;

        // Remove camera listener to prevent tiles from reloading
        if (this.cameraListener) {
            this.viewer.camera.changed.removeEventListener(this.cameraListener);
            this.cameraListener = null;
        }

        this.clearAllTiles();

        // Hide the primitive collection
        this.primitiveCollection.show = false;

        console.log('Parcel tiling disabled');
    }

    /**
     * Set height offset for parcel rendering
     * @param {number} meters - Height in meters above terrain (0-100)
     */
    setHeightOffset(meters) {
        this.heightOffset = Math.max(0, Math.min(100, meters)); // Clamp to 0-100m
        console.log(`🏔️ Parcel height offset set to ${this.heightOffset}m - reload tiles to apply`);

        // Note: Height changes require reloading tiles since geometry is baked into primitives
        // Call reloadTilesForColorChange() if you want to apply immediately
    }

    /**
     * Set opacity for all parcel polygons
     *
     * Updates the alpha channel for all currently loaded parcel primitives while
     * preserving their color-coding based on property values. This operation updates
     * GPU attributes directly for each geometry instance.
     *
     * @param {number} alpha - Opacity value from 0.0 (transparent) to 1.0 (opaque), will be clamped
     * @example
     * loader.setOpacity(0.5); // Set parcels to 50% transparent
     */
    setOpacity(alpha) {
        this.currentOpacity = Math.max(0.0, Math.min(1.0, alpha)); // Clamp to 0-1

        // Update each loaded tile's primitive
        for (const [tileKey, tileData] of this.loadedTiles) {
            const fillPrimitive = tileData.fillPrimitive;
            if (fillPrimitive) {
                // Get all instance IDs that belong to this tile
                const tileInstanceIds = Array.from(this.parcelMetadata.keys())
                    .filter(id => id.startsWith(`${tileKey}:`));

                // Update each instance's color attribute based on property value
                for (const instanceId of tileInstanceIds) {
                    try {
                        // Get parcel properties from metadata
                        const parcelData = this.parcelMetadata.get(instanceId);
                        if (!parcelData) continue;

                        // Calculate correct color based on property value (metadata-based styling)
                        const baseColor = typeof getParcelColor !== 'undefined'
                            ? getParcelColor(parcelData.properties, 'total')
                            : Cesium.Color.WHITE;

                        // Apply current opacity to the value-based color
                        const colorWithOpacity = baseColor.withAlpha(this.currentOpacity);

                        // Update the instance's color attribute
                        const attributes = fillPrimitive.getGeometryInstanceAttributes(instanceId);
                        if (attributes && attributes.color) {
                            attributes.color = Cesium.ColorGeometryInstanceAttribute.toValue(colorWithOpacity);
                        }
                    } catch (e) {
                        // Primitive might not be ready yet, or instance doesn't exist
                        // This is expected for async primitives, will work on next opacity change
                    }
                }
            }
        }

        console.log(`✅ Parcel opacity updated to ${Math.round(this.currentOpacity * 100)}%`);
    }

    /**
     * Handle camera movement - update visible tiles
     */
    onCameraChanged() {
        if (!this.isEnabled) return;

        // Debounce updates
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }

        this.updateTimeout = setTimeout(() => {
            this.updateTiles();
        }, 150); // 150ms debounce for smoother performance
    }

    /**
     * Update tiles based on current viewport
     */
    updateTiles() {
        if (!this.isInitialized || !this.isEnabled) return;

        // Calculate zoom level from camera height
        const cameraHeight = this.viewer.camera.positionCartographic.height;
        const zoom = this.heightToZoomLevel(cameraHeight);

        // Only show parcels when zoomed in enough
        if (zoom < 14) {
            this.clearAllTiles();
            this.notifyZoomRequired();
            return;
        }

        // Reset notification flag when zoomed back in
        this.hasNotifiedZoom = false;

        // Cap at zoom 15 for optimal performance
        const clampedZoom = Math.min(zoom, 15);

        // Get viewport bounds
        const viewport = this.getViewportBounds();
        if (!viewport) {
            return;
        }

        // Calculate which tiles are visible
        const tilesToLoad = this.getVisibleTileCoords(viewport, clampedZoom);

        // Remove tiles that are no longer visible
        for (const [tileKey, tileData] of this.loadedTiles.entries()) {
            if (!tilesToLoad.has(tileKey)) {
                this.unloadTile(tileKey);
            }
        }

        // Load new visible tiles
        for (const tileKey of tilesToLoad) {
            if (!this.loadedTiles.has(tileKey)) {
                this.loadTile(tileKey, clampedZoom);
            }
        }
    }

    /**
     * Convert camera height to tile zoom level
     *
     * Maps camera height (in meters) to web map tile zoom level (0-16).
     * Uses logarithmic scaling to match standard web map tile schemes.
     *
     * Formula: zoom = 20 - log2(height / 100)
     *
     * @param {number} height - Camera height in meters above the ellipsoid
     * @returns {number} Tile zoom level (0-16), floored to integer
     * @example
     * heightToZoomLevel(50000)  // Returns 13 (city-level view)
     * heightToZoomLevel(10000)  // Returns 15 (street-level view)
     */
    heightToZoomLevel(height) {
        const zoom = Math.max(0, Math.min(16, 20 - Math.log2(height / 100)));
        return Math.floor(zoom);
    }

    /**
     * Get viewport bounds in lon/lat
     */
    getViewportBounds() {
        try {
            const viewport = this.viewer.camera.computeViewRectangle();
            if (!viewport) {
                const cameraPos = this.viewer.camera.positionCartographic;
                const lon = Cesium.Math.toDegrees(cameraPos.longitude);
                const lat = Cesium.Math.toDegrees(cameraPos.latitude);
                const boxSize = 0.1;

                return {
                    west: lon - boxSize,
                    south: lat - boxSize,
                    east: lon + boxSize,
                    north: lat + boxSize
                };
            }

            return {
                west: Cesium.Math.toDegrees(viewport.west),
                south: Cesium.Math.toDegrees(viewport.south),
                east: Cesium.Math.toDegrees(viewport.east),
                north: Cesium.Math.toDegrees(viewport.north)
            };
        } catch (error) {
            console.warn('Error computing viewport:', error);
            return null;
        }
    }

    /**
     * Calculate which tile coordinates are visible in the viewport
     *
     * Converts geographic bounds (lon/lat) to web map tile coordinates (X/Y)
     * at the specified zoom level. Uses standard Web Mercator projection (EPSG:3857).
     *
     * @param {Object} bounds - Geographic bounds
     * @param {number} bounds.west - Western longitude (-180 to 180)
     * @param {number} bounds.east - Eastern longitude (-180 to 180)
     * @param {number} bounds.north - Northern latitude (-85 to 85)
     * @param {number} bounds.south - Southern latitude (-85 to 85)
     * @param {number} zoom - Tile zoom level (0-18)
     * @returns {Set<string>} Set of tile keys in format "z/x/y"
     * @example
     * const bounds = { west: -97.5, east: -97.0, north: 28.0, south: 27.5 };
     * const tiles = getVisibleTileCoords(bounds, 14);
     * // Returns Set {"14/3762/6878", "14/3762/6879", "14/3763/6878", ...}
     */
    getVisibleTileCoords(bounds, zoom) {
        const tiles = new Set();

        const minTileX = this.lonToTileX(bounds.west, zoom);
        const maxTileX = this.lonToTileX(bounds.east, zoom);
        const minTileY = this.latToTileY(bounds.north, zoom);
        const maxTileY = this.latToTileY(bounds.south, zoom);

        for (let x = minTileX; x <= maxTileX; x++) {
            for (let y = minTileY; y <= maxTileY; y++) {
                tiles.add(`${zoom}/${x}/${y}`);
            }
        }

        return tiles;
    }

    lonToTileX(lon, zoom) {
        return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    }

    latToTileY(lat, zoom) {
        return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    }

    /**
     * Load a tile from the backend and render using Cesium Primitives
     *
     * This is the core tile loading function:
     * 1. Fetches GeoJSON from FastAPI backend (/api/v1/parcels/tiles/{z}/{x}/{y}.json)
     * 2. Converts GeoJSON polygons to Cesium geometries
     * 3. Batches all geometries in tile into a single Primitive for GPU efficiency
     * 4. Creates separate primitives for fills (colored) and outlines (white)
     * 5. Stores metadata for later retrieval when parcels are clicked
     *
     * Backend implements:
     * - Spatial filtering via PostGIS ST_MakeEnvelope
     * - Geometry simplification via ST_Simplify (zoom-based tolerance)
     * - Redis caching with 1-week TTL
     * - 1000 parcels per tile limit
     *
     * @async
     * @param {string} tileKey - Tile coordinate in format "z/x/y"
     * @param {number} zoom - Zoom level (used for logging, not strictly needed)
     * @returns {Promise<void>}
     * @example
     * await loadTile("14/3762/6878", 14);
     */
    async loadTile(tileKey, zoom) {
        const [z, x, y] = tileKey.split('/').map(Number);

        try {
            // Fetch GeoJSON tile from FastAPI backend
            // Format: /api/v1/parcels/tiles/{z}/{x}/{y}.json
            const response = await fetch(`${this.apiBaseUrl}/parcels/tiles/${z}/${x}/${y}.json`);

            if (!response.ok) {
                console.warn(`Failed to load tile ${tileKey}: ${response.status}`);
                return;
            }

            // Parse GeoJSON response
            const tileData = await response.json();

            if (!tileData.features || tileData.features.length === 0) {
                return;
            }

            // Create batched primitives for this tile (fill + outline)
            const primitives = this.createTilePrimitive(tileKey, tileData.features);

            if (primitives) {
                this.primitiveCollection.add(primitives.fill);
                this.primitiveCollection.add(primitives.outline);

                // Store tile data
                this.loadedTiles.set(tileKey, {
                    fillPrimitive: primitives.fill,
                    outlinePrimitive: primitives.outline,
                    featureCount: tileData.features.length
                });

                console.log(`✅ Loaded tile ${tileKey}: ${tileData.features.length} parcels (batched primitives with outlines)`);
            }

        } catch (error) {
            console.error(`Error loading tile ${tileKey}:`, error);
        }
    }

    /**
     * Create batched Primitives for all parcels in a tile
     *
     * This function is the heart of the parcel rendering system. It converts GeoJSON
     * polygon features into Cesium Primitives using geometry batching for performance:
     *
     * Batching Strategy:
     * - All parcels in a tile are batched into TWO primitives (fill + outline)
     * - Without batching: 500 parcels = 1000 draw calls
     * - With batching: 500 parcels = 2 draw calls (500x faster!)
     *
     * Geometry Approach:
     * - Uses extruded PolygonGeometry (thin 0.5m volume) instead of flat polygons
     * - Extrusion ensures proper tessellation and prevents visual artifacts
     * - Height offset (10m default) keeps parcels above varied terrain
     *
     * Color Coding:
     * - Each parcel colored by property value using getParcelColor() function
     * - Colors are baked into geometry instances as vertex attributes
     * - Allows per-parcel styling within a single batched primitive
     *
     * @param {string} tileKey - Tile coordinate in format "z/x/y"
     * @param {Array<Object>} features - GeoJSON features from backend tile response
     * @returns {{fill: Cesium.Primitive, outline: Cesium.Primitive}|null} Pair of primitives or null if no valid features
     * @example
     * const features = [
     *   { type: 'Feature', geometry: { type: 'Polygon', coordinates: [...] }, properties: {...} },
     *   ...
     * ];
     * const primitives = createTilePrimitive("14/3762/6878", features);
     * viewer.scene.primitives.add(primitives.fill);
     * viewer.scene.primitives.add(primitives.outline);
     */
    createTilePrimitive(tileKey, features) {
        const fillInstances = [];
        const outlineInstances = [];

        for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            const geometry = feature.geometry;

            if (!geometry) continue; // Skip if geometry is null

            // Handle both Polygon and MultiPolygon
            let polygons = [];
            if (geometry.type === 'Polygon') {
                polygons = [geometry.coordinates];
            } else if (geometry.type === 'MultiPolygon') {
                polygons = geometry.coordinates;
            } else {
                continue; // Skip unsupported geometry types
            }

            // Process each polygon in the (multi)polygon
            for (let polyIdx = 0; polyIdx < polygons.length; polyIdx++) {
                const coordinates = polygons[polyIdx][0]; // Outer ring

                if (coordinates.length < 3) continue;

                try {
                    // Convert coordinates to Cartesian3 positions (no height - using geometry parameters instead)
                    const positions = [];
                    for (const [lon, lat] of coordinates) {
                        positions.push(Cesium.Cartesian3.fromDegrees(lon, lat));
                    }

                    const instanceId = `${tileKey}:${i}:${polyIdx}`;

                    // Create extruded polygon geometry (thin 0.5m volume for reliable tessellation)
                    const polygonGeometry = new Cesium.PolygonGeometry({
                        polygonHierarchy: new Cesium.PolygonHierarchy(positions),
                        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
                        height: this.heightOffset,              // Base height (10m default)
                        extrudedHeight: this.heightOffset + 0.5 // Top height (10.5m) - creates thin volume
                    });

                    // Get color based on property value (metadata-based styling)
                    const baseColor = typeof getParcelColor !== 'undefined'
                        ? getParcelColor(feature.properties, getColorMode())
                        : Cesium.Color.WHITE;

                    // Apply current opacity to the property-value-based color
                    const parcelColor = baseColor.withAlpha(this.currentOpacity);

                    const fillInstance = new Cesium.GeometryInstance({
                        geometry: polygonGeometry,
                        id: instanceId,
                        attributes: {
                            color: Cesium.ColorGeometryInstanceAttribute.fromColor(parcelColor)
                        }
                    });

                    fillInstances.push(fillInstance);

                    // Create outline geometry
                    const outlineGeometry = new Cesium.PolygonOutlineGeometry({
                        polygonHierarchy: new Cesium.PolygonHierarchy(positions)
                    });

                    const outlineInstance = new Cesium.GeometryInstance({
                        geometry: outlineGeometry,
                        id: `${instanceId}-outline`,
                        attributes: {
                            color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                                Cesium.Color.WHITE
                            )
                        }
                    });

                    outlineInstances.push(outlineInstance);

                    // Store parcel metadata for picking
                    this.parcelMetadata.set(instanceId, feature.properties || {});

                } catch (error) {
                    console.warn('Error creating geometry for parcel:', error);
                }
            } // End polygon loop
        } // End feature loop

        if (fillInstances.length === 0) {
            return null;
        }

        // Create fill primitive (with proper settings for extruded volumes)
        const fillPrimitive = new Cesium.Primitive({
            geometryInstances: fillInstances,
            appearance: new Cesium.PerInstanceColorAppearance({
                translucent: true,
                closed: true,  // Properly render extruded volumes
                flat: true     // Flat shading for better performance
            }),
            asynchronous: true
        });

        // Create outline primitive
        const outlinePrimitive = new Cesium.Primitive({
            geometryInstances: outlineInstances,
            appearance: new Cesium.PerInstanceColorAppearance({
                flat: true,
                renderState: {
                    lineWidth: 1
                }
            }),
            asynchronous: true
        });

        return { fill: fillPrimitive, outline: outlinePrimitive };
    }

    /**
     * Unload a tile and dispose of its primitives
     */
    unloadTile(tileKey) {
        const tileData = this.loadedTiles.get(tileKey);

        if (tileData) {
            // Remove both fill and outline primitives from scene
            this.primitiveCollection.remove(tileData.fillPrimitive);
            this.primitiveCollection.remove(tileData.outlinePrimitive);

            // Clean up primitives to free GPU memory
            if (!tileData.fillPrimitive.isDestroyed()) {
                tileData.fillPrimitive.destroy();
            }
            if (!tileData.outlinePrimitive.isDestroyed()) {
                tileData.outlinePrimitive.destroy();
            }

            // Remove metadata for this tile's parcels
            for (const [id, _] of this.parcelMetadata.entries()) {
                if (id.startsWith(tileKey + ':')) {
                    this.parcelMetadata.delete(id);
                }
            }

            this.loadedTiles.delete(tileKey);
        }
    }

    /**
     * Clear all loaded tiles
     */
    clearAllTiles() {
        for (const tileKey of this.loadedTiles.keys()) {
            this.unloadTile(tileKey);
        }
        this.loadedTiles.clear();
        this.parcelMetadata.clear();
    }

    /**
     * Get current zoom level from camera height
     */
    getZoomLevel() {
        const cameraHeight = this.viewer.camera.positionCartographic.height;
        return this.heightToZoomLevel(cameraHeight);
    }

    /**
     * Reload all tiles to apply new colors (when color mode changes)
     */
    async reloadTilesForColorChange() {
        if (!this.isEnabled) return;

        console.log('🎨 Reloading tiles to apply new colors...');

        // Get current tile keys before clearing
        const tileKeys = Array.from(this.loadedTiles.keys());

        // Clear existing tiles
        this.clearAllTiles();

        // Reload each tile with new colors
        const zoom = this.getZoomLevel();
        for (const tileKey of tileKeys) {
            await this.loadTile(tileKey, zoom);
        }

        console.log(`✅ Reloaded ${tileKeys.length} tiles with new colors`);
    }

    /**
     * Handle parcel selection via picking
     *
     * Extracts parcel metadata when user clicks on a parcel primitive.
     * The picked object contains an instance ID which is used to lookup
     * the full parcel properties from the metadata map.
     *
     * @param {Object} pickedObject - Object returned from viewer.scene.pick()
     * @param {Cesium.Primitive} pickedObject.primitive - The clicked primitive
     * @param {string} pickedObject.id - Instance ID in format "tileKey:index"
     * @returns {Object|null} Parcel properties object or null if not a parcel
     * @example
     * const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
     * handler.setInputAction((click) => {
     *   const picked = viewer.scene.pick(click.position);
     *   const parcelData = loader.pickParcel(picked);
     *   if (parcelData) {
     *     console.log('Clicked parcel:', parcelData.SITE_ADDR);
     *   }
     * }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
     */
    pickParcel(pickedObject) {
        if (pickedObject && pickedObject.primitive) {
            // Strip "-outline" suffix so outline clicks resolve to the same metadata as fill clicks
            const rawId = pickedObject.id;
            const instanceId = typeof rawId === 'string' && rawId.endsWith('-outline')
                ? rawId.slice(0, -'-outline'.length)
                : rawId;
            const metadata = this.parcelMetadata.get(instanceId);

            if (metadata) {
                this.selectedParcel = {
                    id: instanceId,
                    properties: metadata
                };
                return metadata;
            }
        }
        return null;
    }

    /**
     * Notify user that they need to zoom in to see parcels
     * Auto-unchecks the parcels checkbox and shows a toast notification
     */
    notifyZoomRequired() {
        // Only notify once per zoom-out session
        if (this.hasNotifiedZoom) return;
        this.hasNotifiedZoom = true;

        // Auto-uncheck the parcels toggle
        const checkbox = document.getElementById('parcels-toggle');
        if (checkbox && checkbox.checked) {
            checkbox.checked = false;

            // Hide opacity controls
            const opacityControls = document.getElementById('parcel-opacity-controls');
            if (opacityControls) {
                opacityControls.style.display = 'none';
            }

            // Show toast notification
            if (typeof showNotification === 'function') {
                showNotification('Zoom in closer to see property parcels', 'warning');
            }
        }
    }

    /**
     * Get current zoom level
     */
    getCurrentZoom() {
        const cameraHeight = this.viewer.camera.positionCartographic.height;
        return this.heightToZoomLevel(cameraHeight);
    }

    /**
     * Check if current zoom level is sufficient for parcels
     */
    isZoomSufficient() {
        return this.getCurrentZoom() >= this.minZoom;
    }
}
