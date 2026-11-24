const sqliteVec = require('sqlite-vec');

// SQLite loads extensions with the operating system loader, which cannot read
// inside app.asar; electron-builder unpacks native files beside it instead.
function toUnpackedAsarPath(file) {
  return String(file).replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
}

function sqliteVecLoadablePath() {
  return toUnpackedAsarPath(sqliteVec.getLoadablePath());
}

module.exports = { toUnpackedAsarPath, sqliteVecLoadablePath };
