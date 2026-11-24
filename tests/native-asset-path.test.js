const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { toUnpackedAsarPath } = require('../lib/nativeAssetPath');

test('a native library inside app.asar is loaded from app.asar.unpacked', () => {
  const packed = path.join('/opt', 'VispNote', 'resources', 'app.asar', 'node_modules', 'sqlite-vec-linux-x64', 'vec0.so');
  assert.equal(
    toUnpackedAsarPath(packed),
    path.join('/opt', 'VispNote', 'resources', 'app.asar.unpacked', 'node_modules', 'sqlite-vec-linux-x64', 'vec0.so'),
  );
  assert.equal(
    toUnpackedAsarPath('C:\\Program Files\\VispNote\\resources\\app.asar\\node_modules\\sqlite-vec-windows-x64\\vec0.dll'),
    'C:\\Program Files\\VispNote\\resources\\app.asar.unpacked\\node_modules\\sqlite-vec-windows-x64\\vec0.dll',
  );
});

test('paths outside an archive, or already unpacked, are left alone', () => {
  const dev = path.join('/home', 'me', 'visp-note', 'node_modules', 'sqlite-vec-linux-x64', 'vec0.so');
  assert.equal(toUnpackedAsarPath(dev), dev);
  const unpacked = path.join('/opt', 'VispNote', 'resources', 'app.asar.unpacked', 'vec0.so');
  assert.equal(toUnpackedAsarPath(unpacked), unpacked);
});
