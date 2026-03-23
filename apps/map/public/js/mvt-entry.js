// Entry point for webpack bundle - exposes MVT parsing libraries as globals
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';

// Expose as window globals for use in other scripts
window.Pbf = Pbf;
window.VectorTile = VectorTile;

// Export for webpack (required for library output)
export default {
  Pbf,
  VectorTile
};
