const fs = require('node:fs');
const path = require('node:path');

// Since Electron 45, Node's fs under Electron opens any *.asar path as an archive,
// so writing a placeholder archive fails unless asar support is switched off.
function withAsarSupportOff(fn) {
  const previous = process.noAsar;
  process.noAsar = true;
  try {
    return fn();
  } finally {
    process.noAsar = previous;
  }
}

function writeFakeAsar(file, contents = 'archive') {
  withAsarSupportOff(() => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  });
}

module.exports = { withAsarSupportOff, writeFakeAsar };
