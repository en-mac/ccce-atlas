// Layer management for POI data

// Category configuration with colors and icons
const CATEGORIES = {
    beaches: {
        name: 'Beaches',
        color: '#3b82f6', // blue
        icon: '🏖️',
        file: 'data/beaches.geojson'
    },
    trails: {
        name: 'Trails',
        color: '#10b981', // green
        icon: '🥾',
        file: 'data/trails.geojson'
    },
    eats: {
        name: 'Local Eats',
        color: '#ef4444', // red
        icon: '🍴',
        file: 'data/eats.geojson'
    },
    coffee: {
        name: 'Coffee',
        color: '#8b5cf6', // purple
        icon: '☕',
        file: 'data/coffee.geojson'
    },
    bookstores: {
        name: 'Bookstores',
        color: '#f59e0b', // amber
        icon: '📚',
        file: 'data/bookstores.geojson'
    },
    libraries: {
        name: 'Libraries',
        color: '#06b6d4', // cyan
        icon: '🏛️',
        file: 'data/libraries.geojson'
    },
    activities: {
        name: 'Activities',
        color: '#ec4899', // pink
        icon: '🎨',
        file: 'data/activities.geojson'
    },
    community: {
        name: 'Community',
        color: '#14b8a6', // teal
        icon: '🏃',
        file: 'data/community.geojson'
    }
    // Transit routes and stops are now managed by transit.js
};

/**
 * Load a single GeoJSON POI layer
 *
 * Fetches a GeoJSON file from the data directory and adds it to the Cesium viewer
 * as a DataSource. Each feature becomes a Cesium entity with a styled billboard marker.
 *
 * @async
 * @param {string} categoryId - Unique identifier for this category ('beaches', 'eats', etc.)
 * @param {Object} categoryConfig - Configuration object for the category
 * @param {string} categoryConfig.name - Display name of the category
 * @param {string} categoryConfig.color - Hex color code for markers (#RRGGBB)
 * @param {string} categoryConfig.icon - Emoji or icon for the marker
 * @param {string} categoryConfig.file - Path to GeoJSON file
 * @returns {Promise<Cesium.DataSource>} The loaded data source
 *
 * @example
 * const config = {
 *   name: 'Beaches',
 *   color: '#3b82f6',
 *   icon: '🏖️',
 *   file: 'data/beaches.geojson'
 * };
 * const dataSource = await loadLayer('beaches', config);
 */
