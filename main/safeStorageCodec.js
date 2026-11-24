// Electron uses the basic_text backend when it does not recognise the Linux desktop
// (sway, i3, ...) or no secret service is reachable. Its key is a constant built into
// Chromium, so values "encrypted" with it are not protected.
const UNPROTECTED_LINUX_BACKENDS = new Set(['basic_text', 'unknown']);
// A secret service that is running but not answering leaves safeStorage's promises
// pending; callers stop waiting after this long, and a late answer is still used.
const KEY_STORE_TIMEOUT_MS = 5000;

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('The system key store did not answer')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createSafeStorageCodec({ safeStorage, platform, timeoutMs = KEY_STORE_TIMEOUT_MS }) {
  let availability = null;
  const decryptions = new Map();
  const reEncrypt = new Set();

  function backendProtects() {
    return platform !== 'linux' || !UNPROTECTED_LINUX_BACKENDS.has(safeStorage.getSelectedStorageBackend());
  }

  function availabilityProbe() {
    if (!availability) {
      availability = Promise.resolve()
        .then(() => safeStorage.isAsyncEncryptionAvailable())
        .then(available => available === true && backendProtects(), () => false);
    }
    return availability;
  }

  function canEncrypt() {
    return withTimeout(availabilityProbe(), timeoutMs).catch(() => false);
  }

  async function encrypt(text) {
    const sealed = await withTimeout(safeStorage.encryptStringAsync(String(text)), timeoutMs);
    return Buffer.from(sealed).toString('base64');
  }

  function decryption(sealed) {
    if (!decryptions.has(sealed)) {
      const pending = Promise.resolve()
        .then(() => safeStorage.decryptStringAsync(Buffer.from(sealed, 'base64')))
        .then(({ result, shouldReEncrypt }) => {
          if (shouldReEncrypt) reEncrypt.add(sealed);
          return result;
        });
      pending.catch(() => {});
      decryptions.set(sealed, pending);
    }
    return decryptions.get(sealed);
  }

  function decrypt(sealed) {
    return withTimeout(decryption(String(sealed)), timeoutMs);
  }

  function reEncryptNeeded(sealed) {
    return reEncrypt.has(String(sealed));
  }

  return { canEncrypt, encrypt, decrypt, reEncryptNeeded };
}

module.exports = { createSafeStorageCodec };
