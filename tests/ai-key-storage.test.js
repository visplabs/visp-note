const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

const { withIsolatedStore } = require('./helpers/common.js');
const { registerAiHandlers } = require('../lib/connectors/ipc/aiHandlers');

const FAKE_KEY = 'sk-test-made-up-key-0001';
const OTHER_FAKE_KEY = 'sk-test-made-up-key-0002';
const SEALED_PREFIX = 'sealed:';
const NO_KEYS = {
  openaiApiKey: 'none', openrouterApiKey: 'none', anthropicApiKey: 'none', geminiApiKey: 'none', customApiKey: 'none',
};

function seal(text) {
  return SEALED_PREFIX + Buffer.from(String(text).split('').reverse().join(''), 'utf8').toString('base64');
}

function unseal(sealed) {
  if (!String(sealed).startsWith(SEALED_PREFIX)) throw new Error('cannot decrypt');
  return Buffer.from(String(sealed).slice(SEALED_PREFIX.length), 'base64').toString('utf8').split('').reverse().join('');
}

let encryptions = 0;

function fakeCodec({ available = true, breakVerification = false, decryptable = true, reEncrypt = () => false } = {}) {
  return {
    async canEncrypt() { return available; },
    async encrypt(text) {
      encryptions += 1;
      return `${seal(text)}#${encryptions}`;
    },
    async decrypt(sealed) {
      if (!decryptable) throw new Error('key store locked');
      const plain = unseal(String(sealed).split('#')[0]);
      return breakVerification ? `${plain}-garbled` : plain;
    },
    reEncryptNeeded: sealed => reEncrypt(sealed),
  };
}

function readConfigText(store) {
  return fs.readFileSync(store.__test.CONFIG_FILE, 'utf8');
}

function readConfig(store) {
  return JSON.parse(readConfigText(store));
}

function writeConfig(store, cfg) {
  fs.writeFileSync(store.__test.CONFIG_FILE, JSON.stringify(cfg));
}

async function reopen(store) {
  store.__test.clearConfigCache();
  await store.loadConfig();
}

async function savedSealedKey(store, field, key, codec = fakeCodec()) {
  store.configureAiKeyCodec(codec);
  await store.setPrefs({ aiConfig: { provider: 'openai', [field]: key } });
  return readConfig(store).aiKeysEncrypted[field];
}

test('fresh install: a new key is written encrypted and loaded back for the main process', async () => {
  await withIsolatedStore(async (store) => {
    await savedSealedKey(store, 'openaiApiKey', FAKE_KEY);

    assert.equal(readConfigText(store).includes(FAKE_KEY), false, 'the key must not be on disk in plain text');
    await reopen(store);
    assert.deepEqual(await store.loadAiKeys(), { openaiApiKey: FAKE_KEY });
    assert.deepEqual(await store.aiKeyStorage(), { available: true, keys: { ...NO_KEYS, openaiApiKey: 'encrypted' } });
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
    assert.deepEqual(await store.loadAiKeys(), { anthropicApiKey: FAKE_KEY });
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
    assert.deepEqual(await store.loadAiKeys(), { geminiApiKey: FAKE_KEY });
  });
});

test('migration re-encrypts a key the key store asks to re-encrypt', async () => {
  await withIsolatedStore(async (store) => {
    const first = await savedSealedKey(store, 'openaiApiKey', FAKE_KEY);

    store.configureAiKeyCodec(fakeCodec({ reEncrypt: sealed => sealed === first }));
    await store.migrateAiKeys();

    const next = readConfig(store).aiKeysEncrypted.openaiApiKey;
    assert.notEqual(next, first);
    assert.deepEqual(await store.loadAiKeys(), { openaiApiKey: FAKE_KEY });
  });
});

test('changing a key replaces the encrypted copy', async () => {
  await withIsolatedStore(async (store) => {
    const first = await savedSealedKey(store, 'openrouterApiKey', FAKE_KEY);

    await store.setPrefs({ aiConfig: { openrouterApiKey: OTHER_FAKE_KEY } });

    assert.equal(readConfigText(store).includes(OTHER_FAKE_KEY), false);
    assert.notEqual(readConfig(store).aiKeysEncrypted.openrouterApiKey, first);
    await reopen(store);
    assert.deepEqual(await store.loadAiKeys(), { openrouterApiKey: OTHER_FAKE_KEY });
  });
});

