/**
 * Downtown Corpus Christi Run Club Route Tour
 *
 * An immersive street-level tour following the Wednesday Run Club 5K route.
 * Features 3-phase camera movement for smooth navigation:
 *   1. Translate forward (~2.2s per segment)
 *   2. Rotate to face next direction (~0.5s per segment)
 *   3. Pause to load tiles and orient (2s fixed pause)
 *
 * Duration: ~102 seconds total
 *   - 60s base movement (translate + rotate)
 *   - 42s pause time (21 pauses × 2s each)
 *   - Slower pace allows high-resolution 15cm tiles to load at 10m altitude
 *
 * Route: Start at BUS → Coopers Alley → Lawrence T-Head → Peoples T-Head → IH-37 access → back to BUS
 */

class RunClubTour {
    constructor(viewer, googleTileset) {
        this.viewer = viewer;
        this.googleTileset = googleTileset;
        this.isRunning = false;
        this.isPaused = false;
        this.currentMode = null; // 'fast-run' or 'quick-tour'
        this.savedCameraPosition = null;
        this.currentWaypointIndex = 0;
        this.pausedWaypointIndex = 0;

        // Route definition
        this.routeWaypoints = [];
        this.defineRoute();
    }

    /**
     * Define the Run Club route waypoints
     * Based on: Start at BUS → South on Chaparral → East on Coopers →
     * North on Shoreline → Lawrence T-Head loop → Peoples T-Head loop →
     * IH-37 access → South on Chaparral → back to BUS
     */
    defineRoute() {
        // Downtown CC Wednesday Run Club 5K Route
        // Exact coordinates collected from atlas.ccce.dev
        this.routeWaypoints = [
            { lat: 27.798061, lon: -97.393764, name: 'Start: BUS (702 N Chaparral)' },
            { lat: 27.796060, lon: -97.393829, name: 'South on N. Chaparral' },
            { lat: 27.791974, lon: -97.395276, name: 'N. Chaparral & Coopers Alley' },
            { lat: 27.791373, lon: -97.392118, name: 'Coopers Alley & N. Shoreline' },
            { lat: 27.794032, lon: -97.391337, name: 'N. Shoreline & Lawrence St' },
            { lat: 27.793596, lon: -97.388919, name: 'Lawrence T-Head entrance' },
            { lat: 27.792424, lon: -97.389296, name: 'Lawrence T-Head SW corner' },
            { lat: 27.792170, lon: -97.388622, name: 'Lawrence T-Head SE corner' },
            { lat: 27.794707, lon: -97.387912, name: 'Lawrence T-Head NE corner' },
            { lat: 27.794783, lon: -97.388663, name: 'Lawrence T-Head NW corner' },
            { lat: 27.793596, lon: -97.388919, name: 'Lawrence T-Head entrance (return)' },
            { lat: 27.794139, lon: -97.391316, name: 'Back to N. Shoreline' },
            { lat: 27.796748, lon: -97.390959, name: 'North on N. Shoreline to Peoples' },
            { lat: 27.796740, lon: -97.388704, name: 'Peoples T-Head entrance' },
            { lat: 27.795514, lon: -97.388599, name: 'Peoples T-Head SW corner' },
            { lat: 27.795509, lon: -97.387871, name: 'Peoples T-Head SE corner' },
            { lat: 27.798105, lon: -97.388267, name: 'Peoples T-Head NE corner' },
            { lat: 27.797911, lon: -97.388913, name: 'Peoples T-Head NW corner' },
            { lat: 27.796765, lon: -97.388728, name: 'Peoples T-Head entrance (return)' },
            { lat: 27.796792, lon: -97.390976, name: 'Back to N. Shoreline' },
            { lat: 27.802175, lon: -97.391434, name: 'N. Shoreline & IH-37' },
            { lat: 27.801513, lon: -97.394154, name: 'IH-37 & N. Chaparral' },
            { lat: 27.798057, lon: -97.393751, name: 'Finish: Back at BUS' }
        ];

        console.log(`🏃 Run Club Route initialized: ${this.routeWaypoints.length} waypoints`);
    }

