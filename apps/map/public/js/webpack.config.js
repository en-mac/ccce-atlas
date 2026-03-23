const path = require('path');

module.exports = {
  entry: './mvt-entry.js',
  output: {
    filename: 'mvt-bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: 'MVT',
      type: 'window',
      export: 'default'
    }
  },
  mode: 'production'
};
