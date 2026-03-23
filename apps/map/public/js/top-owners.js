/**
 * Top Property Owners Display
 * Shows rankings of top landowners in Corpus Christi
 */

let topOwnersData = null;
let currentView = 'byAcreage'; // byAcreage, byCount, byValue

/**
 * Load top owners data from JSON
 */
async function loadTopOwners() {
    try {
        const response = await fetch('data/top_owners.json');
        if (!response.ok) {
            throw new Error(`Failed to load top owners: ${response.status}`);
        }
        topOwnersData = await response.json();
        console.log('✅ Loaded top owners data:', topOwnersData);
        return topOwnersData;
    } catch (error) {
        console.error('Error loading top owners:', error);
        return null;
    }
}

/**
 * Render the top owners list in the sidebar
 */
function renderTopOwnersList(viewType = 'byAcreage') {
    if (!topOwnersData) {
        console.warn('Top owners data not loaded yet');
        return;
    }

    currentView = viewType;
    const container = document.getElementById('top-owners-list');
    if (!container) {
        console.error('Top owners list container not found');
        return;
    }

    // Get the appropriate data array
    let data;
    let primaryLabel;
    let primaryFormatter;

    switch (viewType) {
        case 'byAcreage':
            data = topOwnersData.byAcreage;
            primaryLabel = 'Acres';
            primaryFormatter = (val) => val.toLocaleString(undefined, { maximumFractionDigits: 1 });
            break;
        case 'byCount':
            data = topOwnersData.byCount;
            primaryLabel = 'Parcels';
            primaryFormatter = (val) => val.toLocaleString();
            break;
        case 'byValue':
            data = topOwnersData.byValue;
            primaryLabel = 'Value';
            primaryFormatter = (val) => '$' + (val / 1000000).toFixed(1) + 'M';
            break;
        default:
            data = topOwnersData.byAcreage;
    }

    // Build HTML
    let html = '';
    data.forEach((owner, index) => {
        let primaryValue;
        switch (viewType) {
            case 'byAcreage':
                primaryValue = owner.totalAcres;
                break;
            case 'byCount':
                primaryValue = owner.parcelCount;
                break;
            case 'byValue':
                primaryValue = owner.totalValue;
                break;
        }

        html += `
            <div class="owner-item" data-owner="${escapeHtml(owner.owner)}" data-index="${index}">
                <div class="owner-rank">#${index + 1}</div>
                <div class="owner-details">
                    <div class="owner-name">${escapeHtml(owner.owner)}</div>
                    <div class="owner-stats">
                        <span class="primary-stat">${primaryFormatter(primaryValue)} ${primaryLabel}</span>
                        <span class="secondary-stat">${owner.parcelCount.toLocaleString()} parcels</span>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.owner-item').forEach(item => {
        item.addEventListener('click', function() {
            const ownerName = this.dataset.owner;
            const ownerIndex = parseInt(this.dataset.index);
            const ownerData = data[ownerIndex];
            showOwnerDetails(ownerData);
        });
    });
}

/**
 * Show aggregate statistics popup for an owner
 */
function showOwnerDetails(ownerData) {
    const infoPanel = document.getElementById('info-panel');
    const infoContent = document.getElementById('info-content');

    if (!infoPanel || !infoContent) {
        console.error('Info panel not found');
        return;
    }

    // Calculate additional stats
    const avgValuePerParcel = ownerData.totalValue / ownerData.parcelCount;
    const avgAcresPerParcel = ownerData.totalAcres / ownerData.parcelCount;

    // Format the content
    const html = `
        <h3 style="margin-top: 0; color: #4a9eff; font-size: 16px;">${escapeHtml(ownerData.owner)}</h3>

        <div style="margin: 15px 0;">
            <div class="stat-row">
                <span class="stat-label">Total Parcels:</span>
                <span class="stat-value">${ownerData.parcelCount.toLocaleString()}</span>
            </div>

            <div class="stat-row">
                <span class="stat-label">Total Acreage:</span>
                <span class="stat-value">${ownerData.totalAcres.toLocaleString(undefined, { maximumFractionDigits: 2 })} acres</span>
            </div>

            <div class="stat-row">
                <span class="stat-label">Total Assessed Value:</span>
                <span class="stat-value">$${ownerData.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>

            <hr style="border: none; border-top: 1px solid #333; margin: 15px 0;">

            <div class="stat-row">
                <span class="stat-label">Avg Value/Parcel:</span>
                <span class="stat-value">$${avgValuePerParcel.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>

            <div class="stat-row">
                <span class="stat-label">Avg Acres/Parcel:</span>
                <span class="stat-value">${avgAcresPerParcel.toLocaleString(undefined, { maximumFractionDigits: 2 })} acres</span>
            </div>
        </div>

        <p style="font-size: 11px; color: #888; margin-top: 15px; font-style: italic;">
            💡 This represents aggregate statistics across all properties owned by this entity.
        </p>
    `;

    infoContent.innerHTML = html;
    infoPanel.classList.remove('hidden');

    // Scroll to info panel
    infoPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Set up view toggle buttons
 */
function initializeTopOwnersControls() {
    const buttons = document.querySelectorAll('[data-view-type]');

    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // Update active state
            buttons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            // Render new view
            const viewType = this.dataset.viewType;
            renderTopOwnersList(viewType);
        });
    });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
