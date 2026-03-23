/**
 * Tour System with Advanced Camera Control
 * For Cesium Certified Developer certification
 *
 * Features:
 * - Smooth camera flyovers between POI stops
 * - Advanced camera animations (heading, pitch, roll)
 * - Auto-play and manual step-through modes
 * - Progress tracking and UI integration
 */

class Tour {
    constructor(viewer) {
        this.viewer = viewer;
        this.isActive = false;
        this.isPaused = false;
        this.currentStopIndex = -1;
        this.autoPlayInterval = null;

        // Tour stops configuration
        this.stops = [
            {
                name: "Texas State Aquarium",
                description: "One of the finest aquariums in the Southwest, featuring marine life from the Gulf of Mexico",
                category: "activities",
                icon: "🐠",
                position: { lon: -97.3926202, lat: 27.8138802 },
                camera: {
                    heading: Cesium.Math.toRadians(0),
                    pitch: Cesium.Math.toRadians(-45),
                    range: 500
                },
                duration: 8000 // Stay for 8 seconds
            },
            {
                name: "USS Lexington Museum",
                description: "Historic aircraft carrier serving as a museum, nicknamed 'The Blue Ghost'",
                category: "activities",
                icon: "⚓",
                position: { lon: -97.3887113, lat: 27.8148742 },
                camera: {
                    heading: Cesium.Math.toRadians(90),
                    pitch: Cesium.Math.toRadians(-30),
                    range: 600
                },
                duration: 8000
            },
            {
                name: "Executive Surf Club",
                description: "Waterfront restaurant with stunning views of the bay and fresh seafood",
                category: "eats",
                icon: "🍽️",
                position: { lon: -97.39435, lat: 27.79445 },
                camera: {
                    heading: Cesium.Math.toRadians(180),
                    pitch: Cesium.Math.toRadians(-40),
                    range: 400
                },
                duration: 7000
            },
            {
                name: "Brewster Street Icehouse",
                description: "Local favorite bar and grill, known for its relaxed atmosphere and cold drinks",
                category: "eats",
                icon: "🍺",
                position: { lon: -97.3983534, lat: 27.8075311 },
                camera: {
                    heading: Cesium.Math.toRadians(270),
                    pitch: Cesium.Math.toRadians(-35),
                    range: 350
                },
                duration: 7000
            },
            {
                name: "Oso Bay Wetland Preserve",
                description: "162-acre nature preserve with trails through diverse wetland habitats",
                category: "trails",
                icon: "🥾",
                position: { lon: -97.3314457, lat: 27.6686626 },
                camera: {
                    heading: Cesium.Math.toRadians(45),
                    pitch: Cesium.Math.toRadians(-50),
                    range: 800
                },
                duration: 8000
            },
            {
                name: "Bob Hall Pier",
                description: "Popular fishing pier extending into the Gulf of Mexico with panoramic views",
                category: "beaches",
                icon: "🏖️",
                position: { lon: -97.21777, lat: 27.58198 },
                camera: {
                    heading: Cesium.Math.toRadians(135),
                    pitch: Cesium.Math.toRadians(-25),
                    range: 700
                },
                duration: 8000
            },
            {
                name: "South Texas Botanical Gardens",
                description: "182-acre botanical garden featuring native plants, orchid conservatory, and nature trails",
                category: "activities",
                icon: "🌺",
                position: { lon: -97.404421, lat: 27.6554872 },
                camera: {
                    heading: Cesium.Math.toRadians(0),
                    pitch: Cesium.Math.toRadians(-60),
                    range: 500
                },
                duration: 8000
            }
        ];
    }

    /**
     * Start the tour from the beginning
     */
    start() {
        if (this.isActive) {
            console.warn('Tour already active');
            return;
        }

        console.log('🎬 Starting Corpus Christi tour...');
        this.isActive = true;
        this.isPaused = false;
        this.currentStopIndex = -1;

        // Update UI
        this.updateUI();

        // Go to first stop
        this.next();
    }

