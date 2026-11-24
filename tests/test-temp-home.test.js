const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  configureIsolatedUserData,
  isOwnedTestHome,
  scheduleTempCleanupAfterExit,
} = require('../scripts/test-temp-home');

test('Electron regressions isolate userData inside an owned temporary home', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vispnote-test-home-'));
  let configured = null;
  try {
    const userData = configureIsolatedUserData({
      setPath(name, value) {
        configured = [name, value];
      },
      commandLine: { appendSwitch() {} },
    }, home);
    assert.deepEqual(configured, ['userData', userData]);
    assert.equal(userData, path.join(home, 'electron-user-data'));
    assert.equal(fs.statSync(userData).isDirectory(), true);
    assert.equal(isOwnedTestHome(home), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('Electron regressions never touch the person\'s keyring', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vispnote-test-home-'));
  const switches = [];
  const previous = process.env.VISPNOTE_DISABLE_SAFE_STORAGE;
  try {
    delete process.env.VISPNOTE_DISABLE_SAFE_STORAGE;
    configureIsolatedUserData({
      setPath() {},
      commandLine: { appendSwitch: (name, value) => switches.push([name, value]) },
    }, home);
    assert.deepEqual(switches, [['password-store', 'basic']], 'Chromium itself must not open the Linux keyring');
    assert.equal(process.env.VISPNOTE_DISABLE_SAFE_STORAGE, '1', 'VispNote must not ask the system key store');
  } finally {
    if (previous === undefined) delete process.env.VISPNOTE_DISABLE_SAFE_STORAGE;
    else process.env.VISPNOTE_DISABLE_SAFE_STORAGE = previous;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('post-exit cleanup rejects caller-owned and non-temporary paths', () => {
  const callerOwned = path.resolve(__dirname, 'caller-owned-vispnote-home');
  assert.equal(isOwnedTestHome(callerOwned), false);
  assert.equal(scheduleTempCleanupAfterExit(callerOwned), false);
  assert.equal(isOwnedTestHome(os.tmpdir()), false);
});
