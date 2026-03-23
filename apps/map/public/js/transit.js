// Transit route management
let transitRoutes = [];
let transitState = {
    routes: {}, // route_id -> { routeDataSource, stopsDataSource, routeVisible, stopsVisible }
    activePreset: 'none' // Track active preset: 'none', 'all-routes', 'routes-stops', or null (custom)
};

/**
 * Load transit routes metadata and populate UI
 */
async function loadTransitRoutes() {
    try {
        const response = await fetch('data/transit_routes_metadata.json');
        transitRoutes = await response.json();

        console.log(`Loaded ${transitRoutes.length} transit routes`);

        // Populate UI
        populateTransitRoutesUI();

        // Setup preset button handlers
        setupPresetHandlers();

        // Load all route shapes
        await loadAllRouteShapes();

    } catch (error) {
        console.error('Error loading transit routes:', error);
    }
}

/**
 * Populate the transit routes UI with checkboxes - compact two-column layout
 */
function populateTransitRoutesUI() {
    const container = document.getElementById('transit-routes-list');

    // Create table for compact layout
    const table = document.createElement('div');
    table.style.cssText = 'display: table; width: 100%; border-collapse: collapse;';

    transitRoutes.forEach(route => {
        const row = document.createElement('div');
        row.style.cssText = 'display: table-row; border-bottom: 1px solid #2a2a2a;';

        // Color indicator
        const colorCell = document.createElement('div');
        colorCell.style.cssText = `display: table-cell; width: 4px; background: ${route.color}; vertical-align: middle;`;
        row.appendChild(colorCell);

        // Route checkbox cell
        const routeCell = document.createElement('div');
        routeCell.style.cssText = 'display: table-cell; padding: 8px 8px 8px 12px; vertical-align: middle; width: 60%;';

        const routeCheckbox = document.createElement('input');
        routeCheckbox.type = 'checkbox';
        routeCheckbox.id = `route-${route.route_id}-line`;
        routeCheckbox.style.cssText = 'margin-right: 8px; cursor: pointer;';
        routeCheckbox.addEventListener('change', (e) => {
            toggleRouteVisibility(route.route_id, e.target.checked);
            // Enable/disable stops checkbox based on route
            const stopsCheckbox = document.getElementById(`route-${route.route_id}-stops`);
            stopsCheckbox.disabled = !e.target.checked;
            if (!e.target.checked) {
                stopsCheckbox.checked = false;
                toggleStopsVisibility(route.route_id, false);
            }
            // Clear active preset when user manually changes
            clearActivePreset();
        });

        const routeLabel = document.createElement('label');
        routeLabel.htmlFor = routeCheckbox.id;
        routeLabel.style.cssText = 'cursor: pointer; font-size: 12px; color: #ddd;';
        routeLabel.textContent = `Route ${route.short_name} - ${route.long_name}`;

        routeCell.appendChild(routeCheckbox);
        routeCell.appendChild(routeLabel);
        row.appendChild(routeCell);

        // Stops checkbox cell
        const stopsCell = document.createElement('div');
        stopsCell.style.cssText = 'display: table-cell; padding: 8px 12px 8px 8px; vertical-align: middle; width: 40%;';

        const stopsCheckbox = document.createElement('input');
        stopsCheckbox.type = 'checkbox';
        stopsCheckbox.id = `route-${route.route_id}-stops`;
        stopsCheckbox.disabled = true; // Starts disabled
        stopsCheckbox.style.cssText = 'margin-right: 8px; cursor: pointer;';
        stopsCheckbox.addEventListener('change', (e) => {
            toggleStopsVisibility(route.route_id, e.target.checked);
            // Clear active preset when user manually changes
            clearActivePreset();
        });

        const stopsLabel = document.createElement('label');
        stopsLabel.htmlFor = stopsCheckbox.id;
        stopsLabel.style.cssText = 'cursor: pointer; font-size: 11px; color: #999;';
        stopsLabel.textContent = `Stops (${route.stop_count})`;

        stopsCell.appendChild(stopsCheckbox);
        stopsCell.appendChild(stopsLabel);
        row.appendChild(stopsCell);

        table.appendChild(row);

        // Initialize state
        transitState.routes[route.route_id] = {
            routeDataSource: null,
            stopsDataSource: null,
            routeVisible: false,
            stopsVisible: false,
            metadata: route
        };
    });

    container.appendChild(table);
}

/**
 * Load all route shapes from transit_routes.geojson
 */
async function loadAllRouteShapes() {
    try {
        const dataSource = await Cesium.GeoJsonDataSource.load('data/transit_routes.geojson');

        // Process each route shape entity
        const entities = dataSource.entities.values;
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            const routeId = entity.properties?.route_id?.getValue();

            if (routeId && transitState.routes[routeId]) {
                // Apply route color from properties
                const routeColor = entity.properties?.color?.getValue();
                if (routeColor && entity.polyline) {
                    entity.polyline.material = Cesium.Color.fromCssColorString(routeColor);
                    entity.polyline.width = 4;
                    entity.polyline.clampToGround = true;
                    entity.polyline.zIndex = 1000; // Render on top of parcels
                }

                // Store reference to this specific route's entities
                if (!transitState.routes[routeId].routeEntities) {
                    transitState.routes[routeId].routeEntities = [];
                }
                transitState.routes[routeId].routeEntities.push(entity);
            }
        }

        // Add to viewer
        await appState.viewer.dataSources.add(dataSource);
        dataSource.show = true; // Keep dataSource visible, we'll control individual entities

        // Store the main dataSource
        transitState.mainRouteDataSource = dataSource;

        // Hide all routes initially
        for (const routeId in transitState.routes) {
            setRouteEntitiesVisibility(routeId, false);
        }

        console.log(`Loaded ${entities.length} route shapes across ${Object.keys(transitState.routes).length} routes`);
    } catch (error) {
        console.error('Error loading route shapes:', error);
    }
}

