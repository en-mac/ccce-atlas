// UI management for sidebar, filters, and info panel

/**
 * Initialize the UI components
 */
function initUI() {
    initTabSwitcher();
    initCategoryFilters();
    initSidebarCollapse();
}

/**
 * Initialize tab switching functionality
 */
function initTabSwitcher() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = {
        maps: document.getElementById('maps-tab-content'),
        explore: document.getElementById('explore-tab-content'),
        healthcare: document.getElementById('healthcare-tab-content')
    };

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // Update button states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Show/hide tab contents
            Object.keys(tabContents).forEach(key => {
                if (key === targetTab) {
                    tabContents[key].style.display = 'flex';
                } else {
                    tabContents[key].style.display = 'none';
                }
            });
        });
    });
}

/**
 * Initialize sidebar collapse functionality
 */
function initSidebarCollapse() {
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('sidebar-collapse');

    collapseBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });
}

/**
 * Create category filter checkboxes with expandable location lists
 */
function initCategoryFilters() {
    const container = document.getElementById('category-filters');

    for (const [categoryId, categoryConfig] of Object.entries(CATEGORIES)) {
        const layer = appState.layers[categoryId];
        const count = layer ? layer.count : 0;
        const entities = layer && layer.dataSource ? layer.dataSource.entities.values : [];

        // Category container
        const categoryContainer = document.createElement('div');
        categoryContainer.className = 'category-container';

        // Category header (clickable to expand/collapse)
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `filter-${categoryId}`;
        checkbox.checked = false;
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            toggleLayer(categoryId, e.target.checked);
        });

        const headerContent = document.createElement('div');
        headerContent.className = 'category-header-content';

        const icon = document.createElement('span');
        icon.className = 'filter-icon';
        icon.style.backgroundColor = categoryConfig.color;
        icon.style.color = 'white';
        icon.textContent = categoryConfig.icon;

        const name = document.createElement('span');
        name.className = 'category-name';
        name.textContent = categoryConfig.name;

        const countBadge = document.createElement('span');
        countBadge.className = 'poi-count';
        countBadge.textContent = count;

        const expandIcon = document.createElement('span');
        expandIcon.className = 'expand-icon';
        expandIcon.textContent = '▼';

        headerContent.appendChild(icon);
        headerContent.appendChild(name);
        headerContent.appendChild(countBadge);
        headerContent.appendChild(expandIcon);

        categoryHeader.appendChild(checkbox);
        categoryHeader.appendChild(headerContent);

        // Location list (initially hidden)
        const locationList = document.createElement('div');
        locationList.className = 'location-list collapsed';
        locationList.id = `locations-${categoryId}`;

        // Add individual locations
        entities.forEach(entity => {
            const locationItem = document.createElement('div');
            locationItem.className = 'location-item';

            const locationName = entity.properties?.name?.getValue() || 'Unknown';
            locationItem.textContent = locationName;

            locationItem.addEventListener('click', () => {
                appState.viewer.selectedEntity = entity;
                // Don't fly to entity - just select it to show info panel
            });

            locationList.appendChild(locationItem);
        });

        // Toggle expand/collapse on header click
        headerContent.addEventListener('click', () => {
            const isExpanded = !locationList.classList.contains('collapsed');
            locationList.classList.toggle('collapsed');
            expandIcon.textContent = isExpanded ? '▼' : '▲';
        });

        categoryContainer.appendChild(categoryHeader);
        categoryContainer.appendChild(locationList);
        container.appendChild(categoryContainer);
    }
}

/**
 * Show info panel with entity details
 */
