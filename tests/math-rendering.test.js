const test = require('node:test');
const assert = require('node:assert/strict');
const katex = require('katex');

const APP_OPTIONS = { throwOnError: false, output: 'html' };
const render = (source, displayMode) => katex.renderToString(source, { ...APP_OPTIONS, displayMode });

test('inline math renders as KaTeX markup on one line', () => {
  const html = render('x^2 + y^2 = r^2', false);
  assert.match(html, /class="[^"]*katex/);
  assert.doesNotMatch(html, /katex-display|display-mode/);
  assert.match(html, />x</);
});

test('block math renders in display mode', () => {
  const html = render('\\int_0^1 x^2\\,dx = \\frac{1}{3}', true);
  assert.match(html, /class="[^"]*katex[^"]*display|katex-display/);
  assert.match(html, /mfrac|frac-line/);
});

test('a broken formula renders an error marker instead of throwing', () => {
  const html = render('\\frac{1}{', true);
  assert.match(html, /katex-error|ParseError|color/);
});

test('math cannot carry script, event handlers, or javascript: links', () => {
  for (const source of [
    '\\href{javascript:alert(1)}{click}',
    '\\url{javascript:alert(1)}',
    '\\htmlData{onerror=alert(1)}{x}',
    '\\text{<script>alert(1)</script>}',
    '\\text{<img src=x onerror=alert(1)>}',
  ]) {
    const html = render(source, true);
    assert.doesNotMatch(html, /href="javascript:/i, source);
    assert.doesNotMatch(html, /<script/i, source);
    assert.doesNotMatch(html, /<img/i, source);
    assert.doesNotMatch(html, /<[^>]*\sonerror\s*=/i, source);
  }
});