async function loadLayer(categoryId, categoryConfig) {
    try {
        const dataSource = await Cesium.GeoJsonDataSource.load(categoryConfig.file, {
            stroke: Cesium.Color.fromCssColorString(categoryConfig.color),
            fill: Cesium.Color.fromCssColorString(categoryConfig.color).withAlpha(0.5),
            strokeWidth: 3,
            markerColor: Cesium.Color.fromCssColorString(categoryConfig.color)
        });

        // Customize each entity in the data source
        const entities = dataSource.entities.values;
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];

            // Add category information to entity
            entity.category = categoryId;

            // Handle LineString geometry (transit routes)
            if (categoryConfig.type === 'line' && entity.polyline) {
                // Use color from GeoJSON properties if available
                const routeColor = entity.properties?.color?.getValue();
                if (routeColor) {
                    entity.polyline.material = Cesium.Color.fromCssColorString(routeColor);
                }
                entity.polyline.width = 4;
                entity.polyline.clampToGround = true;
            }
            // Handle Point geometry (POIs, bus stops)
            else if (entity.billboard || !entity.polyline) {
                // Style the billboard/marker
                if (entity.billboard) {
                    entity.billboard.image = createPinImage(categoryConfig.color, categoryConfig.icon);
                    entity.billboard.verticalOrigin = Cesium.VerticalOrigin.BOTTOM;
                    entity.billboard.scale = 0.7;
                    // Raise bus stops higher for better visibility
                    if (categoryId === 'transit_stops') {
                        entity.billboard.heightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
                        entity.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
                    }
                } else {
                    // If no billboard exists, create one
                    entity.billboard = {
                        image: createPinImage(categoryConfig.color, categoryConfig.icon),
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        scale: 0.7
                    };
                    // Raise bus stops higher for better visibility
                    if (categoryId === 'transit_stops') {
                        entity.billboard.heightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
                        entity.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
                    }
                }

                // Add label for bus stops
                if (categoryId === 'transit_stops' && entity.properties) {
                    const stopName = entity.properties.stop_name?.getValue();
                    if (stopName) {
                        entity.label = {
                            text: stopName,
                            font: '12px sans-serif',
                            fillColor: Cesium.Color.WHITE,
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 2,
                            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                            pixelOffset: new Cesium.Cartesian2(0, -50),
                            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000),
                            show: true
                        };
                    }
                }
            }
        }

        // Add the data source to the viewer
        await appState.viewer.dataSources.add(dataSource);

        // Start with layer hidden (user can toggle on)
        dataSource.show = false;

        // Store reference to the layer
        appState.layers[categoryId] = {
            dataSource: dataSource,
            config: categoryConfig,
            visible: false,
            count: entities.length
        };

        console.log(`Loaded ${entities.length} POIs for ${categoryConfig.name}`);
        return dataSource;
    } catch (error) {
        console.error(`Error loading layer ${categoryId}:`, error);
        // Create empty layer if file doesn't exist
        appState.layers[categoryId] = {
            dataSource: null,
            config: categoryConfig,
            visible: true,
            count: 0
        };
        return null;
    }
}

/**
 * Load all POI layers
 */
async function loadAllLayers() {
    const loadPromises = [];

    for (const [categoryId, categoryConfig] of Object.entries(CATEGORIES)) {
        loadPromises.push(loadLayer(categoryId, categoryConfig));
    }

    await Promise.all(loadPromises);
    console.log('All layers loaded');
}

/**
 * Toggle visibility of a layer
 */
function toggleLayer(categoryId, visible) {
    const layer = appState.layers[categoryId];
    if (!layer || !layer.dataSource) return;

    layer.dataSource.show = visible;
    layer.visible = visible;
}

/**
 * Fly camera to entity with smooth animation
 */
function flyToEntity(entity) {
    if (!entity.position) return;

    const position = entity.position.getValue(Cesium.JulianDate.now());

    appState.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromRadians(
            Cesium.Cartographic.fromCartesian(position).longitude,
            Cesium.Cartographic.fromCartesian(position).latitude,
            800 // Height in meters
        ),
        orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-90),
            roll: 0.0
        },
        duration: 2.0,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT
    });
}

/**
 * Create a custom pin image with emoji icon
 */
function createPinImage(color, emoji) {
    // Create a canvas to draw the pin
    const canvas = document.createElement('canvas');
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Draw pin shape
    const pinWidth = 40;
    const pinHeight = 50;
    const offsetX = (size - pinWidth) / 2;
    const offsetY = 2;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(offsetX + pinWidth / 2, offsetY + pinWidth * 0.4, pinWidth * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Pin body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(offsetX + pinWidth / 2, offsetY + pinWidth * 0.4, pinWidth * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Pin point
    ctx.beginPath();
    ctx.moveTo(offsetX + pinWidth / 2, offsetY + pinHeight);
    ctx.lineTo(offsetX + pinWidth * 0.3, offsetY + pinWidth * 0.6);
    ctx.lineTo(offsetX + pinWidth * 0.7, offsetY + pinWidth * 0.6);
    ctx.closePath();
    ctx.fill();

    // Inner circle (white background for emoji)
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(offsetX + pinWidth / 2, offsetY + pinWidth * 0.4, pinWidth * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Emoji icon
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, offsetX + pinWidth / 2, offsetY + pinWidth * 0.4);

    return canvas.toDataURL();
}
