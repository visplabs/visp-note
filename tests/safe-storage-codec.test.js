const test = require('node:test');
const assert = require('node:assert/strict');

const { createSafeStorageCodec } = require('../main/safeStorageCodec');

const FAKE_KEY = 'sk-test-made-up-key-0001';

function fakeSafeStorage({ available = true, backend = 'gnome_libsecret', shouldReEncrypt = false } = {}) {
  const calls = { decrypt: 0 };
  return {
    calls,
    async isAsyncEncryptionAvailable() { return available; },
    getSelectedStorageBackend() { return backend; },
    async encryptStringAsync(text) { return Buffer.from(`x${text}`, 'utf8'); },
    async decryptStringAsync(buffer) {
      calls.decrypt += 1;
      return { shouldReEncrypt, result: buffer.toString('utf8').slice(1) };
    },
  };
}

function later(ms, value) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

test('a Linux basic_text store, which Electron uses on unrecognised desktops, counts as no encryption', async () => {
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

test('a slow key store is asked again later instead of being remembered as absent', async () => {
  const slow = { ...fakeSafeStorage(), isAsyncEncryptionAvailable: () => later(60, true) };
  const codec = createSafeStorageCodec({ safeStorage: slow, platform: 'linux', timeoutMs: 20 });

  assert.equal(await codec.canEncrypt(), false, 'the first check times out');
  await later(80);
  assert.equal(await codec.canEncrypt(), true, 'the late answer counts');
});

test('a late decrypt result is kept, and each value is decrypted once per session', async () => {
  const store = fakeSafeStorage();
  const decryptOnce = store.decryptStringAsync;
  store.decryptStringAsync = async buffer => { await later(60); return decryptOnce(buffer); };
  const codec = createSafeStorageCodec({ safeStorage: store, platform: 'linux', timeoutMs: 20 });
  const sealed = await codec.encrypt(FAKE_KEY);

  await assert.rejects(codec.decrypt(sealed), /did not answer/);
  await later(80);
  assert.equal(await codec.decrypt(sealed), FAKE_KEY);
  assert.equal(await codec.decrypt(sealed), FAKE_KEY);
  assert.equal(store.calls.decrypt, 1);
});

test('a decrypt failure is remembered for the session instead of asking the key store again', async () => {
  let attempts = 0;
  const failing = { ...fakeSafeStorage(), decryptStringAsync: async () => { attempts += 1; throw new Error('locked'); } };
  const codec = createSafeStorageCodec({ safeStorage: failing, platform: 'linux', timeoutMs: 20 });

  await assert.rejects(codec.decrypt('c2VhbGVk'), /locked/);
  await assert.rejects(codec.decrypt('c2VhbGVk'), /locked/);
  assert.equal(attempts, 1);
});

test('the codec passes on a request to re-encrypt', async () => {
  const codec = createSafeStorageCodec({ safeStorage: fakeSafeStorage({ shouldReEncrypt: true }), platform: 'linux' });
  const sealed = await codec.encrypt(FAKE_KEY);

  assert.equal(codec.reEncryptNeeded(sealed), false, 'unknown until the value has been decrypted');
  await codec.decrypt(sealed);
  assert.equal(codec.reEncryptNeeded(sealed), true);
});