function showInfoPanel(entity) {
    const panel = document.getElementById('info-panel');
    const content = document.getElementById('info-content');

    // Switch to Explore tab to show the info panel
    const exploreTabBtn = document.getElementById('explore-tab-btn');
    if (!exploreTabBtn.classList.contains('active')) {
        exploreTabBtn.click();
    }

    // Get entity properties
    const name = entity.name || entity.properties?.name?.getValue() || 'Unknown';
    const description = entity.properties?.description?.getValue() || '';
    const address = entity.properties?.address?.getValue() || '';
    const category = entity.category || 'unknown';
    const tags = entity.properties?.tags?.getValue() || [];

    // Get category config
    const categoryConfig = CATEGORIES[category] || { name: 'Unknown', color: '#666', icon: '📍' };

    // Build HTML
    let html = `
        <h3>${name}</h3>
        <span class="category-badge" style="background: ${categoryConfig.color}; color: white;">
            ${categoryConfig.icon} ${categoryConfig.name}
        </span>
    `;

    if (description) {
        html += `<p>${description}</p>`;
    }

    if (address) {
        html += `<p class="address">📍 ${address}</p>`;
    }

    if (tags && tags.length > 0) {
        html += '<div class="tags">';
        for (const tag of tags) {
            html += `<span class="tag">${tag}</span>`;
        }
        html += '</div>';
    }

    // Find parcel at this POI's location
    if (entity.position) {
        const position = entity.position.getValue(Cesium.JulianDate.now());
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);

        const parcelData = findParcelAtPoint(lon, lat);
        if (parcelData) {
            const taxId = parcelData.TAXID || parcelData.simple_geo || 'Unknown';
            const parcelAddress = parcelData.situs_disp || parcelData.SITE_ADDR || 'Unknown Address';
            const owner = parcelData.file_as_na || '';
            const appraisedValue = parcelData.appraised_ || parcelData.market || 0;
            const acreage = parcelData.land_acres || 0;

            html += `
                <details style="margin-top: 15px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
                    <summary style="cursor: pointer; font-weight: 600; color: #10b981; user-select: none;">
                        🏘️ Property Information
                    </summary>
                    <div style="margin-top: 10px; padding: 12px; background: #f0fdf4; border-left: 3px solid #10b981; border-radius: 4px;">
                        <p class="address">📍 ${parcelAddress}</p>
                        ${taxId !== 'Unknown' ? `<p><strong>Tax ID:</strong> ${taxId}</p>` : ''}
                        ${owner ? `<p><strong>Owner:</strong> ${owner}</p>` : ''}
                        ${appraisedValue > 0 ? `<p><strong>Appraised Value:</strong> $${parseInt(appraisedValue).toLocaleString()}</p>` : ''}
                        ${acreage > 0 ? `<p><strong>Acreage:</strong> ${parseFloat(acreage).toFixed(2)} acres</p>` : ''}
                    </div>
                </details>
            `;
        }
    }

    content.innerHTML = html;
    panel.classList.remove('hidden');
}

/**
 * Hide info panel
 */
function hideInfoPanel() {
    const panel = document.getElementById('info-panel');
    const backdrop = document.getElementById('info-panel-backdrop');
    panel.classList.add('hidden');
    backdrop.classList.add('hidden');
    appState.viewer.selectedEntity = undefined;
}

/**
 * Show well information in info panel
 */
function showWellInfo(metadata) {
    const panel = document.getElementById('info-panel');
    const content = document.getElementById('info-content');

    // Build HTML for well data
    let html = `
        <h3>💧 Groundwater Well</h3>
        <span class="category-badge" style="background: #06b6d4; color: white;">
            💧 USGS Well Site
        </span>
        <div style="margin-top: 15px;">
            <p><strong>Site Code:</strong> ${metadata.site_code}</p>
            <p><strong>Site Name:</strong> ${metadata.site_name}</p>
            <p><strong>Site Type:</strong> ${metadata.site_type}</p>
            <p><strong>Agency:</strong> ${metadata.agency}</p>
            <p><strong>Location:</strong> ${metadata.latitude.toFixed(5)}°N, ${Math.abs(metadata.longitude).toFixed(5)}°W</p>
        </div>
        <div style="margin-top: 15px; padding: 12px; background: #ecfeff; border-left: 3px solid #06b6d4; border-radius: 4px;">
            <p style="font-size: 0.9em; color: #0e7490;">
                <strong>Data Source:</strong> ${metadata.source || 'USGS NWIS'}
            </p>
            <p style="font-size: 0.9em; color: #0e7490; margin-top: 8px;">
                Click the site code to view detailed water level data on USGS website.
            </p>
        </div>
    `;

    content.innerHTML = html;
    panel.classList.remove('hidden');
}

/**
 * Initialize color controls for parcel value visualization
 * Part of metadata-based styling for Cesium certification
 */
function initColorControls() {
    // Show/hide color controls when parcels are enabled/disabled
    const parcelsToggle = document.getElementById('parcels-toggle');
    const colorSection = document.getElementById('color-controls-section');

    // Only set up listener if color controls section exists
    if (colorSection) {
        parcelsToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                colorSection.style.display = 'block';
                updateColorLegend();
            } else {
                colorSection.style.display = 'none';
            }
        });
    }

    // Initial legend (will be shown when parcels are enabled)
    // Always uses 'total' mode (no toggle)
    updateColorLegend();
}

