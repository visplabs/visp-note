const NO_KEY_STORE = 'No system key store is available on this computer';
const PLAIN_FILE = "stored without encryption, in VispNote's settings file";

const COPY = {
  unreadable: () => ({
    sub: 'The saved key could not be read on this computer. Paste it again, or remove it.',
    placeholder: 'Saved key could not be read. Paste it again.',
    warn: true,
    canRemove: true,
  }),
  encrypted: () => ({
    sub: "Encrypted with this computer's key store. It is used only from this app.",
    warn: false,
    canRemove: true,
  }),
  plain: available => ({
    sub: available
      ? "This key is stored without encryption on this computer, in VispNote's settings file. VispNote encrypts it the next time it starts."
      : `${NO_KEY_STORE}, so this API key is ${PLAIN_FILE}.`,
    warn: true,
    canRemove: true,
  }),
  none: available => ({
    sub: available
      ? "A key you paste here will be encrypted with this computer's key store."
      : `${NO_KEY_STORE}, so a key you paste here is ${PLAIN_FILE}.`,
    warn: !available,
    canRemove: false,
  }),
};

function mnApiKeyStorageCopy(keyStorage, keyField) {
  const state = keyStorage?.keys?.[keyField];
  if (!COPY[state]) return { sub: 'Saved on this computer. It is used only from this app.', warn: false, canRemove: false };
  return COPY[state](keyStorage.available === true);
}

function mnApiKeySaveOnBlur({ dirty, value }) {
  return dirty === true && String(value || '').trim() !== '';
}

export { mnApiKeyStorageCopy, mnApiKeySaveOnBlur };
