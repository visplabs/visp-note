const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'vispnote.html'), 'utf8');
const theme = fs.readFileSync(path.join(root, 'src/shared/theme.jsx'), 'utf8');

// The design's faces were referenced by name for months but never shipped,
// so every install rendered in Times and system sans. These pin the wiring.
test('every font stylesheet linked from the shell exists on disk', () => {
  const hrefs = [...html.matchAll(/href="(node_modules\/@fontsource-variable\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(hrefs.length >= 3, 'expected the three design faces to be linked');
  for (const href of hrefs) assert.ok(fs.existsSync(path.join(root, href)), `${href} is missing`);
});

test('linked font packages are production dependencies so they get packaged', () => {
  const deps = require(path.join(root, 'package.json')).dependencies || {};
  for (const pkg of ['inter-tight', 'newsreader', 'jetbrains-mono']) {
    assert.ok(deps[`@fontsource-variable/${pkg}`], `@fontsource-variable/${pkg} must be a dependency`);
  }
});

test('the default font stacks lead with the bundled family names', () => {
  for (const family of ['Inter Tight Variable', 'Newsreader Variable', 'JetBrains Mono Variable']) {
    assert.ok(theme.includes(`'${family}'`), `${family} missing from MN_FONTS`);
  }
});
