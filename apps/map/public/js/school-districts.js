// School district boundary visualization using Primitives (same approach as parcels)

let schoolDistrictsState = {
    primitiveCollection: null,
    fillPrimitives: [],
    outlinePrimitives: [],
    labelEntities: null,
    visible: false,
    opacity: 0.5,
    heightOffset: 10 // Same as parcels
};

// Color mapping (from shapefile COLOR field)
const DISTRICT_COLORS = {
    1: '#E74C3C', // Red - Robstown
    2: '#3498DB', // Blue - London
    3: '#2ECC71', // Green - Calallen
    4: '#F39C12', // Orange - Corpus Christi
    5: '#9B59B6', // Purple - Tuloso-Midway
    6: '#1ABC9C', // Teal - West Oso
    7: '#E67E22'  // Dark Orange - Flour Bluff
};

/**
 * Load school district boundaries using Primitives
 */
async function loadSchoolDistricts() {
    try {
        console.log('Loading school district boundaries...');

        // Create primitive collection
        schoolDistrictsState.primitiveCollection = new Cesium.PrimitiveCollection();
        appState.viewer.scene.primitives.add(schoolDistrictsState.primitiveCollection);

        // Create entity collection for labels
        schoolDistrictsState.labelEntities = new Cesium.CustomDataSource('school-district-labels');
        await appState.viewer.dataSources.add(schoolDistrictsState.labelEntities);

        // Fetch GeoJSON
        const response = await fetch('data/school_districts.geojson');
        const geojson = await response.json();

        // Process each district
        for (const feature of geojson.features) {
            createDistrictPrimitive(feature);
        }

        // Start hidden
        schoolDistrictsState.primitiveCollection.show = false;
        schoolDistrictsState.labelEntities.show = false;

        console.log(`✅ Loaded ${geojson.features.length} school district boundaries`);

    } catch (error) {
        console.error('Error loading school districts:', error);
    }
}

/**
 * Create Primitive for a single district (fill + outline)
 */
function createDistrictPrimitive(feature) {
    const geometry = feature.geometry;
    if (geometry.type !== 'Polygon') return;

    const coordinates = geometry.coordinates[0]; // Outer ring
    if (coordinates.length < 3) return;

    try {
        // Get district info
        const districtName = feature.properties.NAME || 'Unknown District';
        const colorCode = feature.properties.COLOR || 4;
        const colorHex = DISTRICT_COLORS[colorCode] || DISTRICT_COLORS[4];
        const baseColor = Cesium.Color.fromCssColorString(colorHex);

        // Convert coordinates to Cartesian3 positions
        const positions = coordinates.map(([lon, lat]) =>
            Cesium.Cartesian3.fromDegrees(lon, lat)
        );

        // Calculate centroid for label
        const centroid = calculateCentroid(coordinates);

        // Try GroundPrimitive for better handling of concave geometry
        // Note: GroundPrimitive doesn't support extrusion, so we use flat polygons
        const polygonGeometry = new Cesium.PolygonGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy(positions),
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT
            // No height or extrudedHeight - ground-clamped
        });

        // Create fill instance
        const fillInstance = new Cesium.GeometryInstance({
            geometry: polygonGeometry,
            id: `district-${colorCode}-fill`,
            attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                    baseColor.withAlpha(schoolDistrictsState.opacity * 0.6)
                )
            }
        });

        // Create fill primitive using GroundPrimitive for better ground-clamping
        const fillPrimitive = new Cesium.GroundPrimitive({
            geometryInstances: fillInstance,
            appearance: new Cesium.PerInstanceColorAppearance({
                translucent: true,
                flat: true
            }),
            asynchronous: true,
            classificationType: Cesium.ClassificationType.BOTH
        });

        // Create outline geometry
        const outlineGeometry = new Cesium.PolygonOutlineGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy(positions),
            height: schoolDistrictsState.heightOffset
        });

        // Create outline instance
        const outlineInstance = new Cesium.GeometryInstance({
            geometry: outlineGeometry,
            id: `district-${colorCode}-outline`,
            attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                    baseColor.withAlpha(0.8)
                )
            }
        });

        // Create outline primitive
        const outlinePrimitive = new Cesium.Primitive({
            geometryInstances: outlineInstance,
            appearance: new Cesium.PerInstanceColorAppearance({
                flat: true,
                renderState: {
                    lineWidth: 2
                }
            }),
            asynchronous: true
        });

        // Add primitives to collection
        schoolDistrictsState.primitiveCollection.add(fillPrimitive);
        schoolDistrictsState.primitiveCollection.add(outlinePrimitive);

        // Store references
        schoolDistrictsState.fillPrimitives.push({
            primitive: fillPrimitive,
            baseColor: baseColor,
            colorCode: colorCode
        });
        schoolDistrictsState.outlinePrimitives.push({
            primitive: outlinePrimitive,
            baseColor: baseColor
        });

        // Add label entity
        const labelEntity = schoolDistrictsState.labelEntities.entities.add({
            position: Cesium.Cartesian3.fromDegrees(centroid[0], centroid[1], schoolDistrictsState.heightOffset + 100),
            label: {
                text: districtName.replace(' ISD', ''),
                font: '16px sans-serif, bold',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 3,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                pixelOffset: new Cesium.Cartesian2(0, 0),
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000),
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            description: `
                <h3>${districtName}</h3>
                <p><strong>District Code:</strong> ${feature.properties.DISTRICT || 'N/A'}</p>
            `
        });

    } catch (error) {
        console.warn('Error creating district primitive:', error);
    }
}

