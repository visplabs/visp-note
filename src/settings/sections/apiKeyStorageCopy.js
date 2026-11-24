function mnApiKeyStorageCopy(keyStorage, keyField) {
  const unreadable = Array.isArray(keyStorage?.unreadable) && keyStorage.unreadable.includes(keyField);
  if (unreadable) {
    return {
      sub: 'The saved key could not be read on this computer. Paste it again to keep using this provider.',
      placeholder: 'Saved key could not be read. Paste it again.',
      warn: true,
      unreadable: true,
    };
  }
  if (keyStorage?.encrypted === true) {
    return {
      sub: "Encrypted with this computer's key store. It is used only from this app.",
      warn: false,
      unreadable: false,
    };
  }
  if (keyStorage?.encrypted === false) {
    return {
      sub: "No system key store was found, so this API key is stored without encryption on this computer, in VispNote's settings file.",
      warn: true,
      unreadable: false,
    };
  }
  return { sub: 'Saved on this computer. It is used only from this app.', warn: false, unreadable: false };
}

export { mnApiKeyStorageCopy };
