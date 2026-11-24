// On Linux without a secret service, safeStorage falls back to the basic_text
// backend, whose key is a constant built into Chromium: that is not encryption.
const UNPROTECTED_LINUX_BACKENDS = new Set(['basic_text', 'unknown']);
// A secret service that is running but not answering leaves safeStorage's
// promises pending forever, which would hold the app's start-up with them.
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

  async function checkAvailability() {
    try {
      if (!await withTimeout(safeStorage.isAsyncEncryptionAvailable(), timeoutMs)) return false;
    } catch {
      return false;
    }
    if (platform !== 'linux') return true;
    return !UNPROTECTED_LINUX_BACKENDS.has(safeStorage.getSelectedStorageBackend());
  }

  function canEncrypt() {
    if (!availability) availability = checkAvailability();
    return availability;
  }

  async function encrypt(text) {
    const sealed = await withTimeout(safeStorage.encryptStringAsync(String(text)), timeoutMs);
    return Buffer.from(sealed).toString('base64');
  }

  async function decrypt(sealed) {
    const { result } = await withTimeout(safeStorage.decryptStringAsync(Buffer.from(String(sealed), 'base64')), timeoutMs);
    return result;
  }

  return { canEncrypt, encrypt, decrypt };
}

module.exports = { createSafeStorageCodec };