/**
 * Update the color legend (always uses 'total' mode)
 */
function updateColorLegend() {
    const legendContainer = document.getElementById('color-legend');
    if (!legendContainer) return;

    const currentMode = 'total'; // Always use total value mode
    const legendData = getLegendData(currentMode);

    let html = '<div style="font-size: 0.9em;">';

    // Regular parcels legend
    html += '<div style="margin-bottom: 15px;">';
    html += `<div style="font-weight: bold; margin-bottom: 8px; color: #1f2937;">${legendData.regular.title}</div>`;

    for (const range of legendData.regular.ranges) {
        const maxValue = range.max ? formatValue(range.max, currentMode) : '>';
        html += `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                <div style="width: 20px; height: 16px; background-color: ${range.color}; border: 1px solid #d1d5db; border-radius: 2px;"></div>
                <span style="font-size: 0.85em;">${range.label}${range.max ? `: ≤${maxValue}` : ''}</span>
            </div>
        `;
    }
    html += '</div>';

    // Ag/vacant parcels legend
    html += '<div>';
    html += `<div style="font-weight: bold; margin-bottom: 8px; color: #1f2937;">${legendData.ag.title}</div>`;

    for (const range of legendData.ag.ranges) {
        const maxValue = range.max ? formatValue(range.max, currentMode) : '>';
        html += `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                <div style="width: 20px; height: 16px; background-color: ${range.color}; border: 1px solid #d1d5db; border-radius: 2px;"></div>
                <span style="font-size: 0.85em;">${range.label}${range.max ? `: ≤${maxValue}` : ''}</span>
            </div>
        `;
    }
    html += '</div>';

    html += '</div>';

    legendContainer.innerHTML = html;
}

/**
 * Make a panel draggable (reusable for multiple popups)
 * @param {HTMLElement} panel - The panel element to make draggable
 */
function makePanelDraggable(panel) {
    const header = panel.querySelector('.info-panel-header');
    if (!header) {
        console.warn('Panel header not found, cannot make draggable');
        return;
    }

    // Drag state for this specific panel
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let panelWidth = 0;
    let panelHeight = 0;
    let currentX = 0;
    let currentY = 0;
    let rafId = null;

    // Drag handlers (closure captures panel-specific state)
    function dragStart(e) {
        // Only drag if clicking on header, not buttons
        if (e.target.classList.contains('panel-btn') || e.target.classList.contains('minimize-btn') || e.target.classList.contains('close-btn')) {
            return;
        }

        const titleElement = header.querySelector('.info-panel-title');
        if (e.target === header || e.target === titleElement) {
            isDragging = true;

            // Get panel dimensions once
            const rect = panel.getBoundingClientRect();

            // Switch from centered to dragged positioning
            if (!panel.classList.contains('dragged')) {
                panel.classList.add('dragged');
                currentX = rect.left;
                currentY = rect.top;
                panel.style.transform = `translate(${currentX}px, ${currentY}px)`;
            }

            // Cache panel dimensions for drag calculations
            panelWidth = rect.width;
            panelHeight = rect.height;

            // Calculate offset from mouse position to panel position
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
        }
    }

    function drag(e) {
        if (!isDragging) return;

        e.preventDefault();

        // Calculate new position based on cursor
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;

        // Keep panel within viewport bounds
        const maxX = window.innerWidth - panelWidth;
        const maxY = window.innerHeight - panelHeight;

        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        // Store pending position
        currentX = newX;
        currentY = newY;

        // Cancel any pending animation frame
        if (rafId) {
            cancelAnimationFrame(rafId);
        }

        // Schedule update on next animation frame
        rafId = requestAnimationFrame(updatePosition);
    }

    function updatePosition() {
        // Apply position using GPU-accelerated transform
        panel.style.transform = `translate(${currentX}px, ${currentY}px)`;
        rafId = null;
    }

    function dragEnd(e) {
        isDragging = false;
        // Cancel any pending animation frame
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    // Attach event listeners
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
}

/**
 * Initialize draggable info panel functionality (for legacy single panel)
 */
function initDraggablePanel() {
    const panel = document.getElementById('info-panel');
    const minimizeBtn = document.getElementById('minimize-panel');
    const closeBtn = document.getElementById('close-panel');
    const backdrop = document.getElementById('info-panel-backdrop');

    if (!panel) {
        console.warn('Legacy info panel not found');
        return;
    }

    // Minimize/maximize toggle
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('minimized');

            if (panel.classList.contains('minimized')) {
                minimizeBtn.textContent = '□';
                minimizeBtn.title = 'Maximize';
                if (backdrop) backdrop.classList.add('hidden');
            } else {
                minimizeBtn.textContent = '−';
                minimizeBtn.title = 'Minimize';
                if (backdrop) backdrop.classList.remove('hidden');
            }
        });
    }

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideInfoPanel();
        });
    }

    // Make panel draggable
    makePanelDraggable(panel);

    // Close on backdrop click
    if (backdrop) {
        backdrop.addEventListener('click', hideInfoPanel);
    }
}

