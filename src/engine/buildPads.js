import { PadState } from '../ui/padStates';

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED 8×10 GRID
// Row layout:
//   0-6  → main clips (tracks[col].clips, type !== 'stop', natural row index)
//   7    → customClips row 0
//   8    → customClips row 1
//   9    → Stop pads (from tracks[col].clips where type === 'stop')
//   ghost → any cell with no pad data (shown as non-interactive placeholder)
// ─────────────────────────────────────────────────────────────────────────────
export function buildUnifiedGridPads(project, clipStatesById) {
  const pads = new Map();
  const STOP_ROW = 9;
  const CUSTOM_ROW_OFFSET = 7; // customClips row 0 → unified row 7, row 1 → unified row 8

  // Track every audio source URL used by main-track clips so we can
  // skip any custom clip whose audio is already represented in the grid.
  // This prevents the same sample appearing twice under different names
  // (e.g. "Full South" in drums row 6 AND in custom row 1, same URL).
  const seenAudioUrls = new Set();

  // ── Main tracks ─────────────────────────────────────────────────────────
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.type === 'stop') {
        // All stop pads land on the anchored bottom row
        const key = `${track.column}:${STOP_ROW}`;
        pads.set(key, {
          id: clip.id,
          name: 'Stop',
          type: 'stop',
          state: PadState.idle,
        });
      } else {
        const key = `${track.column}:${clip.row}`;
        pads.set(key, {
          id: clip.id,
          name: clip.name ?? clip.id,
          type: clip.type,
          state: clipStatesById.get(clip.id) ?? PadState.idle,
        });
        // Register the URL so custom clips with identical audio are skipped
        if (clip.source?.url) seenAudioUrls.add(clip.source.url);
      }
    }
  }

  // ── Custom (Set 08 Extra) clips – unified rows 7 and 8 ──────────────────
  // Two deduplication guards:
  //   1. Grid key – skip if the cell is already occupied (coordinate clash).
  //   2. Audio URL – skip if the same sample already exists in the main grid
  //      OR was already placed by an earlier custom clip (cross-row dup).
  // Empty slots fall through to GhostPad in the renderer.
  for (const clip of project.customClips) {
    const unifiedRow = CUSTOM_ROW_OFFSET + clip.row; // row 0 → 7, row 1 → 8
    const key = `${clip.column}:${unifiedRow}`;
    const url = clip.source?.url;

    if (pads.has(key)) continue;          // cell already occupied
    if (url && seenAudioUrls.has(url)) continue; // duplicate audio source

    pads.set(key, {
      id: clip.id,
      name: clip.name ?? clip.id,
      type: clip.type,
      state: clipStatesById.get(clip.id) ?? PadState.idle,
    });

    if (url) seenAudioUrls.add(url);      // prevent further custom dups
  }

  return pads;
}
