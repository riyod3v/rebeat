# ED-LaunchPad (Browser Clip Launcher)

A browser-based audio clip launcher inspired by Novation's Launchpad Arcade. Built with React and Tone.js, this application provides a professional-grade loop sequencing interface for live performance and music production workflows.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

---

## System Architecture Overview

The application follows a layered architecture separating concerns between UI, state management, and audio processing:

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer                              │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   TopBar    │  │  LaunchpadGrid  │  │  LaunchpadGrid  │  │
│  │  (controls) │  │    (main 7×8)   │  │  (custom 7×2)   │  │
│  └─────────────┘  └─────────────────┘  └─────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Application State                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  App.jsx (React State Management)                        ││
│  │  - clipStatesById: Map<clipId, state>                   ││
│  │  - isPlaying, tempoPreset, quantization                 ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     Audio Engine                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  AudioEngine.js (Tone.js Wrapper)                        ││
│  │  - Transport control (play/stop/BPM)                    ││
│  │  - Clip scheduling with quantization                    ││
│  │  - Buffer preloading and playback                       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components Explained

### 1. Audio Engine (`src/engine/AudioEngine.js`)

The heart of the application. Wraps Tone.js to provide:

#### Audio Signal Chain
```
Clip Players → Per-Clip Gain → Master Gain → Limiter → Destination
```

- **Master Gain**: Set to 0.9 to prevent clipping
- **Limiter**: Threshold at -1dB for clean output
- **Per-Clip Gain**: Enables smooth fade-in/fade-out transitions

#### Key Methods

| Method | Description |
|--------|-------------|
| `initAudio()` | Initializes Web Audio context (requires user gesture) |
| `loadProject(project)` | Parses JSON and pre-creates loop nodes |
| `triggerClip(clipId)` | Routes to loop, one-shot, or stop handler |
| `playClipOverlay(clipId)` | Fire-and-forget playback for Game Mode |

**Fixed Settings**: BPM is fixed at **130** and quantization at **1 bar** (`'1m'`).

#### Internal State Maps

```javascript
_clipIndex      // Map<clipId, { clip, column, isCustom, track }>
_loopNodesByClipId  // Map<clipId, { node }> - pre-loaded loop players
_activeLoopByColumn // Map<column, clipId> - currently playing loop per column
_queuedLoopByColumn // Map<column, clipId> - next loop scheduled per column
```

### 2. Quantization System (`src/engine/quantization.js`)

Ensures all clip starts/stops align to musical boundaries. The application uses **fixed 1-bar quantization** for consistent timing:

```javascript
// All loops quantized to full bar
'1m' → Full bar (4 beats at 4/4, ~1.85 seconds at 130 BPM)
```

**How it works:**
1. When a pad is clicked, `_nextTick()` calculates the next quantization boundary
2. `_scheduleAtTick()` schedules the start/stop at that exact transport position
3. Transport time is converted to audio time for sample-accurate playback

### 3. Clip Triggering Logic

#### Loop Clips
```
User clicks pad
       │
       ▼
┌──────────────────────────────────────┐
│ Is this the currently active loop?   │
└─────────────┬───────────────┬────────┘
              │Yes            │No
              ▼               ▼
    Schedule stop at    Set as queued,
    next bar boundary   schedule replacement
              │               │
              ▼               ▼
    Loop finishes,      At next bar:
    column goes idle    1. Stop old loop
                        2. Start new loop
```

**Key behaviors:**
- Only ONE loop per column can play at a time
- Loops always finish the current bar before stopping/switching
- Queued loops show "NEXT" badge on the pad

#### One-Shot Clips
- Play immediately at next quantization boundary
- Do NOT replace loops (play "over the top")
- Auto-dispose after playback completes
- Show "QUEUED" badge while waiting

#### Stop Clips
- Schedule the column's active loop to stop at next bar
- Always uses '1m' quantization for clean endings

### 4. Project Loader (`src/engine/demoProject.js`)

Normalizes project JSON and provides defaults:

```javascript
function normalizeProject(project) {
  return {
    version: project.version ?? 1,
    name: project.name ?? 'Untitled',
    global: {
      bpm: project.global?.bpm ?? 100,
      timeSignature: project.global?.timeSignature ?? [4, 4],
      quantization: project.global?.quantization ?? '1m',
    },
    grid: project.grid ?? { columns: 8, rows: 8 },
    tracks: project.tracks ?? [],
    customGrid: project.customGrid ?? { columns: 8, rows: 2 },
    customClips: project.customClips ?? [],
  };
}
```