// Initialize draggable panel when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDraggablePanel);
} else {
    initDraggablePanel();
}

/**
 * Initialize help modal system
 */
function initHelpModal() {
    const helpButton = document.getElementById('help-button');
    const helpModal = document.getElementById('help-modal');
    const helpBackdrop = document.getElementById('help-modal-backdrop');
    const closeHelp = document.getElementById('close-help');
    const helpContent = document.getElementById('help-content');

    // Show help modal
    helpButton.addEventListener('click', () => {
        // Generate context-aware help content
        const content = generateHelpContent();
        helpContent.innerHTML = content;

        helpModal.classList.remove('hidden');
        helpBackdrop.classList.remove('hidden');
    });

    // Close help modal
    function closeHelpModal() {
        helpModal.classList.add('hidden');
        helpBackdrop.classList.add('hidden');
    }

    closeHelp.addEventListener('click', closeHelpModal);
    helpBackdrop.addEventListener('click', closeHelpModal);
}

/**
 * Generate context-aware help content based on active tab
 */
function generateHelpContent() {
    const mapsTab = document.getElementById('maps-tab-btn');
    const isMapstabActive = mapsTab.classList.contains('active');

    let html = '';

    // Global section (always shown)
    html += `
        <div class="help-section">
            <h3>🗺️ Navigation & Controls</h3>
            <ul>
                <li><strong>Pan:</strong> Click and drag to move around the map</li>
                <li><strong>Zoom:</strong> Scroll wheel or pinch to zoom in/out</li>
                <li><strong>Rotate:</strong> Right-click and drag to tilt/rotate view</li>
                <li><strong>Keyboard:</strong> Arrow keys to move, +/- to zoom, R to reset</li>
                <li><strong>Sidebar:</strong> Click ◀ to collapse/expand controls</li>
            </ul>
        </div>
    `;

    // Maps tab content
    if (isMapstabActive) {
        html += `
            <div class="help-section">
                <h3>🗺️ Base Layers</h3>
                <ul>
                    <li>Choose one base layer: Bing Aerial, OpenTopoMap, or NASA GIBS</li>
                    <li>NASA GIBS allows date selection for satellite imagery</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>📍 Overlay Layers</h3>
                <ul>
                    <li>Toggle any combination of overlays on the base layer</li>
                    <li>Available: Aviation charts, nautical charts, weather, trails, etc.</li>
                    <li>Adjust opacity with slider for better visibility</li>
                </ul>
            </div>
        `;
    } else {
        // Explore tab content
        html += `
            <div class="help-section">
                <h3>📍 Points of Interest</h3>
                <ul>
                    <li>Toggle POI categories to show/hide markers on map</li>
                    <li>Click any marker to view details</li>
                    <li>Expand category to see list of locations</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>🏘️ Property Parcels</h3>
                <ul>
                    <li>Enable "Show Property Parcels" in sidebar</li>
                    <li>Zoom to street level (Z13+) to see parcel boundaries</li>
                    <li>Click parcel to view property info popup</li>
                    <li><strong>Ctrl+Click</strong> to compare up to 3 properties</li>
                    <li>Drag popups to arrange side-by-side</li>
                    <li>Click − to minimize, □ to maximize</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>🚌 Public Transit</h3>
                <ul>
                    <li>View CCRTA bus routes and stops</li>
                    <li>Use presets or toggle individual routes</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>👥 Top Property Owners</h3>
                <ul>
                    <li>View largest landowners by Acreage, Count, or Value</li>
                    <li>Click owner to highlight their properties</li>
                </ul>
            </div>
        `;
    }

    return html;
}

// Initialize help modal when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHelpModal);
} else {
    initHelpModal();
}
