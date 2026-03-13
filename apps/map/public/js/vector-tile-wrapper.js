/**
 * Mapbox Vector Tile decoder wrapper
 *
 * The @mapbox/vector-tile package doesn't provide a UMD browser build,
 * so we use geojson-vt which has similar functionality and works in browsers.
 *
 * Alternative: We decode MVT using the pbf library directly.
 */

// Simple MVT decoder using just Pbf
// Based on Mapbox Vector Tile Specification 2.1
window.VectorTile = class VectorTile {
    constructor(pbf) {
        this.layers = {};

        // Read all layers from the PBF
        pbf.readFields(this._readTile, this);
    }

    _readTile(tag, tile, pbf) {
        if (tag === 3) {
            const layer = new VectorTileLayer(pbf);
            if (layer.length) {
                tile.layers[layer.name] = layer;
            }
        }
    }
};

class VectorTileLayer {
    constructor(pbf) {
        this.version = 1;
        this.name = null;
        this.extent = 4096;
        this.length = 0;
        this._pbf = pbf;
        this._keys = [];
        this._values = [];
        this._features = [];

        pbf.readFields(this._readLayer, this);
        this.length = this._features.length;
    }

    _readLayer(tag, layer, pbf) {
        if (tag === 15) {
            layer.version = pbf.readVarint();
        } else if (tag === 1) {
            layer.name = pbf.readString();
        } else if (tag === 5) {
            layer.extent = pbf.readVarint();
        } else if (tag === 2) {
            // Feature - save position then skip the bytes
            layer._features.push(pbf.pos);
            const len = pbf.readVarint();
            pbf.pos += len;
        } else if (tag === 3) {
            layer._keys.push(pbf.readString());
        } else if (tag === 4) {
            layer._values.push(layer._readValueMessage(pbf));
        }
    }

    _readValueMessage(pbf) {
        let value = null;
        const end = pbf.readVarint() + pbf.pos;

        while (pbf.pos < end) {
            const tag = pbf.readVarint() >> 3;
            value = tag === 1 ? pbf.readString() :
                tag === 2 ? pbf.readFloat() :
                tag === 3 ? pbf.readDouble() :
                tag === 4 ? pbf.readVarint64() :
                tag === 5 ? pbf.readVarint() :
                tag === 6 ? pbf.readSVarint() :
                tag === 7 ? pbf.readBoolean() : null;
        }
        return value;
    }

    feature(i) {
        if (i < 0 || i >= this._features.length) throw new Error('feature index out of bounds');

        this._pbf.pos = this._features[i];
        const end = this._pbf.readVarint() + this._pbf.pos;
        return new VectorTileFeature(this._pbf, end, this.extent, this._keys, this._values);
    }
}

class VectorTileFeature {
    constructor(pbf, end, extent, keys, values) {
        this.properties = {};
        this.extent = extent;
        this.type = 0;
        this._pbf = pbf;
        this._geometry = -1;

        pbf.readFields(this._readFeature, this, end);
    }

    _readFeature(tag, feature, pbf) {
        if (tag == 1) feature.id = pbf.readVarint();
        else if (tag == 2) this._readTag(pbf, feature);
        else if (tag == 3) feature.type = pbf.readVarint();
        else if (tag == 4) feature._geometry = pbf.pos;
    }

    _readTag(pbf, feature) {
        const end = pbf.readVarint() + pbf.pos;
        while (pbf.pos < end) {
            const key = feature._keys[pbf.readVarint()];
            const value = feature._values[pbf.readVarint()];
            feature.properties[key] = value;
        }
    }

    toGeoJSON(x, y, z) {
        const size = this.extent * Math.pow(2, z);
        const x0 = this.extent * x;
        const y0 = this.extent * y;
        const coords = this.loadGeometry();

        const geometry = {
            type: this.type === 1 ? 'Point' :
                  this.type === 2 ? 'LineString' :
                  this.type === 3 ? 'Polygon' : null,
            coordinates: coords.map(ring => ring.map(p => [
                (p.x + x0) * 360 / size - 180,
                360 / Math.PI * Math.atan(Math.exp((180 - (p.y + y0) * 360 / size) * Math.PI / 180)) - 90
            ]))
        };

        if (this.type === 3) {
            // Polygon - already in right format
        } else if (this.type === 2) {
            // LineString - flatten
            geometry.coordinates = geometry.coordinates[0];
        } else if (this.type === 1) {
            // Point - flatten
            geometry.coordinates = geometry.coordinates[0][0];
        }

        return {
            type: 'Feature',
            geometry: geometry,
            properties: this.properties
        };
    }

    loadGeometry() {
        const pbf = this._pbf;
        pbf.pos = this._geometry;
        const end = pbf.readVarint() + pbf.pos;
        let cmd = 1;
        let length = 0;
        let x = 0;
        let y = 0;
        const lines = [];
        let line;

        while (pbf.pos < end) {
            if (length <= 0) {
                const cmdLen = pbf.readVarint();
                cmd = cmdLen & 0x7;
                length = cmdLen >> 3;
            }

            length--;

            if (cmd === 1 || cmd === 2) {
                x += pbf.readSVarint();
                y += pbf.readSVarint();

                if (cmd === 1) {
                    if (line) lines.push(line);
                    line = [];
                }

                if (line) line.push({x: x, y: y});
            } else if (cmd === 7) {
                if (line && line.length > 0) {
                    line.push({x: line[0].x, y: line[0].y});
                }
            } else {
                throw new Error('unknown command ' + cmd);
            }
        }

        if (line) lines.push(line);
        return lines;
    }
}

console.log('✅ VectorTile wrapper loaded (custom MVT decoder)');
