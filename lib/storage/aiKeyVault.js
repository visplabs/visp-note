const AI_KEY_FIELDS = Object.freeze([
  'openaiApiKey', 'openrouterApiKey', 'anthropicApiKey', 'geminiApiKey', 'customApiKey',
]);
const SEALED_KEYS_FIELD = 'aiKeysEncrypted';

const NO_KEY_STORE = Object.freeze({
  async canEncrypt() { return false; },
  async encrypt() { throw new Error('No key store is configured'); },
  async decrypt() { throw new Error('No key store is configured'); },
});

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sealedKeys(cfg) {
  return isPlainObject(cfg[SEALED_KEYS_FIELD]) ? { ...cfg[SEALED_KEYS_FIELD] } : {};
}

function writeSealedKeys(cfg, sealed) {
  if (Object.keys(sealed).length) cfg[SEALED_KEYS_FIELD] = sealed;
  else delete cfg[SEALED_KEYS_FIELD];
}

function plainKey(cfg, field) {
  return String(cfg.aiConfig?.[field] || '');
}

function createAiKeyVault() {
  let codec = NO_KEY_STORE;

  function configure(nextCodec) {
    codec = nextCodec || NO_KEY_STORE;
  }

  async function canEncrypt() {
    try {
      return (await codec.canEncrypt()) === true;
    } catch {
      return false;
    }
  }

  async function tryDecrypt(sealed) {
    try {
      return String(await codec.decrypt(sealed));
    } catch {
      return null;
    }
  }

  async function sealVerified(value) {
    try {
      const sealed = await codec.encrypt(value);
      return (await tryDecrypt(sealed)) === value ? sealed : null;
    } catch {
      return null;
    }
  }

  async function readKeys(cfg) {
    const sealed = sealedKeys(cfg);
    const keys = {};
    const unreadable = [];
    for (const field of AI_KEY_FIELDS) {
      const plain = plainKey(cfg, field);
      if (plain) {
        keys[field] = plain;
      } else if (sealed[field]) {
        const value = await tryDecrypt(sealed[field]);
        if (value === null) unreadable.push(field);
        else keys[field] = value;
      }
    }
    return { keys, unreadable };
  }

  async function aiConfigWithKeys(cfg) {
    const { keys } = await readKeys(cfg);
    if (!cfg.aiConfig && !Object.keys(keys).length) return null;
    return { ...(cfg.aiConfig || {}), ...keys };
  }

  async function status(cfg) {
    return { encrypted: await canEncrypt(), unreadable: (await readKeys(cfg)).unreadable };
  }

  async function sealedValueFor(sealed, field, value) {
    if (sealed[field] && (await tryDecrypt(sealed[field])) === value) return sealed[field];
    return sealVerified(value);
  }

  async function storeKey(cfg, aiConfig, field, value) {
    const sealed = sealedKeys(cfg);
    const next = value && await canEncrypt() ? await sealedValueFor(sealed, field, value) : null;
    if (next) {
      sealed[field] = next;
      delete aiConfig[field];
    } else {
      delete sealed[field];
      if (value) aiConfig[field] = value;
      else delete aiConfig[field];
    }
    writeSealedKeys(cfg, sealed);
  }

  async function storeKeys(cfg, aiConfig, patch) {
    for (const field of AI_KEY_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(patch, field)) {
        await storeKey(cfg, aiConfig, field, String(patch[field] ?? ''));
      }
    }
  }

  async function sealPlainKeys(cfg) {
    if (!await canEncrypt()) return;
    const sealed = sealedKeys(cfg);
    for (const field of AI_KEY_FIELDS) {
      const plain = plainKey(cfg, field);
      if (!plain) continue;
      const next = await sealedValueFor(sealed, field, plain);
      if (next) sealed[field] = next;
    }
    writeSealedKeys(cfg, sealed);
  }

  async function dropVerifiedPlainKeys(cfg) {
    const sealed = sealedKeys(cfg);
    for (const field of AI_KEY_FIELDS) {
      const plain = plainKey(cfg, field);
      if (plain && sealed[field] && (await tryDecrypt(sealed[field])) === plain) delete cfg.aiConfig[field];
    }
  }

  return { configure, aiConfigWithKeys, status, storeKeys, sealPlainKeys, dropVerifiedPlainKeys };
}

module.exports = { createAiKeyVault, AI_KEY_FIELDS, SEALED_KEYS_FIELD };
