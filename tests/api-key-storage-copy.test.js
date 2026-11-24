const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadRendererModule } = require('./helpers/rendererModule.js');

const { mnApiKeyStorageCopy } = loadRendererModule('src/settings/sections/apiKeyStorageCopy.js');

test('an encrypted key store is named as such', () => {
  const copy = mnApiKeyStorageCopy({ encrypted: true, unreadable: [] }, 'openaiApiKey');
  assert.match(copy.sub, /encrypted/i);
  assert.equal(copy.warn, false);
  assert.equal(copy.unreadable, false);
});

test('without a key store the settings say plainly that the key is not encrypted on this computer', () => {
  const copy = mnApiKeyStorageCopy({ encrypted: false, unreadable: [] }, 'openaiApiKey');
  assert.match(copy.sub, /without encryption on this computer/);
  assert.equal(copy.warn, true);
});

test('a saved key that cannot be read asks for the key again', () => {
  const copy = mnApiKeyStorageCopy({ encrypted: true, unreadable: ['anthropicApiKey'] }, 'anthropicApiKey');
  assert.equal(copy.unreadable, true);
  assert.equal(copy.warn, true);
  assert.match(copy.sub, /could not be read/);
  assert.match(copy.placeholder, /Paste it again/);

  const other = mnApiKeyStorageCopy({ encrypted: true, unreadable: ['anthropicApiKey'] }, 'openaiApiKey');
  assert.equal(other.unreadable, false);
});

test('a missing status does not claim encryption', () => {
  const copy = mnApiKeyStorageCopy(undefined, 'openaiApiKey');
  assert.doesNotMatch(copy.sub, /encrypted/i);
  assert.equal(copy.warn, false);
});

test('the AI settings key row shows the storage copy', () => {
  const section = fs.readFileSync(path.join(__dirname, '../src/settings/sections/AssistanceSection.jsx'), 'utf8');
  assert.match(section, /mnApiKeyStorageCopy\(config\?\.keyStorage, providerMeta\.keyField\)/);
  assert.doesNotMatch(section, /Stored locally in VispNote settings/);
  assert.match(section, /\{showApiKey && apiKeyCopy\.warn && \(/, 'the warning must be visible without opening Advanced');
});
