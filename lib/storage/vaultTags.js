const HUE_STEPS = 12;
const HUE_STEP_DEGREES = 30;
const HUE_OFFSET = 10;

function hueForTagName(name) {
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return (hash % HUE_STEPS) * HUE_STEP_DEGREES + HUE_OFFSET;
}

function frontMatterTagNames(notes) {
  const names = new Set();
  for (const note of notes || []) {
    for (const name of Array.isArray(note?.tags) ? note.tags : []) {
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

function mergeNoteTags(metaTags, notes) {
  const known = new Set(metaTags.map(tag => tag.name));
  const missing = frontMatterTagNames(notes).filter(name => !known.has(name));
  return [...metaTags, ...missing.map(name => ({ name, hue: hueForTagName(name) }))];
}

module.exports = { mergeNoteTags, hueForTagName };
