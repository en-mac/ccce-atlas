/**
 * Parcel Color Styling System
 * For Cesium Certified Developer certification - Metadata-based styling requirement
 *
 * Color parcels by property value using two different scales:
 * - Ag-exempt/low-value: Brown tones
 * - Regular parcels: Green → Yellow → Red gradient
 *
 * Supports both "total value" and "value per acre" modes
 */

// Color mode state
const parcelColorState = {
    mode: 'total', // 'total' or 'per-acre'
    enabled: true
};

// Color scale breakpoints (from data analysis)
const COLOR_BREAKPOINTS = {
    regular: {
        total: [
            { max: 95406, color: [34, 197, 94] },      // Green (#22c55e)
            { max: 177292, color: [132, 204, 22] },   // Yellow-Green (#84cc16)
            { max: 312921, color: [234, 179, 8] },     // Yellow (#eab308)
            { max: 614554, color: [251, 146, 60] },    // Orange (#fb923c)
            { max: Infinity, color: [239, 68, 68] }    // Red (#ef4444)
        ],
        perAcre: [
            { max: 378065, color: [34, 197, 94] },      // Green
            { max: 781103, color: [132, 204, 22] },    // Yellow-Green
            { max: 1490813, color: [234, 179, 8] },     // Yellow
            { max: 2396854, color: [251, 146, 60] },    // Orange
            { max: Infinity, color: [239, 68, 68] }     // Red
        ]
    },
    ag: {
        total: [
            { max: 1000, color: [101, 67, 33] },       // Dark Brown (#653421)
            { max: 3370, color: [139, 69, 19] },       // Medium Brown (#8b4513)
            { max: Infinity, color: [210, 105, 30] }   // Tan (#d2691e)
        ],
        perAcre: [
            { max: 1000, color: [101, 67, 33] },
            { max: 5000, color: [139, 69, 19] },
            { max: Infinity, color: [210, 105, 30] }
        ]
    }
};

/**
 * Determine if a parcel is ag-exempt or low-value
 * Based on class code or value/acreage heuristic
 */
function isAgExemptParcel(properties) {
    const classCode = properties.class_cd || '';
    const value = parseFloat(properties.market || properties.appraised_ || 0);
    const acres = parseFloat(properties.land_acres || 0);

    // Check for AG class code or very low value for large parcels
    return (
        classCode.toUpperCase().includes('AG') ||
        (value < 10000 && acres > 1)
    );
}

/**
 * Get property value for color calculation
 * Supports both total value and per-acre modes
 */
function getPropertyValue(properties, mode) {
    const value = parseFloat(properties.market || properties.appraised_ || 0);

    if (mode === 'per-acre') {
        const acres = parseFloat(properties.land_acres || 0);
        if (acres > 0) {
            return value / acres;
        }
        // If no acreage data, treat as very high $/acre to show as red
        return Infinity;
    }

    return value;
}

/**
 * Get color for a parcel based on its value and type
 * Returns Cesium.Color object
 */
function getParcelColor(properties, mode = 'total') {
    if (!parcelColorState.enabled) {
        // Default white fill when coloring is disabled
        return Cesium.Color.fromBytes(255, 255, 255, 100);
    }

    const isAg = isAgExemptParcel(properties);
    const value = getPropertyValue(properties, mode);

    // Select appropriate color scale
    const scaleKey = mode === 'per-acre' ? 'perAcre' : 'total';
    const breakpoints = isAg ? COLOR_BREAKPOINTS.ag[scaleKey] : COLOR_BREAKPOINTS.regular[scaleKey];

    // Find the appropriate color for this value
    for (const bp of breakpoints) {
        if (value <= bp.max) {
            const [r, g, b] = bp.color;
            // Return full opacity - alpha will be set by tile loader based on slider
            return Cesium.Color.fromBytes(r, g, b, 255);
        }
    }

    // Fallback (should never reach here due to Infinity max)
    return Cesium.Color.fromBytes(255, 255, 255, 255);
}

/**
 * Get human-readable description of a parcel's value category
 */
function getValueCategory(properties, mode = 'total') {
    const isAg = isAgExemptParcel(properties);
    const value = getPropertyValue(properties, mode);

    if (isAg) {
        if (value <= 1000) return 'Ag/Vacant - Very Low';
        if (value <= 3370) return 'Ag/Vacant - Low';
        return 'Ag/Vacant - Moderate';
    }

    // Regular parcels
    const scaleKey = mode === 'per-acre' ? 'perAcre' : 'total';
    const breakpoints = COLOR_BREAKPOINTS.regular[scaleKey];

    if (value <= breakpoints[0].max) return 'Low Value';
    if (value <= breakpoints[1].max) return 'Below Average';
    if (value <= breakpoints[2].max) return 'Average';
    if (value <= breakpoints[3].max) return 'Above Average';
    return 'High Value';
}

/**
 * Set the color mode (total or per-acre)
 */
function setColorMode(mode) {
    parcelColorState.mode = mode;
}

/**
 * Toggle parcel coloring on/off
 */
function toggleParcelColoring(enabled) {
    parcelColorState.enabled = enabled;
}

/**
 * Get current color mode
 */
function getColorMode() {
    return parcelColorState.mode;
}

/**
 * Format value for display
 */
function formatValue(value, mode = 'total') {
    if (mode === 'per-acre') {
        return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}/acre`;
    }
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Get legend data for UI display
 */
function getLegendData(mode = 'total') {
    const scaleKey = mode === 'per-acre' ? 'perAcre' : 'total';

    return {
        regular: {
            title: 'Regular Parcels',
            ranges: [
                { label: 'Low', color: '#22c55e', max: COLOR_BREAKPOINTS.regular[scaleKey][0].max },
                { label: 'Below Avg', color: '#84cc16', max: COLOR_BREAKPOINTS.regular[scaleKey][1].max },
                { label: 'Average', color: '#eab308', max: COLOR_BREAKPOINTS.regular[scaleKey][2].max },
                { label: 'Above Avg', color: '#fb923c', max: COLOR_BREAKPOINTS.regular[scaleKey][3].max },
                { label: 'High', color: '#ef4444', max: null }
            ]
        },
        ag: {
            title: 'Ag/Vacant Parcels',
            ranges: [
                { label: 'Very Low', color: '#653421', max: COLOR_BREAKPOINTS.ag[scaleKey][0].max },
                { label: 'Low', color: '#8b4513', max: COLOR_BREAKPOINTS.ag[scaleKey][1].max },
                { label: 'Moderate', color: '#d2691e', max: null }
            ]
        },
        mode
    };
}