test('an empty key value never deletes a saved key, readable or not', async () => {
  await withIsolatedStore(async (store) => {
    const readable = await savedSealedKey(store, 'customApiKey', FAKE_KEY);
    await store.setPrefs({ aiConfig: { customApiKey: '' } });
    assert.equal(readConfig(store).aiKeysEncrypted.customApiKey, readable);

    const unreadable = await savedSealedKey(store, 'openaiApiKey', OTHER_FAKE_KEY);
    await reopen(store);
    store.configureAiKeyCodec(fakeCodec({ decryptable: false }));
    await store.setPrefs({ aiConfig: { openaiApiKey: '' } });
    assert.equal(readConfig(store).aiKeysEncrypted.openaiApiKey, unreadable, 'an unreadable key must survive an empty field');

    store.configureAiKeyCodec(fakeCodec({ available: false }));
    await store.setPrefs({ aiConfig: { provider: 'gemini', geminiApiKey: FAKE_KEY } });
    await store.setPrefs({ aiConfig: { geminiApiKey: '' } });
    assert.equal(readConfig(store).aiConfig.geminiApiKey, FAKE_KEY, 'a plain key must survive an empty field too');
  });
});

test('removing a key is an explicit action that deletes the encrypted and any plain copy', async () => {
  await withIsolatedStore(async (store) => {
    await savedSealedKey(store, 'customApiKey', FAKE_KEY);
    store.configureAiKeyCodec(fakeCodec({ decryptable: false }));

    await store.removeAiKey('customApiKey');

    const saved = readConfig(store);
    assert.equal(saved.aiKeysEncrypted?.customApiKey, undefined);
    assert.ok(!saved.aiConfig.customApiKey);
    await assert.rejects(store.removeAiKey('chatModel'), /Unknown AI key field/);
  });
});

test('an unchanged key stays encrypted when the key store is slow or unavailable at save time', async () => {
  await withIsolatedStore(async (store) => {
    const sealed = await savedSealedKey(store, 'openaiApiKey', FAKE_KEY);

    store.configureAiKeyCodec({ ...fakeCodec(), canEncrypt: async () => false });
    await store.setPrefs({ aiConfig: { provider: 'openai', chatModel: 'gpt-test', openaiApiKey: FAKE_KEY } });

    const saved = readConfig(store);
    assert.equal(saved.aiKeysEncrypted.openaiApiKey, sealed);
    assert.equal(saved.aiConfig.openaiApiKey, undefined, 'an unchanged key must never fall back to plain text');
  });
});

test('without a system key store the key still works, is kept, and is reported as plain text', async () => {
  await withIsolatedStore(async (store) => {
    store.configureAiKeyCodec(fakeCodec({ available: false }));
    await store.setPrefs({ aiConfig: { provider: 'openai', openaiApiKey: FAKE_KEY } });
    await store.migrateAiKeys();

    await reopen(store);
    assert.deepEqual(await store.loadAiKeys(), { openaiApiKey: FAKE_KEY });
    assert.deepEqual(await store.aiKeyStorage(), { available: false, keys: { ...NO_KEYS, openaiApiKey: 'plain' } });
  });
});

test('the status reports each key as it is on disk, not what the key store could do', async () => {
  await withIsolatedStore(async (store) => {
    store.configureAiKeyCodec(fakeCodec({ available: false }));
    await store.setPrefs({ aiConfig: { provider: 'openai', openaiApiKey: FAKE_KEY } });
    store.configureAiKeyCodec(fakeCodec());
    await store.setPrefs({ aiConfig: { anthropicApiKey: OTHER_FAKE_KEY } });

    const storage = await store.aiKeyStorage();
    assert.equal(storage.available, true);
    assert.equal(storage.keys.openaiApiKey, 'plain', 'a key store being available does not make an old key encrypted');
    assert.equal(storage.keys.anthropicApiKey, 'encrypted');
  });
});

