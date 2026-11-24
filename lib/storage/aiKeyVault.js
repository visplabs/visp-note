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

function keyFieldsIn(patch) {
  return AI_KEY_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(patch, field));
}

function assertKeyField(field) {
  if (!AI_KEY_FIELDS.includes(field)) throw new Error('Unknown AI key field');
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

  function needsReEncrypt(sealed) {
    return typeof codec.reEncryptNeeded === 'function' && codec.reEncryptNeeded(sealed) === true;
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
    for (const field of AI_KEY_FIELDS) {
      const value = plainKey(cfg, field) || (sealed[field] ? await tryDecrypt(sealed[field]) : null);
      if (value) keys[field] = value;
    }
    return keys;
  }

  async function keyState(cfg, sealed, field) {
    if (plainKey(cfg, field)) return 'plain';
    if (!sealed[field]) return 'none';
    return (await tryDecrypt(sealed[field])) === null ? 'unreadable' : 'encrypted';
  }

  async function status(cfg) {
    const sealed = sealedKeys(cfg);
    const keys = {};
    for (const field of AI_KEY_FIELDS) keys[field] = await keyState(cfg, sealed, field);
    return { available: await canEncrypt(), keys };
  }

  async function writeFor(existingSealed, value) {
    if (existingSealed && (await tryDecrypt(existingSealed)) === value) return { sealed: existingSealed };
    const sealed = await canEncrypt() ? await sealVerified(value) : null;
    return sealed ? { sealed } : { plain: value };
  }

  async function prepareKeyWrites(cfg, patch) {
    const sealed = sealedKeys(cfg);
    const writes = {};
    for (const field of keyFieldsIn(patch)) {
      const value = String(patch[field] ?? '');
      if (value) writes[field] = await writeFor(sealed[field], value);
    }
    return writes;
  }

  function applyKeyWrites(cfg, aiConfig, patch, writes) {
    const sealed = sealedKeys(cfg);
    for (const field of keyFieldsIn(patch)) {
      const write = writes[field];
      if (!write) {
        if (plainKey(cfg, field)) aiConfig[field] = plainKey(cfg, field);
        else delete aiConfig[field];
      } else if (write.sealed) {
        sealed[field] = write.sealed;
        delete aiConfig[field];
      } else {
        delete sealed[field];
        aiConfig[field] = write.plain;
      }
    }
    writeSealedKeys(cfg, sealed);
  }

  function removeKey(cfg, field) {
    assertKeyField(field);
    const sealed = sealedKeys(cfg);
    delete sealed[field];
    writeSealedKeys(cfg, sealed);
    if (isPlainObject(cfg.aiConfig)) delete cfg.aiConfig[field];
  }

  async function prepareSealing(cfg) {
    const plainFields = AI_KEY_FIELDS.filter(field => plainKey(cfg, field));
    if (!plainFields.length || !await canEncrypt()) return {};
    const sealed = sealedKeys(cfg);
    const writes = {};
    for (const field of plainFields) {
      const write = await writeFor(sealed[field], plainKey(cfg, field));
      if (write.sealed) writes[field] = { plain: plainKey(cfg, field), sealed: write.sealed };
    }
    return writes;
  }

  function applySealing(cfg, writes) {
    const sealed = sealedKeys(cfg);
    for (const [field, write] of Object.entries(writes)) {
      if (plainKey(cfg, field) === write.plain) sealed[field] = write.sealed;
    }
    writeSealedKeys(cfg, sealed);
  }

  async function verifiedPlainKeys(cfg) {
    const sealed = sealedKeys(cfg);
    const verified = {};
    for (const field of AI_KEY_FIELDS) {
      const plain = plainKey(cfg, field);
      if (plain && sealed[field] && (await tryDecrypt(sealed[field])) === plain) verified[field] = plain;
    }
    return verified;
  }

  function dropPlainKeys(cfg, verified) {
    for (const [field, plain] of Object.entries(verified)) {
      if (plainKey(cfg, field) === plain) delete cfg.aiConfig[field];
    }
  }

  async function prepareReEncryption(cfg) {
    const sealed = sealedKeys(cfg);
    const writes = {};
    for (const field of AI_KEY_FIELDS) {
      if (!sealed[field] || plainKey(cfg, field)) continue;
      const value = await tryDecrypt(sealed[field]);
      if (value === null || !needsReEncrypt(sealed[field])) continue;
      const next = await sealVerified(value);
      if (next) writes[field] = { previous: sealed[field], sealed: next };
    }
    return writes;
  }

  function applyReEncryption(cfg, writes) {
    const sealed = sealedKeys(cfg);
    for (const [field, write] of Object.entries(writes)) {
      if (sealed[field] === write.previous) sealed[field] = write.sealed;
    }
    writeSealedKeys(cfg, sealed);
  }

  return {
    configure, readKeys, status, prepareKeyWrites, applyKeyWrites, removeKey,
    prepareSealing, applySealing, verifiedPlainKeys, dropPlainKeys,
    prepareReEncryption, applyReEncryption,
  };
}

module.exports = { createAiKeyVault, AI_KEY_FIELDS, SEALED_KEYS_FIELD };
