const { useState: useStateP } = React;

const PanelIcon = ({ direction }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
       style={{ transform: direction === 'right' ? 'scaleX(-1)' : 'none' }}>
    <rect x="2" y="3" width="12" height="10" rx="1.5"/>
    <path d="M6 3V13"/>
    <path d="M11 6L9 8L11 10"/>
  </svg>
);

// Top offset so both grip buttons sit at the same Y as the editor toolbar
// buttons — collapsed peek and open grip naturally align across the row.
const GRIP_TOP = 14;

// The open grip stays out of sight until the pointer reaches the top of the
// pane edge (or keyboard focus lands on it), so it no longer sits on top of
// the pane title. Its column draws no line of its own: the pane to its left
// already has a border, and drawing both doubled the divider.
function MnPanelGrip({ side, onCollapse, T }) {
  const [hover, setHover] = useStateP(false);
  const label = `Hide ${side === 'sidebar' ? 'sidebar' : 'note list'}`;
  return (
    <div
      className="mn-panel-grip"
      style={{
        width: 0, flexShrink: 0, position: 'relative', zIndex: 5,
      }}>
      {/* Hit strip limited to the header band, so it never covers the list's
          scrollbar further down the edge. */}
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ position: 'absolute', left: -14, top: 0, width: 28, height: 56 }}>
        <button
          type="button"
          className="mn-panel-grip-btn"
          onClick={onCollapse}
          title={label}
          aria-label={label}
          style={{
            position: 'absolute',
            left: 2, top: GRIP_TOP,
            width: 24, height: 24, padding: 0,
            borderRadius: 6,
            border: `1px solid ${T.line}`,
            background: hover ? T.bgHover : T.bg,
            color: hover ? T.ink : T.inkMed,
            cursor: 'pointer',
            opacity: hover ? 1 : 0,
            transition: 'opacity 140ms ease, background 120ms, color 120ms',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 2px 6px color-mix(in oklab, ${T.ink} 12%, transparent)`,
          }}>
          <PanelIcon direction="left" />
        </button>
      </div>
    </div>
  );
}

function MnPanelGripPeek({ onExpand, T, title }) {
  const [hover, setHover] = useStateP(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 1, flexShrink: 0, position: 'relative',
        background: T.line, zIndex: 5,
      }}>
      <button
        type="button"
        onClick={onExpand}
        title={title}
        aria-label={title}
        style={{
          position: 'absolute',
          left: -12, top: GRIP_TOP,
          width: 24, height: 24, padding: 0,
          borderRadius: 6,
          border: `1px solid ${T.line}`,
          background: hover ? T.bgHover : T.bg,
          color: hover ? T.ink : T.inkMed,
          cursor: 'pointer',
          transition: 'background 120ms, color 120ms',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: hover
            ? `0 2px 6px color-mix(in oklab, ${T.ink} 14%, transparent)`
            : `0 1px 2px color-mix(in oklab, ${T.ink} 6%, transparent)`,
        }}>
        <PanelIcon direction="right" />
      </button>
    </div>
  );
}

export { MnPanelGrip, MnPanelGripPeek };
