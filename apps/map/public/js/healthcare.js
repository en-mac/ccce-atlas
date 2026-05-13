// Healthcare layer — Medicare provider anomaly points for Nueces County.
// Data: api.atlas.ccce.dev/api/v1/healthcare/providers/* (backed by CompIntel).

const COMPINTEL_URL = 'https://compintel.ccce.dev';

// ---------- color ramp ----------

function healthcareColorForScore(score) {
    if (score == null) return Cesium.Color.fromCssColorString('#4b5563');
    if (score >= 5) return Cesium.Color.fromCssColorString('#dc2626'); // red
    if (score >= 3) return Cesium.Color.fromCssColorString('#f59e0b'); // amber
    if (score >= 2) return Cesium.Color.fromCssColorString('#fbbf24'); // yellow
    if (score >= 1) return Cesium.Color.fromCssColorString('#9ca3af'); // gray-400
    return Cesium.Color.fromCssColorString('#4b5563');                  // gray-600
}

function healthcarePixelSize(score) {
    if (score == null) return 7;
    if (score >= 5) return 14;
    if (score >= 3) return 11;
    if (score >= 2) return 9;
    return 7;
}

// ---------- layer ----------

class HealthcareLayer {
    constructor(viewer) {
        this.viewer = viewer;
        this.collection = null;
        this.currentYear = 2023;
        this.enabled = false;
        // Map from primitive id string -> feature properties
        this.npiByPrimitiveId = new Map();
    }

    async enable() {
        if (this.enabled) return;
        this.enabled = true;
        await this.fetchAndRender();
    }

    disable() {
        this.enabled = false;
        this._clearCollection();
    }

    _clearCollection() {
        if (this.collection) {
            this.viewer.scene.primitives.remove(this.collection);
            this.collection = null;
        }
        this.npiByPrimitiveId.clear();
    }

    async setYear(year) {
        this.currentYear = year;
        if (this.enabled) {
            await this.fetchAndRender();
        }
    }

    async fetchAndRender() {
        this._clearCollection();

        const url = `${API_BASE_URL}/api/v1/healthcare/providers/nueces?year=${this.currentYear}`;
        let geojson;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            geojson = await res.json();
        } catch (err) {
            console.error('healthcare layer fetch failed', err);
            if (typeof showNotification === 'function') {
                showNotification('Could not load healthcare data', 'error');
            }
            return;
        }

        const collection = new Cesium.PointPrimitiveCollection();
        for (const feat of geojson.features) {
            const [lon, lat] = feat.geometry.coordinates;
            const score = feat.properties.ensemble_score;
            const primitive = collection.add({
                position: Cesium.Cartesian3.fromDegrees(lon, lat),
                pixelSize: healthcarePixelSize(score),
                color: healthcareColorForScore(score),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 1,
                // Always draw on top of parcels / globe.
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            });
            const idStr = `healthcare:${feat.properties.npi}`;
            primitive.id = idStr;
            this.npiByPrimitiveId.set(idStr, feat.properties);
        }
        this.viewer.scene.primitives.add(collection);
        this.collection = collection;

        const countEl = document.getElementById('healthcare-nueces-count');
        if (countEl) countEl.textContent = `${geojson.features.length} NPIs`;

        console.log(`Healthcare: rendered ${geojson.features.length} providers for ${this.currentYear}`);
    }

    /**
     * If the picked Cesium object is one of our healthcare points, return its
     * feature properties; otherwise return null. Used by main.js click handler.
     */
    pickPoint(picked) {
        if (!picked || !picked.id) return null;
        const id = typeof picked.id === 'string' ? picked.id : null;
        if (!id || !id.startsWith('healthcare:')) return null;
        return this.npiByPrimitiveId.get(id) || null;
    }
}

// ---------- right-panel card ----------