    /**
     * Calculate heading (azimuth) from one point to another
     * @returns {number} Heading in degrees (0-360)
     */
    calculateHeading(waypointIndex) {
        if (waypointIndex >= this.routeWaypoints.length - 1) {
            return 0; // Last waypoint, no next point
        }

        const from = this.routeWaypoints[waypointIndex];
        const to = this.routeWaypoints[waypointIndex + 1];

        const lat1 = Cesium.Math.toRadians(from.lat);
        const lat2 = Cesium.Math.toRadians(to.lat);
        const deltaLon = Cesium.Math.toRadians(to.lon - from.lon);

        const y = Math.sin(deltaLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

        const heading = Math.atan2(y, x);
        return (Cesium.Math.toDegrees(heading) + 360) % 360;
    }

    /**
     * Start the tour
     * @param {string} mode - 'quick-tour' (~102 sec: 60s movement + 42s pauses)
     */
    async start(mode) {
        if (this.isRunning) {
            console.warn('Tour already running');
            return;
        }

        this.currentMode = mode;
        this.isRunning = true;
        this.isPaused = false;
        this.currentWaypointIndex = 0;

        // Save current camera position
        this.savedCameraPosition = {
            destination: this.viewer.camera.position.clone(),
            orientation: {
                heading: this.viewer.camera.heading,
                pitch: this.viewer.camera.pitch,
                roll: this.viewer.camera.roll
            }
        };

        // Enable Google 3D tiles for photorealistic buildings
        if (this.googleTileset) {
            this.googleTileset.show = true;
            console.log('✅ Google 3D Tiles enabled for tour');
        }

        // Show tour controls UI
        document.getElementById('run-club-controls').style.display = 'block';
        document.getElementById('run-club-quick').disabled = true;

        // Enter focus mode: collapse other sidebar sections so tour controls
        // are obviously visible and not buried below the fold.
        document.body.classList.add('tour-focus-active');
        document.getElementById('run-club-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        console.log('🏃 Starting Run Club Route Tour (~102s: 60s movement + 42s pauses)');

        // Start animation
        await this.animateAlongRoute();
    }

    /**
     * Animate camera along the route: translate then rotate then pause pattern
     */
    async animateAlongRoute() {
        // Base movement time: 60 seconds for translate + rotate
        const baseMovementDuration = 60; // seconds
        const numSegments = this.routeWaypoints.length - 1;
        const timePerSegment = baseMovementDuration / numSegments;

        // Split base segment time: 80% translate, 20% rotate
        const translateTime = timePerSegment * 0.80;
        const rotateTime = timePerSegment * 0.20;

        // Fixed pause after each rotation: 2 seconds (not included in base 60s)
        // Total tour time: 60s base + (21 pauses × 2s) = 102 seconds
        const pauseTime = 2.0; // seconds

        for (let i = this.currentWaypointIndex; i < this.routeWaypoints.length - 1; i++) {
            // Check if stopped or paused
            if (!this.isRunning || this.isPaused) {
                this.pausedWaypointIndex = i;
                return;
            }

            this.currentWaypointIndex = i;
            const nextWaypoint = this.routeWaypoints[i + 1];
            const currentHeading = this.calculateHeading(i); // Heading from i → i+1

            // Step 1: Translate to next waypoint while maintaining current heading
            await new Promise((resolve) => {
                this.viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(
                        nextWaypoint.lon,
                        nextWaypoint.lat,
                        10 // 10 meters altitude (street level)
                    ),
                    orientation: {
                        heading: Cesium.Math.toRadians(currentHeading),
                        pitch: Cesium.Math.toRadians(-10), // Looking slightly down
                        roll: 0.0
                    },
                    duration: translateTime,
                    easingFunction: Cesium.EasingFunction.LINEAR_NONE,
                    complete: () => resolve()
                });
            });

            // Step 2: Rotate to face next segment (if not at final waypoint)
            if (i + 1 < this.routeWaypoints.length - 1) {
                const nextHeading = this.calculateHeading(i + 1); // Heading from i+1 → i+2

                await new Promise((resolve) => {
                    this.viewer.camera.flyTo({
                        destination: Cesium.Cartesian3.fromDegrees(
                            nextWaypoint.lon,
                            nextWaypoint.lat,
                            10
                        ),
                        orientation: {
                            heading: Cesium.Math.toRadians(nextHeading),
                            pitch: Cesium.Math.toRadians(-10),
                            roll: 0.0
                        },
                        duration: rotateTime,
                        easingFunction: Cesium.EasingFunction.LINEAR_NONE,
                        complete: () => resolve()
                    });
                });

                // Step 3: Pause after rotation to let tiles load and viewer orient
                await new Promise((resolve) => {
                    setTimeout(() => resolve(), pauseTime * 1000); // Convert to milliseconds
                });
            }

            // Update progress UI
            const progress = ((i + 2) / this.routeWaypoints.length) * 100;
            this.updateProgressUI(progress);
        }

        // Tour complete
        this.stop();
    }

    /**
     * Update progress UI
     */
    updateProgressUI(progressPercent) {
        const progressBar = document.getElementById('run-club-progress');
        const statusText = document.getElementById('run-club-status');

        if (progressBar) {
            progressBar.style.width = `${Math.min(progressPercent, 100).toFixed(1)}%`;
        }

        if (statusText) {
            statusText.textContent = `${progressPercent.toFixed(0)}% complete`;
        }
    }

    /**
     * Pause the tour
     */
    pause() {
        if (!this.isRunning || this.isPaused) return;

        this.isPaused = true;
        this.viewer.camera.cancelFlight();
        console.log('⏸️ Tour paused');
    }

    /**
     * Resume the tour
     */
    resume() {
        if (!this.isRunning || !this.isPaused) return;

        this.isPaused = false;
        this.currentWaypointIndex = this.pausedWaypointIndex;
        console.log('▶️ Tour resumed');

        // Continue animation from paused waypoint
        this.animateAlongRoute();
    }

    /**
     * Stop the tour and return to saved camera position
     */
    stop() {
        if (!this.isRunning) return;

        // Cancel any ongoing flight
        this.viewer.camera.cancelFlight();

        // Disable Google 3D tiles
        if (this.googleTileset) {
            this.googleTileset.show = false;
            console.log('✅ Google 3D Tiles disabled');
        }

        // Return to saved camera position
        if (this.savedCameraPosition) {
            this.viewer.camera.flyTo({
                destination: this.savedCameraPosition.destination,
                orientation: this.savedCameraPosition.orientation,
                duration: 3
            });
        }

        // Reset state
        this.isRunning = false;
        this.isPaused = false;
        this.currentMode = null;
        this.currentWaypointIndex = 0;
        this.pausedWaypointIndex = 0;

        // Hide tour controls UI
        document.getElementById('run-club-controls').style.display = 'none';
        document.getElementById('run-club-quick').disabled = false;
        document.getElementById('run-club-pause').textContent = '⏸️ Pause';
        document.getElementById('run-club-progress').style.width = '0%';
        document.getElementById('run-club-status').textContent = 'Ready';

        // Exit focus mode: restore all sidebar sections.
        document.body.classList.remove('tour-focus-active');

        console.log('⏹️ Tour stopped');
    }
}
