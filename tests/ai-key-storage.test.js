const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

const { withIsolatedStore } = require('./helpers/common.js');
const { createSafeStorageCodec } = require('../main/safeStorageCodec');
const { registerAiHandlers } = require('../lib/connectors/ipc/aiHandlers');

const FAKE_KEY = 'sk-test-made-up-key-0001';
const OTHER_FAKE_KEY = 'sk-test-made-up-key-0002';
const SEALED_PREFIX = 'sealed:';

function fakeCodec({ available = true, breakVerification = false } = {}) {
  return {
    async canEncrypt() { return available; },
    async encrypt(text) {
      return SEALED_PREFIX + Buffer.from(String(text).split('').reverse().join(''), 'utf8').toString('base64');
    },
    async decrypt(sealed) {
      if (!String(sealed).startsWith(SEALED_PREFIX)) throw new Error('cannot decrypt');
      const plain = Buffer.from(String(sealed).slice(SEALED_PREFIX.length), 'base64').toString('utf8').split('').reverse().join('');
      return breakVerification ? `${plain}-garbled` : plain;
    },
  };
}

function readConfigText(store) {
  return fs.readFileSync(store.__test.CONFIG_FILE, 'utf8');
}

function readConfig(store) {
  return JSON.parse(readConfigText(store));
}

async function reopen(store) {
  store.__test.clearConfigCache();
  await store.loadConfig();
}

test('fresh install: a new key is written encrypted and read back for the main process', async () => {
  await withIsolatedStore(async (store) => {
    store.configureAiKeyCodec(fakeCodec());
    await store.setPrefs({ aiConfig: { provider: 'openai', openaiApiKey: FAKE_KEY } });

    assert.equal(readConfigText(store).includes(FAKE_KEY), false, 'the key must not be on disk in plain text');
    assert.equal(readConfig(store).aiConfig.openaiApiKey, undefined);

    await reopen(store);
    const prefs = await store.getPrefs();
    assert.equal(prefs.aiConfig.openaiApiKey, FAKE_KEY);
    assert.equal(prefs.aiConfig.provider, 'openai');
    assert.deepEqual(await store.aiKeyStorage(), { encrypted: true, unreadable: [] });
  });
});

test('migration: a key left in plain text by an older version is encrypted, then the plain copy is removed', async () => {
  await withIsolatedStore(async (store) => {
    store.configureAiKeyCodec(fakeCodec({ available: false }));
    await store.setPrefs({ aiConfig: { provider: 'anthropic', anthropicApiKey: FAKE_KEY } });
    assert.equal(readConfig(store).aiConfig.anthropicApiKey, FAKE_KEY, 'precondition: an old-style plain key');

    await reopen(store);
    store.configureAiKeyCodec(fakeCodec());
    await store.migrateAiKeys();

    assert.equal(readConfigText(store).includes(FAKE_KEY), false);
    await reopen(store);
    assert.equal((await store.getPrefs()).aiConfig.anthropicApiKey, FAKE_KEY);
  });
});

test('migration keeps the plain key when the encrypted copy does not read back the same', async () => {
  await withIsolatedStore(async (store) => {
    store.configureAiKeyCodec(fakeCodec({ available: false }));
    await store.setPrefs({ aiConfig: { provider: 'gemini', geminiApiKey: FAKE_KEY } });

    await reopen(store);
    store.configureAiKeyCodec(fakeCodec({ breakVerification: true }));
    await store.migrateAiKeys();

    assert.equal(readConfig(store).aiConfig.geminiApiKey, FAKE_KEY, 'an unverified encryption must never cost the key');
    assert.equal((await store.getPrefs()).aiConfig.geminiApiKey, FAKE_KEY);
  });
});

test('changing a key replaces the encrypted copy', async () => {
  await withIsolatedStore(async (store) => {
    store.configureAiKeyCodec(fakeCodec());
    await store.setPrefs({ aiConfig: { provider: 'openrouter', openrouterApiKey: FAKE_KEY } });
    const firstSealed = readConfig(store).aiKeysEncrypted.openrouterApiKey;

    await store.setPrefs({ aiConfig: { openrouterApiKey: OTHER_FAKE_KEY } });

    const text = readConfigText(store);
    assert.equal(text.includes(OTHER_FAKE_KEY), false);
    assert.notEqual(readConfig(store).aiKeysEncrypted.openrouterApiKey, firstSealed);
    await reopen(store);
    assert.equal((await store.getPrefs()).aiConfig.openrouterApiKey, OTHER_FAKE_KEY);
  });
});

test('removing a key deletes both the encrypted and any plain copy', async () => {
  await withIsolatedStore(async (store) => {
    store.configureAiKeyCodec(fakeCodec());
    await store.setPrefs({ aiConfig: { provider: 'custom', customApiKey: FAKE_KEY } });

    await store.setPrefs({ aiConfig: { customApiKey: '' } });

    const saved = readConfig(store);
    assert.equal(saved.aiKeysEncrypted?.customApiKey, undefined);
    assert.ok(!saved.aiConfig.customApiKey);
    await reopen(store);
    assert.ok(!(await store.getPrefs()).aiConfig.customApiKey);
  });
});

