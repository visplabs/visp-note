const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const store = require('../lib/store');

const fence = (lang, source) => ['```' + lang, source, '```'].join('\n');

const DIAGRAMS = [
  { kind: 'flowchart', expect: 'Start', source: 'flowchart TD\n  A[Start] --> B{Decide}\n  B --> C[Done]' },
  { kind: 'sequence', expect: 'Alice', source: 'sequenceDiagram\n  Alice->>Bob: Hello Bob' },
  { kind: 'class', expect: 'Notebook', source: 'classDiagram\n  class Notebook {\n    +title\n  }' },
  { kind: 'state', expect: 'Drafting', source: 'stateDiagram-v2\n  [*] --> Drafting\n  Drafting --> [*]' },
  { kind: 'pie', expect: 'Writing', source: 'pie title Time\n  "Writing" : 70\n  "Editing" : 30' },
];

const HOSTILE_DIAGRAM = [
  'flowchart TD',
  '  X["<img src=x onerror=window.__mnPwned=1>image"] --> Y["<script>window.__mnPwned=2</script>script"]',
  '  Z["<a href=\'javascript:window.__mnPwned=3\'>link</a>"]',
  '  click X "javascript:window.__mnPwned=4"',
].join('\n');

const BODY = [
  'Parent',
  fence('math', '\\int_0^1 x^2\\,dx = \\frac{1}{3}'),
  fence('math', 'e^{i\\pi} + 1 = 0 \\quad \\text{and} \\quad \\href{javascript:window.__mnPwned=5}{click}'),
  ...DIAGRAMS.map(diagram => fence('mermaid', diagram.source)),
  fence('mermaid', HOSTILE_DIAGRAM),
].join('\n\n');

const RENDERED_STATE = `(() => {
  const frames = Array.from(document.querySelectorAll('iframe[title="Mermaid diagram"]')).map(frame => frame.getAttribute('srcdoc') || '');
  const errors = Array.from(document.querySelectorAll('pre')).map(pre => pre.textContent).filter(text => text.startsWith('Mermaid error'));
  const math = Array.from(document.querySelectorAll('[class*="katex"]'))
    .filter(el => !el.parentElement.closest('[class*="katex"]'))
    .map(el => ({ text: el.textContent, html: el.innerHTML }));
  return {
    splash: Boolean(document.querySelector('#mn-boot-splash')),
    frames, errors, math,
    javascriptLinks: document.querySelectorAll('a[href^="javascript" i]').length,
    pwned: window.__mnPwned ?? null,
  };
})()`;

function assertDiagramsRendered(state, theme) {
  assert.deepEqual(state.errors, [], `${theme}: a diagram failed to render`);
  assert.equal(state.frames.length, DIAGRAMS.length + 1, `${theme}: one frame per diagram`);
  for (const [index, diagram] of DIAGRAMS.entries()) {
    assert.match(state.frames[index], /<svg[\s>]/, `${theme}: ${diagram.kind} diagram has no SVG`);
    assert.ok(state.frames[index].includes(diagram.expect), `${theme}: ${diagram.kind} diagram lost its label`);
  }
}

function assertHostileContentNeutralised(state, theme) {
  const hostile = state.frames[DIAGRAMS.length];
  assert.match(hostile, /<svg[\s>]/, `${theme}: the hostile diagram still renders its safe parts`);
  assert.doesNotMatch(hostile, /<script/i, `${theme}: a script tag survived sanitising`);
  assert.doesNotMatch(hostile, /<[^>]*\son[a-z]+\s*=/i, `${theme}: an event handler attribute survived sanitising`);
  assert.doesNotMatch(hostile, /href\s*=\s*["']?\s*javascript:/i, `${theme}: a javascript: link survived sanitising`);
  assert.equal(state.javascriptLinks, 0, `${theme}: the editor contains a javascript: link`);
  assert.equal(state.pwned, null, `${theme}: injected script ran`);
}

function assertMathRendered(state, theme) {
  assert.equal(state.math.length, 2, `${theme}: both math blocks render through KaTeX`);
  assert.ok(state.math[0].html.includes('frac') || state.math[0].text.includes('1'), `${theme}: the integral did not render`);
  assert.doesNotMatch(state.math[1].html, /href="javascript:/i, `${theme}: KaTeX produced a javascript: link`);
}

async function runRichRenderingScenario(win, { seedEditorNote, evaluate, waitFor }) {
  const prefs = await store.getPrefs();
  const originalTheme = prefs.tweaks?.theme || 'light';
  try {
    await seedEditorNote(win, { id: 'qe_rich_rendering', title: 'QE Math and Diagrams', body: BODY });
    for (const theme of ['light', 'dark']) {
      await store.setPrefs({ tweaks: { theme } });
      win.webContents.reload();
      const { state } = await waitFor(win, `${theme} math and diagrams render`, async () => {
        const current = await evaluate(win, RENDERED_STATE);
        const settled = !current.splash && current.math.length >= 2
          && (current.errors.length > 0 || current.frames.filter(doc => /<svg[\s>]/.test(doc)).length === DIAGRAMS.length + 1);
        return { ok: settled, state: current };
      }, 45000);
      assertMathRendered(state, theme);
      assertDiagramsRendered(state, theme);
      assertHostileContentNeutralised(state, theme);
      if (process.env.VISPNOTE_RENDER_REVIEW_DIR) {
        fs.mkdirSync(process.env.VISPNOTE_RENDER_REVIEW_DIR, { recursive: true });
        fs.writeFileSync(path.join(process.env.VISPNOTE_RENDER_REVIEW_DIR, `rich-rendering-${theme}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
  } finally {
    await store.setPrefs({ tweaks: { theme: originalTheme } });
  }
}

module.exports = { runRichRenderingScenario };