/**
 * Toggle route line visibility
 */
async function toggleRouteVisibility(routeId, visible) {
    const route = transitState.routes[routeId];
    if (!route) return;

    route.routeVisible = visible;
    setRouteEntitiesVisibility(routeId, visible);
}

/**
 * Set visibility for all entities belonging to a route
 */
function setRouteEntitiesVisibility(routeId, visible) {
    const route = transitState.routes[routeId];
    if (!route || !route.routeEntities) return;

    route.routeEntities.forEach(entity => {
        entity.show = visible;
    });
}

/**
 * Toggle stops visibility for a route
 */
async function toggleStopsVisibility(routeId, visible) {
    const route = transitState.routes[routeId];
    if (!route) return;

    route.stopsVisible = visible;

    // Load stops if not already loaded
    if (!route.stopsDataSource && visible) {
        await loadRouteStops(routeId);
    }

    // Toggle visibility
    if (route.stopsDataSource) {
        route.stopsDataSource.show = visible;
    }
}

/**
 * Load stops for a specific route
 */
async function loadRouteStops(routeId) {
    const route = transitState.routes[routeId];
    if (!route) return;

    try {
        const stopFile = `data/transit_stops_route_${routeId}.geojson`;
        const dataSource = await Cesium.GeoJsonDataSource.load(stopFile, {
            markerColor: Cesium.Color.fromCssColorString(route.metadata.color)
        });

        // Customize stop entities
        const entities = dataSource.entities.values;
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];

            // Create custom bus stop pin
            if (entity.billboard) {
                entity.billboard.image = createPinImage(route.metadata.color, '🚏');
                entity.billboard.verticalOrigin = Cesium.VerticalOrigin.BOTTOM;
                entity.billboard.scale = 0.6;
                entity.billboard.heightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
                entity.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
                entity.billboard.pixelOffset = new Cesium.Cartesian2(0, 0);
                entity.billboard.eyeOffset = new Cesium.Cartesian3(0, 0, -1000); // Negative z = closer to camera
            }

            // Add label
            const stopName = entity.properties?.stop_name?.getValue();
            if (stopName) {
                entity.label = {
                    text: stopName,
                    font: '11px sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -45),
                    heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000),
                    show: true
                };
            }
        }

        // Add to viewer
        await appState.viewer.dataSources.add(dataSource);
        route.stopsDataSource = dataSource;

        console.log(`Loaded ${entities.length} stops for Route ${route.metadata.short_name}`);
    } catch (error) {
        console.error(`Error loading stops for route ${routeId}:`, error);
    }
}

/**
 * Setup preset button handlers
 */
function setupPresetHandlers() {
    const presetNone = document.getElementById('preset-none');
    const presetAllRoutes = document.getElementById('preset-all-routes');
    const presetRoutesStops = document.getElementById('preset-routes-stops');

    if (presetNone) {
        presetNone.addEventListener('click', () => applyPreset('none'));
    }
    if (presetAllRoutes) {
        presetAllRoutes.addEventListener('click', () => applyPreset('all-routes'));
    }
    if (presetRoutesStops) {
        presetRoutesStops.addEventListener('click', () => applyPreset('routes-stops'));
    }
}

/**
 * Apply a transit preset
 */
async function applyPreset(presetType) {
    transitState.activePreset = presetType;

    // Update button active states
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));

    if (presetType === 'none') {
        document.getElementById('preset-none').classList.add('active');
        // Uncheck all routes and stops
        transitRoutes.forEach(route => {
            const routeCheckbox = document.getElementById(`route-${route.route_id}-line`);
            const stopsCheckbox = document.getElementById(`route-${route.route_id}-stops`);
            if (routeCheckbox) {
                routeCheckbox.checked = false;
                toggleRouteVisibility(route.route_id, false);
            }
            if (stopsCheckbox) {
                stopsCheckbox.checked = false;
                stopsCheckbox.disabled = true;
                toggleStopsVisibility(route.route_id, false);
            }
        });
    } else if (presetType === 'all-routes') {
        document.getElementById('preset-all-routes').classList.add('active');
        // Check all routes, uncheck all stops
        transitRoutes.forEach(route => {
            const routeCheckbox = document.getElementById(`route-${route.route_id}-line`);
            const stopsCheckbox = document.getElementById(`route-${route.route_id}-stops`);
            if (routeCheckbox) {
                routeCheckbox.checked = true;
                toggleRouteVisibility(route.route_id, true);
            }
            if (stopsCheckbox) {
                stopsCheckbox.checked = false;
                stopsCheckbox.disabled = false; // Enable but don't check
                toggleStopsVisibility(route.route_id, false);
            }
        });
    } else if (presetType === 'routes-stops') {
        document.getElementById('preset-routes-stops').classList.add('active');
        // Check all routes and all stops
        for (const route of transitRoutes) {
            const routeCheckbox = document.getElementById(`route-${route.route_id}-line`);
            const stopsCheckbox = document.getElementById(`route-${route.route_id}-stops`);
            if (routeCheckbox) {
                routeCheckbox.checked = true;
                await toggleRouteVisibility(route.route_id, true);
            }
            if (stopsCheckbox) {
                stopsCheckbox.disabled = false;
                stopsCheckbox.checked = true;
                await toggleStopsVisibility(route.route_id, true);
            }
        }
    }
}

/**
 * Clear the active preset (called when user manually toggles)
 */
function clearActivePreset() {
    transitState.activePreset = null;
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
}
