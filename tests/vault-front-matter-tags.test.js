const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { withIsolatedStore } = require('./helpers/common.js');
const { mergeNoteTags } = require('../lib/storage/vaultTags');

const WEB_NOTE = [
  '---',
  'id: n_from_web',
  'title: Written in the web app',
  'date: 2026-11-20T09:00:00.000Z',
  'tags: [field-notes, Reading]',
  '# a comment the web app keeps',
  '---',
  'Body text.',
  '',
].join('\n');

async function firstVault(store) {
  const cfg = await store.loadConfig();
  return cfg.vaults[0];
}

function writeWebNote(store, vault) {
  const file = path.join(store.ROOT, vault.slug, 'n_from_web.md');
  fs.writeFileSync(file, WEB_NOTE);
  return file;
}

test('a tag that exists only in a note front matter is listed for the vault', async () => {
  await withIsolatedStore(async (store) => {
    const vault = await firstVault(store);
    writeWebNote(store, vault);

    const loaded = await store.loadVault(vault.id);
    const names = loaded.tags.map(tag => tag.name);

    assert.ok(names.includes('field-notes'), `field-notes missing from ${names.join(', ')}`);
    assert.ok(names.includes('reading'), 'front-matter tags are normalized like every other tag');
  });
});

test('listing front-matter tags leaves the note file and the vault metadata untouched', async () => {
  await withIsolatedStore(async (store) => {
    const vault = await firstVault(store);
    const noteFile = writeWebNote(store, vault);
    const metaFile = path.join(store.ROOT, vault.slug, '.meta.json');
    const metaBefore = fs.readFileSync(metaFile);
    const noteStatBefore = fs.statSync(noteFile);

    await store.loadVault(vault.id);
    await store.loadVault(vault.id);

    assert.equal(fs.readFileSync(noteFile, 'utf8'), WEB_NOTE);
    assert.equal(fs.statSync(noteFile).mtimeMs, noteStatBefore.mtimeMs);
    assert.deepEqual(fs.readFileSync(metaFile), metaBefore);
  });
});

test('metadata tags keep their order and colour, and front-matter tags follow once each', () => {
  const merged = mergeNoteTags(
    [{ name: 'work', hue: 40 }, { name: 'ideas', hue: 300 }],
    [
      { tags: ['zeta', 'work'] },
      { tags: ['alpha', 'zeta'] },
      { tags: [] },
      {},
    ],
  );

  assert.deepEqual(merged.slice(0, 2), [{ name: 'work', hue: 40 }, { name: 'ideas', hue: 300 }]);
  assert.deepEqual(merged.slice(2).map(tag => tag.name), ['alpha', 'zeta']);
});

test('a front-matter tag gets the same colour on every load', () => {
  const first = mergeNoteTags([], [{ tags: ['field-notes'] }]);
  const second = mergeNoteTags([], [{ tags: ['field-notes'] }]);

  assert.equal(first[0].hue, second[0].hue);
  assert.ok(first[0].hue >= 0 && first[0].hue <= 360);
});