### 5. Pad Builder (`src/engine/buildPads.js`)

Converts project data + clip states into a Map for efficient grid rendering:

```javascript
// Key format: "column:row"
// Example: "0:0" → first column, first row
pads.set('0:0', {
  id: 'drums_1',
  name: 'Full Maximal',
  type: 'loop',
  state: 'playing'  // or 'idle', 'queued'
});
```

---

## UI Components

### TopBar (`src/ui/TopBar.jsx`)
- **Mode Toggle**: Switch between Freestyle and Game modes
- **Play/Stop**: Starts/stops global transport (Freestyle mode)
- **Game Controls**: Start Game, Play Again buttons (Game mode)
- **Game Stats**: Level and Score display (Game mode)

**Note**: Tempo is fixed at **130 BPM** and quantization is fixed at **1 bar** for optimal Brazilian Funk timing.

### LaunchpadGrid (`src/ui/LaunchpadGrid.jsx`)
Renders the pad grid with:
- **Column headers**: Show track name and activity indicator
- **Pads**: Display clip name, type badge, and state colors
- **Activity states**: 
  - `idle` - No loop playing
  - `playing` - Loop is active (pulsing animation)
  - `queued` - Loop scheduled to start
  - `switching` - Current loop playing, new one queued

---

## Project JSON Format

Projects are defined in `src/projects/brazilianFunkProject.json`:

