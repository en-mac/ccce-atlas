// CCCE Atlas Configuration (Example Template)
// Copy this file to config.js and add your actual values
//
// SECURITY: Never commit config.js to git! It's in .gitignore
//

// Cesium token from https://ion.cesium.com/tokens
const CESIUM_ACCESS_TOKEN = 'your-cesium-ion-token-here';

// Google Maps Platform API Key (for Photorealistic 3D Tiles)
// Get from: https://console.cloud.google.com/apis/credentials
// Required APIs: Map Tiles API, Photorealistic 3D Tiles API
// Optional - leave blank to disable Google 3D Tiles feature
const GOOGLE_MAPS_API_KEY = '';  // e.g., 'AIzaSyC...'

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

// OpenWeatherMap API key for precipitation overlay
// Get from: https://openweathermap.org/api
// Optional - leave blank to disable the Weather Model overlay
const OWM_API_KEY = '';

// AI Depth Map tile server base URL (e.g., your internal proxy or load balancer)
// Tiles are served at: ${DEPTH_TILES_BASE_URL}/tiles/depth/15/{x}/{y}.png
// Optional - leave blank to disable the AI Depth Map overlay
const DEPTH_TILES_BASE_URL = '';

// FAA VFR Sectional Chart ArcGIS Online service identifier
// Public FAA-hosted service; leave blank to disable the Aviation Sectional overlay
const FAA_VFR_SECTIONAL_SERVICE_ID = '';
