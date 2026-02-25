import React from 'react';

function hexToRgbTriplet(hex) {
  if (typeof hex !== 'string') return '87,96,111';
  const normalized = hex.trim().replace('#', '');
  if (normalized.length === 3) {
    const r = parseInt(normalized[0] + normalized[0], 16);
    const g = parseInt(normalized[1] + normalized[1], 16);
    const b = parseInt(normalized[2] + normalized[2], 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return '87,96,111';
    return `${r},${g},${b}`;
  }
  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return '87,96,111';
    return `${r},${g},${b}`;
  }
  return '87,96,111';
}

// ── Shared pad-cell renderer ───────────────────────────────────────────────
// Applies game-state overrides (demo / correct / incorrect) then renders the
// button. Extracted so the same logic is not duplicated if multiple zones
// exist within one grid.
function renderPadCell({ pad, col, row, columnColors, gameHighlightedPads, gameFeedbackPads, disableInput, onPadClick }) {
  let state = pad.state ?? 'idle';
  const isGameHighlighted = gameHighlightedPads.has(pad.id);
  const gameFeedback    = gameFeedbackPads.get(pad.id);

  if      (gameFeedback === 'correct')   state = 'correct';
  else if (gameFeedback === 'incorrect') state = 'incorrect';
  else if (isGameHighlighted)            state = 'demo';

  const isStop   = pad.type === 'stop';
  const colColor = columnColors?.[col] ?? 'rgba(255,255,255,0.12)';
  const badge    = state === 'queued'
    ? pad.type === 'loop' ? 'NEXT' : pad.type === 'oneShot' ? 'QUEUED' : ''
    : '';

  const padClasses = [
    'lp-pad',
    `lp-pad--${state}`,
    isStop     ? 'lp-pad--stop'           : '',
    disableInput ? 'lp-pad--disabled-input' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      key={`${col}:${row}`}
      type="button"
      className={padClasses}
      style={{
        '--col':     colColor,
        '--col-rgb': hexToRgbTriplet(colColor),
        borderColor: colColor,
        background:  isStop ? 'rgba(255,255,255,0.06)' : undefined,
      }}
      onClick={() => !disableInput && pad.id && onPadClick(pad.id)}
      disabled={disableInput}
      title={pad.name ?? ''}
    >
      <div className="lp-pad__label">
        <div className="lp-pad__name">{pad.name ?? ''}</div>
        <div className="lp-pad__meta">{isStop ? 'STOP' : pad.type}</div>
      </div>
      {badge ? <div className="lp-pad__badge">{badge}</div> : null}
    </button>
  );
}

export function LaunchpadGrid({
  title,
  columns,
  rows,
  pads,
  onPadClick,
  columnLabels,
  columnColors,
  columnActivity,
  // Game mode props
  gameHighlightedPads = new Set(),
  gameFeedbackPads    = new Map(),
  disableInput        = false,
  gameActive          = false,   // true while the game sequence is live (dims idle pads)
}) {
  return (
    <section className={`lp-section${gameActive ? ' lp-section--game-live' : ''}`}>
      {title ? (
        <div className="lp-section__title">
          <h2>{title}</h2>
        </div>
      ) : null}

      <div className="lp-grid-wrapper">
        {/* ── Column Headers ── */}
        <div className="lp-col-headers" style={{ '--cols': columns }}>
          {Array.from({ length: columns }).map((_, col) => (
            <div
              key={`colhdr-${col}`}
              className={`lp-colhdr lp-colhdr--${columnActivity?.[col] ?? 'idle'}`}
              style={{
                '--col':     columnColors?.[col] ?? '#57606f',
                '--col-rgb': hexToRgbTriplet(columnColors?.[col] ?? '#57606f'),
              }}
            >
              <div className="lp-colhdr__dot" style={{ background: columnColors?.[col] ?? '#57606f' }} />
              <div className="lp-colhdr__label">{columnLabels?.[col] ?? `Col ${col + 1}`}</div>
            </div>
          ))}
        </div>

        {/* ── Pad Grid ── */}
        <div className="lp-grid" style={{ '--cols': columns, '--rows': rows }}>
          {Array.from({ length: columns * rows }).map((_, idx) => {
            const col = idx % columns;
            const row = Math.floor(idx / columns);
            const key = `${col}:${row}`;
            const pad = pads.get(key);

            // Empty cell — return null (no interior gaps exist after URL-dedup
            // trims duplicate custom rows; trimmed row count keeps pads dense).
            if (!pad) return null;


            return renderPadCell({
              pad, col, row,
              columnColors,
              gameHighlightedPads,
              gameFeedbackPads,
              disableInput,
              onPadClick,
            });
          })}
        </div>
      </div>
    </section>
  );
}