test('without a system key store the key still works, is kept, and the storage is reported as unencrypted', async () => {
  await withIsolatedStore(async (store) => {
    store.configureAiKeyCodec(fakeCodec({ available: false }));
    await store.setPrefs({ aiConfig: { provider: 'openai', openaiApiKey: FAKE_KEY } });
    await store.migrateAiKeys();

    await reopen(store);
    assert.equal((await store.getPrefs()).aiConfig.openaiApiKey, FAKE_KEY);
    assert.deepEqual(await store.aiKeyStorage(), { encrypted: false, unreadable: [] });
  });
});

test('a corrupted encrypted key is reported as unreadable, kept on disk, and can be replaced', async () => {
  await withIsolatedStore(async (store) => {
    store.configureAiKeyCodec(fakeCodec());
    await store.setPrefs({ aiConfig: { provider: 'openai', openaiApiKey: FAKE_KEY } });
    const broken = readConfig(store);
    broken.aiKeysEncrypted.openaiApiKey = 'not-a-sealed-value';
    fs.writeFileSync(store.__test.CONFIG_FILE, JSON.stringify(broken));

    await reopen(store);
    const prefs = await store.getPrefs();
    assert.ok(!prefs.aiConfig.openaiApiKey);
    assert.deepEqual(await store.aiKeyStorage(), { encrypted: true, unreadable: ['openaiApiKey'] });

    await store.setPrefs({ aiConfig: { provider: 'openai', chatModel: 'gpt-test' } });
    assert.equal(readConfig(store).aiKeysEncrypted.openaiApiKey, 'not-a-sealed-value', 'an unrelated save keeps the unreadable copy');

    await store.setPrefs({ aiConfig: { openaiApiKey: OTHER_FAKE_KEY } });
    await reopen(store);
    assert.equal((await store.getPrefs()).aiConfig.openaiApiKey, OTHER_FAKE_KEY);
    assert.deepEqual((await store.aiKeyStorage()).unreadable, []);
  });
});

test('the renderer receives a masked key and the storage status, never the key itself', async () => {
  await withIsolatedStore(async (store) => {
    store.configureAiKeyCodec(fakeCodec({ available: false }));
    const ai = require('../lib/ai');
    const ipcMain = new EventEmitter();
    const handlers = new Map();
    ipcMain.handle = (channel, fn) => handlers.set(channel, fn);
    const wrap = fn => async (...args) => ({ ok: true, value: await fn(...args) });
    registerAiHandlers(ipcMain, { wrap, wrapWithEvent: wrap, ai, store });

    const saved = await handlers.get('mn:ai.setConfig')({ provider: 'openai', openaiApiKey: FAKE_KEY });
    const loaded = await handlers.get('mn:ai.getConfig')();

    for (const response of [saved, loaded]) {
      assert.equal(JSON.stringify(response).includes(FAKE_KEY), false);
      assert.equal(response.value.openaiApiKey, 'configured');
      assert.deepEqual(response.value.keyStorage, { encrypted: false, unreadable: [] });
    }
    ai.applyConfig({ provider: 'ollama', enabled: false });
  });
});

function fakeSafeStorage({ available = true, backend = 'gnome_libsecret' } = {}) {
  return {
    async isAsyncEncryptionAvailable() { return available; },
    getSelectedStorageBackend() { return backend; },
    async encryptStringAsync(text) { return Buffer.from(`x${text}`, 'utf8'); },
    async decryptStringAsync(buffer) { return { shouldReEncrypt: false, result: buffer.toString('utf8').slice(1) }; },
  };
}

test('the Electron codec treats a Linux basic_text store as no encryption', async () => {
  const secure = createSafeStorageCodec({ safeStorage: fakeSafeStorage(), platform: 'linux' });
  assert.equal(await secure.canEncrypt(), true);
  assert.equal(await secure.decrypt(await secure.encrypt(FAKE_KEY)), FAKE_KEY);

  for (const backend of ['basic_text', 'unknown']) {
    const weak = createSafeStorageCodec({ safeStorage: fakeSafeStorage({ backend }), platform: 'linux' });
    assert.equal(await weak.canEncrypt(), false, `${backend} must not count as encrypted`);
  }

  const missing = createSafeStorageCodec({ safeStorage: fakeSafeStorage({ available: false }), platform: 'win32' });
  assert.equal(await missing.canEncrypt(), false);
  const windows = createSafeStorageCodec({ safeStorage: fakeSafeStorage({ backend: 'basic_text' }), platform: 'win32' });
  assert.equal(await windows.canEncrypt(), true, 'the Linux backend name is irrelevant elsewhere');
});

test('an unresponsive key store counts as unavailable instead of holding up the app', async () => {
  const hung = {
    ...fakeSafeStorage(),
    isAsyncEncryptionAvailable: () => new Promise(() => {}),
    decryptStringAsync: () => new Promise(() => {}),
  };
  const codec = createSafeStorageCodec({ safeStorage: hung, platform: 'linux', timeoutMs: 20 });

  assert.equal(await codec.canEncrypt(), false);
  await assert.rejects(codec.decrypt('c2VhbGVk'), /did not answer/);
});
