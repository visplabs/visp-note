const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRendererModule } = require('./helpers/rendererModule.js');

const { mnMermaidConfig } = loadRendererModule('src/editor/mermaidConfig.js');

test('diagrams render in strict mode, so labels cannot carry HTML or script', () => {
  for (const theme of ['light', 'dark']) {
    assert.equal(mnMermaidConfig(theme).securityLevel, 'strict');
    assert.equal(mnMermaidConfig(theme).startOnLoad, false);
  }
});

test('Mermaid 12 keeps the layout and look existing notes were drawn with', () => {
  const config = mnMermaidConfig('light');
  assert.equal(config.layout, 'dagre', 'Mermaid 12 switched its default layout to ELK');
  assert.equal(config.look, 'classic', 'Mermaid 12 switched its default look');
});

test('the diagram theme follows the app theme', () => {
  assert.equal(mnMermaidConfig('light').theme, 'default');
  assert.equal(mnMermaidConfig('dark').theme, 'dark');
});