    /**
     * Stop the tour and return to default view
     */
    stop() {
        if (!this.isActive) return;

        console.log('⏹️ Stopping tour');

        // Clear any auto-play timers
        if (this.autoPlayInterval) {
            clearTimeout(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }

        this.isActive = false;
        this.isPaused = false;
        this.currentStopIndex = -1;

        // Update UI
        this.updateUI();

        // Return to default view
        this.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-97.3964, 27.8006, 50000),
            orientation: {
                heading: Cesium.Math.toRadians(0),
                pitch: Cesium.Math.toRadians(-90),
                roll: 0
            },
            duration: 3
        });
    }

    /**
     * Pause the tour (stops auto-advance)
     */
    pause() {
        if (!this.isActive || this.isPaused) return;

        console.log('⏸️ Pausing tour');
        this.isPaused = true;

        if (this.autoPlayInterval) {
            clearTimeout(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }

        this.updateUI();
    }

    /**
     * Resume the tour (restart auto-advance)
     */
    resume() {
        if (!this.isActive || !this.isPaused) return;

        console.log('▶️ Resuming tour');
        this.isPaused = false;

        // Schedule next stop
        const currentStop = this.stops[this.currentStopIndex];
        this.autoPlayInterval = setTimeout(() => {
            this.next();
        }, currentStop.duration);

        this.updateUI();
    }

    /**
     * Go to next stop
     */
    next() {
        if (!this.isActive) return;

        // Clear any existing timer
        if (this.autoPlayInterval) {
            clearTimeout(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }

        // Advance to next stop
        this.currentStopIndex++;

        // Check if tour is complete
        if (this.currentStopIndex >= this.stops.length) {
            console.log('✅ Tour complete!');
            this.stop();
            return;
        }

        const stop = this.stops[this.currentStopIndex];
        console.log(`📍 Stop ${this.currentStopIndex + 1}/${this.stops.length}: ${stop.name}`);

        // Fly to this stop with advanced camera control
        this.flyToStop(stop);

        // Update UI
        this.updateUI();

        // Schedule next stop (if not paused)
        if (!this.isPaused) {
            this.autoPlayInterval = setTimeout(() => {
                this.next();
            }, stop.duration);
        }
    }

    /**
     * Go to previous stop
     */
    previous() {
        if (!this.isActive || this.currentStopIndex <= 0) return;

        // Clear any existing timer
        if (this.autoPlayInterval) {
            clearTimeout(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }

        this.currentStopIndex -= 2; // Go back 2 (will be incremented by next())
        this.next();
    }

    /**
     * Jump to a specific stop by index
     */
    goToStop(index) {
        if (!this.isActive || index < 0 || index >= this.stops.length) return;

        // Clear any existing timer
        if (this.autoPlayInterval) {
            clearTimeout(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }

        this.currentStopIndex = index - 1; // Will be incremented by next()
        this.next();
    }

    /**
     * Fly to a stop with advanced camera control
     * Uses smooth camera animations with custom heading, pitch, and range
     */
    flyToStop(stop) {
        const destination = Cesium.Cartesian3.fromDegrees(
            stop.position.lon,
            stop.position.lat,
            stop.camera.range
        );

        // Advanced camera orientation
        const orientation = {
            heading: stop.camera.heading,
            pitch: stop.camera.pitch,
            roll: 0 // Keep level
        };

        // Smooth flyTo with custom duration based on distance
        const currentPos = this.viewer.camera.positionCartographic;
        const distance = Cesium.Cartesian3.distance(
            this.viewer.camera.position,
            destination
        );

        // Calculate flight duration (3-6 seconds based on distance)
        const flightDuration = Math.min(6, Math.max(3, distance / 20000));

        this.viewer.camera.flyTo({
            destination: destination,
            orientation: orientation,
            duration: flightDuration,
            easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
        });
    }

    /**
     * Update UI to reflect current tour state
     */
    updateUI() {
        // Update tour panel visibility
        const tourPanel = document.getElementById('tour-panel');
        if (tourPanel) {
            if (this.isActive) {
                tourPanel.classList.remove('hidden');
                this.updateTourContent();
            } else {
                tourPanel.classList.add('hidden');
            }
        }

        // Update tour controls
        const startBtn = document.getElementById('tour-start');
        const stopBtn = document.getElementById('tour-stop');
        const pauseBtn = document.getElementById('tour-pause');
        const nextBtn = document.getElementById('tour-next');
        const prevBtn = document.getElementById('tour-prev');

        if (startBtn) startBtn.disabled = this.isActive;
        if (stopBtn) stopBtn.disabled = !this.isActive;
        if (pauseBtn) {
            pauseBtn.disabled = !this.isActive;
            pauseBtn.textContent = this.isPaused ? '▶️ Resume' : '⏸️ Pause';
        }
        if (nextBtn) nextBtn.disabled = !this.isActive;
        if (prevBtn) prevBtn.disabled = !this.isActive || this.currentStopIndex <= 0;
    }

    /**
     * Update tour panel content
     */
    updateTourContent() {
        const content = document.getElementById('tour-content');
        if (!content || this.currentStopIndex < 0) return;

        const stop = this.stops[this.currentStopIndex];
        const progress = `${this.currentStopIndex + 1} / ${this.stops.length}`;

        const html = `
            <div class="tour-stop">
                <div class="tour-header">
                    <span class="tour-icon">${stop.icon}</span>
                    <h3>${stop.name}</h3>
                </div>
                <p class="tour-description">${stop.description}</p>
                <div class="tour-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${(this.currentStopIndex + 1) / this.stops.length * 100}%"></div>
                    </div>
                    <span class="progress-text">Stop ${progress}</span>
                </div>
            </div>
        `;

        content.innerHTML = html;
    }

    /**
     * Get tour information (for UI display before starting)
     */
    getTourInfo() {
        return {
            totalStops: this.stops.length,
            estimatedDuration: this.stops.reduce((sum, stop) => sum + stop.duration, 0) / 1000,
            stops: this.stops.map(stop => ({
                name: stop.name,
                category: stop.category,
                icon: stop.icon
            }))
        };
    }
}
