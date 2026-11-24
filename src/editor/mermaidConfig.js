// Mermaid 12 lays diagrams out with ELK and draws them in a new look by default;
// dagre and classic keep diagrams in existing notes as they were drawn before.
function mnMermaidConfig(theme) {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'default',
    layout: 'dagre',
    look: 'classic',
    fontFamily: 'inherit',
  };
}

export { mnMermaidConfig };