/**
 * Calculate polygon centroid for label placement
 */
function calculateCentroid(coordinates) {
    let totalX = 0;
    let totalY = 0;
    const count = coordinates.length;

    for (const [lon, lat] of coordinates) {
        totalX += lon;
        totalY += lat;
    }

    return [totalX / count, totalY / count];
}

/**
 * Toggle school district visibility
 */
function toggleSchoolDistricts(visible) {
    if (!schoolDistrictsState.primitiveCollection) return;

    schoolDistrictsState.primitiveCollection.show = visible;
    schoolDistrictsState.labelEntities.show = visible;
    schoolDistrictsState.visible = visible;

    // Show/hide opacity controls
    const opacityControls = document.getElementById('school-districts-opacity-controls');
    if (opacityControls) {
        opacityControls.style.display = visible ? 'block' : 'none';
    }
}

/**
 * Update school district opacity
 */
function updateSchoolDistrictsOpacity(opacity) {
    if (schoolDistrictsState.fillPrimitives.length === 0) return;

    schoolDistrictsState.opacity = opacity / 100;

    // Update fill primitives
    for (const item of schoolDistrictsState.fillPrimitives) {
        const newColor = item.baseColor.withAlpha(schoolDistrictsState.opacity * 0.6);

        // Get the geometry instance and update its color
        const attributes = item.primitive.getGeometryInstanceAttributes(item.primitive.geometryInstances.id);
        if (attributes && attributes.color) {
            attributes.color = Cesium.ColorGeometryInstanceAttribute.toValue(newColor);
        }
    }

    // Update outline primitives
    for (const item of schoolDistrictsState.outlinePrimitives) {
        const newColor = item.baseColor.withAlpha(Math.min(schoolDistrictsState.opacity + 0.3, 1.0));

        const attributes = item.primitive.getGeometryInstanceAttributes(item.primitive.geometryInstances.id);
        if (attributes && attributes.color) {
            attributes.color = Cesium.ColorGeometryInstanceAttribute.toValue(newColor);
        }
    }

    // Update UI display
    const opacityValueSpan = document.getElementById('school-districts-opacity-value');
    if (opacityValueSpan) {
        opacityValueSpan.textContent = `${Math.round(opacity)}%`;
    }
}