```json
{
  "version": 1,
  "name": "Brazilian Funk Sets",
  "global": {
    "bpm": 130,
    "timeSignature": [4, 4],
    "quantization": "1m"
  },
  "grid": {
    "columns": 7,
    "rows": 8
  },
  "tracks": [
    {
      "id": "drums",
      "name": "Drums",
      "column": 0,
      "color": "#ff4757",
      "clips": [
        {
          "id": "drums_1",
          "name": "Full Maximal",
          "row": 0,
          "type": "loop",
          "source": {
            "kind": "url",
            "url": "/audio/Drums/sample.wav",
            "bars": 1
          }
        },
        { "id": "drums_stop", "name": "Stop", "row": 7, "type": "stop" }
      ]
    }
  ],
  "customGrid": {
    "columns": 7,
    "rows": 2,
    "label": "Set 08 Extras"
  },
  "customClips": [
    {
      "id": "custom_00",
      "name": "Room Drums",
      "column": 0,
      "row": 0,
      "type": "loop",
      "source": { "kind": "url", "url": "/audio/Drums/extra.wav", "bars": 1 }
    }
  ]
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `global.bpm` | number | Beats per minute (40-200) |
| `global.timeSignature` | [num, den] | Time signature (e.g., [4, 4]) |
| `global.quantization` | string | Default scheduling ('1m', '2n', '4n', '8n', 'none') |
| `grid.columns` | number | Main grid column count |
| `grid.rows` | number | Main grid row count |
| `tracks[].column` | number | 0-based column index |
| `tracks[].color` | string | Hex color for column accent |
| `clips[].type` | string | 'loop', 'oneShot', or 'stop' |
| `source.kind` | string | 'url' (audio file) or 'generated' (synth) |
| `source.url` | string | Path relative to public folder |
| `source.bars` | number | Loop length in bars |

---

## File Structure

```
ED-LaunchPad/
├── index.html              # Entry HTML
├── package.json            # Dependencies
├── vite.config.js          # Build configuration
├── public/
│   └── audio/              # Audio sample folders
│       ├── Bass/           # Bass loops
│       ├── Drums/          # Drum loops
│       ├── Hat/            # Hi-hat patterns
│       ├── Lead/           # Lead/melody loops
│       ├── Perc/           # Percussion loops
│       ├── Shaker/         # Shaker patterns
│       ├── Vocal-Main/     # Main vocal hooks
│       └── Vocal2/         # Additional vocals
├── src/
│   ├── main.jsx            # React entry point
│   ├── App.jsx             # Main application component
│   ├── App.css             # Application styles
│   ├── index.css           # Global styles
│   ├── audio/
│   │   └── generatedClips.js   # Synth-generated sounds
│   ├── engine/
│   │   ├── AudioEngine.js      # Core audio playback
│   │   ├── buildPads.js        # Grid data transformation
│   │   ├── demoProject.js      # Project loader
│   │   └── quantization.js     # Timing calculations
│   ├── projects/
│   │   └── brazilianFunkProject.json  # Current project
│   └── ui/
│       ├── LaunchpadGrid.jsx   # Grid component
│       ├── padStates.js        # State constants
│       └── TopBar.jsx          # Control bar
```

---

## Audio Loading & Preloading

When a project loads:

1. **Index Building**: All clips are indexed by ID with column/track metadata
2. **Loop Pre-creation**: Loop nodes are created ahead of time to avoid first-trigger latency
3. **Buffer Preloading**: On `initAudio()`, all audio URLs are fetched into `ToneAudioBuffer` cache

```javascript
async _preloadAllBuffers() {
  const urls = []; // Collect all clip URLs
  await Promise.all(urls.map(url => 
    new Promise((resolve) => {
      new Tone.ToneAudioBuffer(url, resolve, () => resolve());
    })
  ));
}
```

---

## Fade Transitions

To prevent clicks and pops:

| Transition | Duration |
|------------|----------|
| Loop start | 10ms fade-in |
| Loop stop  | 30ms fade-out |

```javascript
const LOOP_STOP_FADE_SECONDS = 0.03;
const LOOP_START_FADE_SECONDS = 0.01;
```

---

## Adding New Samples

1. Place `.wav` files in `public/audio/<Category>/`
2. Update `src/projects/brazilianFunkProject.json`:
   - Add clip entry with unique `id`
   - Set `source.url` to `/audio/<Category>/filename.wav`
   - Assign `row` and `column` positions

**Naming convention**: Avoid spaces and special characters in filenames (use underscores instead).

---

## Technologies Used

- **React 18**: UI rendering and state management
- **Tone.js**: Web Audio wrapper for transport, scheduling, and playback
- **Vite**: Fast development server and build tool
- **CSS Variables**: Theme customization via `--col` and `--col-rgb`

---

## Extension Ideas

- MIDI input (Launchpad controller)
- Scenes/rows launch
- Per-track volume/mute/solo
- File picker UI for custom samples
- Waveform visualization
- Recording/export functionality

---

## Game Mode (Simon Says)

The application includes a "Memory Game" mode inspired by Simon Says. Switch between modes using the toggle in the top bar.

### How to Play

1. Click **"Game"** in the mode toggle
2. Click **"Start Game"** to begin
3. **Watch**: The app will play and highlight a sequence of pads
4. **Repeat**: Click the pads in the exact same order
5. **Level Up**: Each level adds one more pad to the sequence
6. **Game Over**: One wrong tap ends the game

### Game States

| State | Description |
|-------|-------------|
| `ready` | Waiting to start |
| `demonstrating` | Showing sequence (input disabled) |
| `waitingForInput` | Player's turn to repeat |
| `success` | Level completed, preparing next |
| `gameOver` | Wrong input, game ended |

### Scoring

- **Points per level**: `level × 10`
- Score accumulates across levels

### Technical Details

**AudioEngine.playClipOverlay(clipId)**
```javascript
// Plays a clip's full loop (fire-and-forget), layers on top of existing audio
await engine.playClipOverlay('drums_1'); // Starts playing, returns immediately
```

**Game Configuration** (in App.jsx)
```javascript
const GAME_CONFIG = {
  demoHighlightMs: 800,    // How long each pad stays highlighted during demo
  demoGapMs: 200,          // Gap between demo notes (loops layer on top)
  feedbackDurationMs: 400, // How long correct/incorrect feedback shows
  levelUpDelayMs: 2000,    // Delay before next level starts (2 seconds)
  gameOverDelayMs: 2000,   // Delay before allowing restart
};
```

**Layered Playback**: Both demo and player input use `playClipOverlay()` which plays full loops and stacks multiple clips on top of each other (polyphonic).

**Abort-Safe Sequences**: Game sequences can be cleanly aborted when switching modes or restarting, preventing visual/audio glitches.

**Pad Visual States**
- `demo` - Blue glow during demonstration
- `correct` - Green flash for correct input
- `incorrect` - Red shake for wrong input
