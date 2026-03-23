/**
 * Web Worker for processing parcel data into tiles
 * Runs in background to avoid blocking the UI
 */

// Import geojson-vt in worker
importScripts('https://unpkg.com/geojson-vt@3.2.1/geojson-vt.js');

self.addEventListener('message', function(e) {
    const { type, data } = e.data;

    if (type === 'CREATE_INDEX') {
        try {
            console.log('Worker: Creating tile index...');

            const tileIndex = geojsonvt(data.geojson, {
                maxZoom: 16,
                tolerance: 3,
                extent: 4096,
                buffer: 64,
                debug: 0
            });

            // Send success message
            self.postMessage({
                type: 'INDEX_CREATED',
                success: true,
                // Can't transfer the actual index object, need different approach
            });

        } catch (error) {
            self.postMessage({
                type: 'INDEX_ERROR',
                success: false,
                error: error.message
            });
        }
    } else if (type === 'GET_TILE') {
        // Get specific tile data
        const { z, x, y } = data;
        // Process tile request
    }
});