test('a corrupted encrypted key is reported as unreadable, kept on disk, and can be replaced', async () => {
  await withIsolatedStore(async (store) => {
    await savedSealedKey(store, 'openaiApiKey', FAKE_KEY);
    const broken = readConfig(store);
    broken.aiKeysEncrypted.openaiApiKey = 'not-a-sealed-value';
    writeConfig(store, broken);

    await reopen(store);
    assert.deepEqual(await store.loadAiKeys(), {});
    assert.equal((await store.aiKeyStorage()).keys.openaiApiKey, 'unreadable');

    await store.setPrefs({ aiConfig: { provider: 'openai', chatModel: 'gpt-test' } });
    assert.equal(readConfig(store).aiKeysEncrypted.openaiApiKey, 'not-a-sealed-value', 'an unrelated save keeps the unreadable copy');

    await store.setPrefs({ aiConfig: { openaiApiKey: OTHER_FAKE_KEY } });
    await reopen(store);
    assert.deepEqual(await store.loadAiKeys(), { openaiApiKey: OTHER_FAKE_KEY });
    assert.equal((await store.aiKeyStorage()).keys.openaiApiKey, 'encrypted');
  });
});

test('reading preferences never waits on the key store', async () => {
  await withIsolatedStore(async (store) => {
    await savedSealedKey(store, 'openaiApiKey', FAKE_KEY);
    store.configureAiKeyCodec({ ...fakeCodec(), canEncrypt: () => new Promise(() => {}), decrypt: () => new Promise(() => {}) });

    const prefs = await Promise.race([
      store.getPrefs(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getPrefs waited on the key store')), 500)),
    ]);
    assert.equal(prefs.aiConfig.provider, 'openai');
    assert.equal(prefs.aiConfig.openaiApiKey, undefined);
  });
});

test('sealing a key does not hold other settings writes', async () => {
  await withIsolatedStore(async (store) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const codec = fakeCodec();
    store.configureAiKeyCodec({ ...codec, encrypt: async text => { await gate; return codec.encrypt(text); } });

    const saving = store.setPrefs({ aiConfig: { provider: 'openai', openaiApiKey: FAKE_KEY } });
    await new Promise(resolve => setTimeout(resolve, 20));
    const other = await Promise.race([
      store.recordBackupExport('2026-11-25T00:00:00.000Z').then(() => 'written'),
      new Promise(resolve => setTimeout(() => resolve('blocked'), 500)),
    ]);
    release();
    await saving;

    assert.equal(other, 'written');
    assert.equal(readConfig(store).lastBackupAt, '2026-11-25T00:00:00.000Z');
    assert.ok(readConfig(store).aiKeysEncrypted.openaiApiKey);
  });
});

function aiHandlersFor(store) {
  const ai = require('../lib/ai');
  const ipcMain = new EventEmitter();
  const handlers = new Map();
  ipcMain.handle = (channel, fn) => handlers.set(channel, fn);
  const wrap = fn => async (...args) => ({ ok: true, value: await fn(...args) });
  registerAiHandlers(ipcMain, { wrap, wrapWithEvent: wrap, ai, store });
  return { ai, handlers };
}

test('the renderer receives a masked key and the storage status, never the key itself', async () => {
  await withIsolatedStore(async (store) => {
    store.configureAiKeyCodec(fakeCodec({ available: false }));
    const { ai, handlers } = aiHandlersFor(store);

    const saved = await handlers.get('mn:ai.setConfig')({ provider: 'openai', openaiApiKey: FAKE_KEY });
    const loaded = await handlers.get('mn:ai.getConfig')();

    for (const response of [saved, loaded]) {
      assert.equal(JSON.stringify(response).includes(FAKE_KEY), false);
      assert.equal(response.value.openaiApiKey, 'configured');
      assert.deepEqual(response.value.keyStorage, { available: false, keys: { ...NO_KEYS, openaiApiKey: 'plain' } });
    }
    ai.applyConfig({ provider: 'ollama', enabled: false });
  });
});

test('the remove-key request deletes the key and clears it from the running AI config', async () => {
  await withIsolatedStore(async (store) => {
    store.configureAiKeyCodec(fakeCodec());
    const { ai, handlers } = aiHandlersFor(store);
    await handlers.get('mn:ai.setConfig')({ provider: 'openai', openaiApiKey: FAKE_KEY });

    const removed = await handlers.get('mn:ai.removeApiKey')('openaiApiKey');

    assert.equal(removed.value.openaiApiKey, '');
    assert.equal(removed.value.keyStorage.keys.openaiApiKey, 'none');
    assert.equal(ai.getConfig().openaiApiKey, '');
    assert.equal(readConfig(store).aiKeysEncrypted?.openaiApiKey, undefined);
    ai.applyConfig({ provider: 'ollama', enabled: false });
  });
});
