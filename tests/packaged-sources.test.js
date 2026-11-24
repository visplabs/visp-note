const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function packagedFilePatterns() {
  const builder = fs.readFileSync(path.join(ROOT, 'electron-builder.yml'), 'utf8');
  const section = builder.split(/^files:\s*$/m)[1].split(/^\S/m)[0];
  return section.split('\n')
    .map(line => line.trim().replace(/^-\s*/, '').replace(/^"|"$/g, ''))
    .filter(pattern => pattern && !pattern.startsWith('!'));
}

function localFoldersRequiredBy(file) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const folders = new Set();
  for (const match of source.matchAll(/require\('\.\/([^/']+)\//g)) folders.add(match[1]);
  return [...folders].sort();
}

test('every folder main.js requires from is packaged, so the installed app can start', () => {
  const patterns = packagedFilePatterns();
  const folders = localFoldersRequiredBy('main.js');

  assert.ok(folders.includes('main'), 'main.js loads its services from main/');
  for (const folder of folders) {
    assert.ok(patterns.includes(`${folder}/**/*`), `electron-builder.yml files must include ${folder}/**/*`);
  }
});