async function showHealthcareCard(featureProps) {
    const panel = document.getElementById('info-panel');
    const title = document.getElementById('info-panel-title');
    const content = document.getElementById('info-content');
    if (!panel || !content) return;

    title.textContent = `NPI ${featureProps.npi}`;
    content.innerHTML = '<p style="color:#888;">Loading…</p>';
    panel.classList.remove('hidden');

    let card;
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/healthcare/providers/${featureProps.npi}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        card = await res.json();
    } catch (err) {
        content.innerHTML = `<p style="color:#dc2626;">Failed to load: ${err.message}</p>`;
        return;
    }

    const latest = card.years[card.years.length - 1] || {};
    const yearRows = card.years.map((y) => `
        <tr>
            <td>${y.year}</td>
            <td>${formatScore(y.ensemble_score)}</td>
            <td>${formatDollars(y.med_mdcr_stdzd_amt)}</td>
            <td>${formatNumber(y.tot_benes)}</td>
        </tr>
    `).join('');

    content.innerHTML = `
        <h3 style="margin: 0 0 8px 0;">${escapeHtml(latest.specialty || 'Unknown specialty')}</h3>
        <span class="category-badge" style="background: ${tierColor(latest.tier)}; color: white;">
            ${escapeHtml(latest.tier || 'unknown tier')}
        </span>
        <div class="parcel-details" style="margin-top: 12px;">
            <p><strong>NPI:</strong> ${card.npi}</p>
            <p><strong>Latest ensemble score:</strong> ${formatScore(latest.ensemble_score)}</p>
        </div>
        <table class="healthcare-table" style="width:100%; margin-top:12px; font-size:12px; border-collapse:collapse;">
            <thead>
                <tr style="text-align:left; color:#999;">
                    <th style="padding:4px;">Year</th>
                    <th style="padding:4px;">Score</th>
                    <th style="padding:4px;">Medicare $</th>
                    <th style="padding:4px;">Benes</th>
                </tr>
            </thead>
            <tbody>${yearRows}</tbody>
        </table>
        <a href="${COMPINTEL_URL}?npi=${card.npi}" target="_blank" rel="noopener"
           class="btn-primary" style="display:inline-block; margin-top:14px; padding:8px 12px; text-decoration:none;">
            Ask CompIntel about this provider →
        </a>
    `;
}

function formatScore(s) {
    if (s == null) return '—';
    return Number(s).toFixed(2);
}

function formatDollars(v) {
    if (v == null) return '—';
    return '$' + Math.round(Number(v)).toLocaleString();
}

function formatNumber(v) {
    if (v == null) return '—';
    return Number(v).toLocaleString();
}

function tierColor(tier) {
    if (tier === 'em_dominant') return '#0ea5e9';
    if (tier === 'mixed') return '#8b5cf6';
    if (tier === 'procedural_heavy') return '#ec4899';
    return '#6b7280';
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
}

// ---------- init (called from main.js after the viewer is ready) ----------

function initHealthcareTab(viewer) {
    const layer = new HealthcareLayer(viewer);
    appState.healthcareLayer = layer;

    const toggle = document.getElementById('healthcare-nueces-toggle');
    const yearSelect = document.getElementById('healthcare-year');
    const yearControls = document.getElementById('healthcare-year-controls');
    const legend = document.getElementById('healthcare-legend');

    if (toggle) {
        toggle.addEventListener('change', async (e) => {
            if (e.target.checked) {
                if (yearControls) yearControls.style.display = 'block';
                if (legend) legend.style.display = 'block';
                await layer.enable();
                // Fly to Nueces extent on first enable for context.
                viewer.camera.flyTo({
                    destination: Cesium.Rectangle.fromDegrees(-97.55, 27.55, -97.20, 27.90),
                    duration: 1.5,
                });
            } else {
                if (yearControls) yearControls.style.display = 'none';
                if (legend) legend.style.display = 'none';
                layer.disable();
            }
        });
    }

    if (yearSelect) {
        yearSelect.addEventListener('change', async (e) => {
            await layer.setYear(parseInt(e.target.value, 10));
        });
    }

    return layer;
}

// Expose for main.js
window.initHealthcareTab = initHealthcareTab;
window.showHealthcareCard = showHealthcareCard;
