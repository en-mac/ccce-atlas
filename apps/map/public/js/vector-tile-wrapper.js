// Standalone vector-tile parser for browsers
(function(global) {
  // We'll manually parse MVT using just Pbf
  global.parseVectorTile = function(buffer) {
    const pbf = new Pbf(buffer);
    const tile = {};
    
    // Read the tile
    const end = pbf.readVarint() + pbf.pos;
    while (pbf.pos < end) {
      const tag = pbf.readVarint();
      if (tag === 3) { // layers
        const layer = {};
        const layerEnd = pbf.readVarint() + pbf.pos;
        let layerName;
        const features = [];
        
        while (pbf.pos < layerEnd) {
          const layerTag = pbf.readVarint();
          if (layerTag >> 3 === 1) {
            layerName = pbf.readString();
          } else if (layerTag >> 3 === 2) {
            features.push(pbf.readVarint());
          }
        }
        
        if (layerName) {
          tile[layerName] = { features };
        }
      } else {
        pbf.skip(tag & 7);
      }
    }
    
    return tile;
  };
})(window);
