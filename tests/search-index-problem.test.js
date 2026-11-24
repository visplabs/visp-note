const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { describeSearchIndexFailure } = require('../main/searchIndexProblem');
const { registerPreferencesHandlers } = require('../lib/connectors/ipc/preferencesHandlers');

function dlopenError(message) {
  return Object.assign(new Error(message), { code: 'ERR_DLOPEN_FAILED' });
}

test('an old system C library is explained, with the minimum and the fact that notes still work', () => {
  const problem = describeSearchIndexFailure(
    dlopenError("/lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.34' not found (required by better_sqlite3.node)"),
    'linux',
  );
  assert.equal(problem.kind, 'native-library');
  assert.match(problem.title, /Search is off/);
  assert.match(problem.body, /glibc 2\.34 or newer/);
  assert.match(problem.body, /notes still open/);
});

test('any native search library that cannot load is reported the same way', () => {
  const problem = describeSearchIndexFailure(dlopenError('better_sqlite3.node: wrong ELF class: ELFCLASS64'), 'linux');
  assert.equal(problem.kind, 'native-library');
  assert.doesNotMatch(problem.body, /glibc/, 'only a missing GLIBC version points at the system library');
  const mac = describeSearchIndexFailure(dlopenError('dlopen(better_sqlite3.node): incompatible architecture'), 'darwin');
  assert.equal(mac.kind, 'native-library');
  assert.doesNotMatch(mac.body, /glibc/, 'glibc advice only applies to Linux');
});

test('other index failures are not mistaken for an old system', () => {
  assert.equal(describeSearchIndexFailure(new Error('database disk image is malformed'), 'linux'), null);
  assert.equal(describeSearchIndexFailure(null, 'linux'), null);
});

test('the renderer receives the search problem with its preferences', async () => {
  const ipcMain = new EventEmitter();
  const handlers = new Map();
  ipcMain.handle = (channel, fn) => handlers.set(channel, fn);
  const problem = { kind: 'native-library', title: 'Search is off on this computer', body: 'x' };
  registerPreferencesHandlers(ipcMain, {
    wrap: fn => fn,
    store: { getPrefs: async () => ({ aiConfig: null, activeVaultId: 'v1' }) },
    ai: {},
    getSearchIndexProblem: () => problem,
  });

  const prefs = await handlers.get('mn:getPrefs')();
  assert.deepEqual(prefs.searchIndexProblem, problem);
});
