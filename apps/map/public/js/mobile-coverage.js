// Mobile carrier coverage overlays — pre-rendered tile services derived from
// FCC Form 477 (c. 2021), republished by NIFC. 4G LTE only; outdoor stationary
// propagation model. See: https://nifc.maps.arcgis.com/home/item.html?id=bcb0d12154e44d5e912034781a923391

const MOBILE_COVERAGE_SOURCES = {
    att: {
        label: 'AT&T',
        url: 'https://tiles.arcgis.com/tiles/YnOQrIGdN9JGtBh4/arcgis/rest/services/ATT_Mobility_LTE_Data/MapServer/tile/{z}/{y}/{x}',
        credit: 'AT&T 4G LTE coverage — FCC Form 477 (c. 2021), via NIFC ArcGIS',
    },
    tmo: {
        label: 'T-Mobile',
        url: 'https://tiles.arcgis.com/tiles/YnOQrIGdN9JGtBh4/arcgis/rest/services/TMobile_LTE_Data/MapServer/tile/{z}/{y}/{x}',
        credit: 'T-Mobile 4G LTE coverage — FCC Form 477 (c. 2021), via NIFC ArcGIS',
    },
    vz: {
        label: 'Verizon',
        url: 'https://tiles.arcgis.com/tiles/YnOQrIGdN9JGtBh4/arcgis/rest/services/Verizon_LTE_Data/MapServer/tile/{z}/{y}/{x}',
        credit: 'Verizon 4G LTE coverage — FCC Form 477 (c. 2021), via NIFC ArcGIS',
    },
};

const MOBILE_COVERAGE_DEFAULT_ALPHA = 0.55;

function initMobileCoverageLayers(viewer) {
    const layers = {};
    for (const [carrierId, src] of Object.entries(MOBILE_COVERAGE_SOURCES)) {
        try {
            const provider = new Cesium.UrlTemplateImageryProvider({
                url: src.url,
                minimumLevel: 4,
                maximumLevel: 12,
                credit: src.credit,
            });
            const layer = viewer.imageryLayers.addImageryProvider(provider);
            layer.alpha = MOBILE_COVERAGE_DEFAULT_ALPHA;
            layer.show = false;
            layers[carrierId] = layer;
            console.log(`✅ Mobile coverage layer added: ${src.label}`);
        } catch (err) {
            console.warn(`Could not load mobile coverage layer ${src.label}:`, err);
            layers[carrierId] = null;
        }
    }
    appState.mobileCoverageLayers = layers;
    return layers;
}

function setupMobileCoverageUI() {
    const toggles = [
        { id: 'mobile-att-toggle', carrier: 'att' },
        { id: 'mobile-tmo-toggle', carrier: 'tmo' },
        { id: 'mobile-vz-toggle',  carrier: 'vz'  },
    ];

    for (const { id, carrier } of toggles) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.addEventListener('change', (e) => {
            const layer = appState.mobileCoverageLayers?.[carrier];
            if (!layer) return;
            layer.show = e.target.checked;
            updateMobileCoverageLegendVisibility();
        });
    }

    const opacitySlider = document.getElementById('mobile-coverage-opacity');
    const opacityValue = document.getElementById('mobile-coverage-opacity-value');
    if (opacitySlider && opacityValue) {
        const apply = () => {
            const pct = parseInt(opacitySlider.value, 10);
            opacityValue.textContent = `${pct}%`;
            const alpha = pct / 100;
            for (const layer of Object.values(appState.mobileCoverageLayers || {})) {
                if (layer) layer.alpha = alpha;
            }
        };
        opacitySlider.addEventListener('input', apply);
    }
}

function updateMobileCoverageLegendVisibility() {
    const legend = document.getElementById('mobile-coverage-legend');
    if (!legend) return;
    const anyOn = ['att', 'tmo', 'vz'].some(
        (c) => appState.mobileCoverageLayers?.[c]?.show
    );
    legend.style.display = anyOn ? 'block' : 'none';
}

window.initMobileCoverageLayers = initMobileCoverageLayers;
window.setupMobileCoverageUI = setupMobileCoverageUI;
