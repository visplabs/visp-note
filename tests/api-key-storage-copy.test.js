const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadRendererModule } = require('./helpers/rendererModule.js');

const load = file => loadRendererModule(file, { React });
const { mnApiKeyStorageCopy, mnApiKeySaveOnBlur } = load('src/settings/sections/apiKeyField.js');
const { MnApiKeyRow } = load('src/settings/sections/ApiKeyRow.jsx');
const { MN_THEMES } = load('src/shared/theme.jsx');
const T = MN_THEMES.light;

const storage = (available, state) => ({ available, keys: { openaiApiKey: state } });

function renderRow(config) {
  return renderToStaticMarkup(React.createElement(MnApiKeyRow, {
    T, label: 'OpenAI API key', keyField: 'openaiApiKey', config,
    onChange() {}, onSave() {}, onRemove() {},
  }));
}

test('an encrypted key is described as encrypted and can be removed', () => {
  const copy = mnApiKeyStorageCopy(storage(true, 'encrypted'), 'openaiApiKey');
  assert.match(copy.sub, /Encrypted with this computer's key store/);
  assert.equal(copy.warn, false);
  assert.equal(copy.canRemove, true);
});

test('a plain-text key is never described as encrypted, even when a key store exists', () => {
  const later = mnApiKeyStorageCopy(storage(true, 'plain'), 'openaiApiKey');
  assert.match(later.sub, /stored without encryption on this computer/);
  assert.doesNotMatch(later.sub, /^Encrypted/);
  assert.equal(later.warn, true);

  const noStore = mnApiKeyStorageCopy(storage(false, 'plain'), 'openaiApiKey');
  assert.match(noStore.sub, /No system key store is available on this computer/);
  assert.match(noStore.sub, /stored without encryption/);
});

test('with no key saved, the copy says what will happen to a pasted key', () => {
  assert.match(mnApiKeyStorageCopy(storage(true, 'none'), 'openaiApiKey').sub, /will be encrypted/);
  const noStore = mnApiKeyStorageCopy(storage(false, 'none'), 'openaiApiKey');
  assert.match(noStore.sub, /stored without encryption/);
  assert.equal(noStore.warn, true);
  assert.equal(noStore.canRemove, false);
});

test('a saved key that cannot be read asks for the key again and offers removal', () => {
  const copy = mnApiKeyStorageCopy(storage(true, 'unreadable'), 'openaiApiKey');
  assert.match(copy.sub, /could not be read/);
  assert.match(copy.placeholder, /Paste it again/);
  assert.equal(copy.canRemove, true);
});

test('a missing status does not claim encryption', () => {
  const copy = mnApiKeyStorageCopy(undefined, 'openaiApiKey');
  assert.doesNotMatch(copy.sub, /encrypt/i);
  assert.equal(copy.warn, false);
});

test('leaving the key field saves only a key that was typed', () => {
  assert.equal(mnApiKeySaveOnBlur({ dirty: false, value: '' }), false, 'focus then leave must not save');
  assert.equal(mnApiKeySaveOnBlur({ dirty: true, value: '   ' }), false, 'clearing the field is not a removal');
  assert.equal(mnApiKeySaveOnBlur({ dirty: false, value: 'sk-test-made-up' }), false);
  assert.equal(mnApiKeySaveOnBlur({ dirty: true, value: 'sk-test-made-up' }), true);
});

test('the key row shows the storage state and a remove button only when a key is saved', () => {
  const unreadable = renderRow({ openaiApiKey: '', keyStorage: storage(true, 'unreadable') });
  assert.match(unreadable, /could not be read/);
  assert.match(unreadable, /Remove saved key/);
  assert.match(unreadable, /placeholder="Saved key could not be read\. Paste it again\."/);

  const encrypted = renderRow({ openaiApiKey: 'configured', keyStorage: storage(true, 'encrypted') });
  assert.match(encrypted, /Encrypted with this computer&#x27;s key store/);
  assert.match(encrypted, /Remove saved key/);
  assert.doesNotMatch(encrypted, /value="configured"/, 'the mask is never shown as a value');

  const empty = renderRow({ openaiApiKey: '', keyStorage: storage(true, 'none') });
  assert.doesNotMatch(empty, /Remove saved key/);
});
