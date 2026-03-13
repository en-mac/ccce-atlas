// CCCE Atlas Configuration (Example Template)
// Copy this file to config.js and add your actual values
//
// SECURITY: Never commit config.js to git! It's in .gitignore
//

// Cesium token from https://ion.cesium.com/tokens
const CESIUM_ACCESS_TOKEN = 'your-cesium-ion-token-here';

// Backend API Configuration
// Automatically detects local vs production environment
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8000'
    : 'https://api.ccce-atlas.dev';  // Update with your production API URL

// Tile Server Configuration (for vector tiles from pg_tileserv)
const TILESERV_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:7800'
    : 'https://tiles.ccce-atlas.dev';  // Update with your production tile server

// Specialty Tiles Service (for AI depth maps and elevation)
const TILES_SERVICE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8001'
    : 'https://specialty-tiles.ccce-atlas.dev';  // Update with your production tiles service
