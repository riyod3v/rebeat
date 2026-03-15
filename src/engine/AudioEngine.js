import * as Tone from 'tone';
import { createGeneratedLoop, playGeneratedOneShot } from '../audio/generatedClips';
import { nextQuantizedTick, parseQuantizationToTicks } from './quantization';

const LOOP_STOP_FADE_SECONDS = 0.03;
const LOOP_START_FADE_SECONDS = 0.01;

function clampNumber(value, { min, max }) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export class AudioEngine {
  constructor({ onClipStateChange } = {}) {
    this._onClipStateChange = onClipStateChange ?? (() => {});

    this._master = new Tone.Gain(0.9);
    this._limiter = new Tone.Limiter(-1);
    this._master.chain(this._limiter, Tone.Destination);

    this._project = null;
    this._quantization = '1m';

    this._clipIndex = new Map(); // clipId -> { clip, column, isCustom }
    this._loopNodesByClipId = new Map(); // clipId -> { node, output }
    this._loopGainsByClipId = new Map();

    this._activeLoopByColumn = new Map(); // column -> clipId
    this._queuedLoopByColumn = new Map(); // column -> clipId
    this._scheduledEventIds = new Set();

    // Recording state
    this._isRecording = false;
    this._recordedEvents = [];       // Array of { clipId, ticksFromStart, position, timestamp }
    this._recordingStartTicks = 0;
  }

  dispose() {
    for (const id of this._scheduledEventIds) {
      try {
        Tone.Transport.clear(id);
      } catch {
        // ignore
      }
    }
    this._scheduledEventIds.clear();

    for (const { node } of this._loopNodesByClipId.values()) {
      try {
        node.stop(0);
      } catch {
        // ignore
      }
      try {
        node.dispose();
      } catch {
        // ignore
      }
    }
    this._loopNodesByClipId.clear();
    for (const gain of this._loopGainsByClipId.values()) {
      try {
        gain.dispose();
      } catch {
        // ignore
      }
    }
    this._loopGainsByClipId.clear();

    this._clipIndex.clear();
    this._activeLoopByColumn.clear();
    this._queuedLoopByColumn.clear();

    try {
      this._master.dispose();
      this._limiter.dispose();
    } catch {
      // ignore
    }
  }

  async initAudio() {
    // Must be called from a user gesture.
    await Tone.start();
    // Preload all audio buffers for smooth playback
    await this._preloadAllBuffers();
  }

  async _preloadAllBuffers() {
    const urls = [];
    for (const { clip } of this._clipIndex.values()) {
      if (clip.source?.kind === 'url' && clip.source.url) {
        urls.push(clip.source.url);
      }
    }
    if (urls.length === 0) return;
    
    console.log(`Preloading ${urls.length} audio samples...`);
    try {
      await Promise.all(urls.map(url => 
        new Promise((resolve) => {
          const buffer = new Tone.ToneAudioBuffer(url, resolve, () => {
            console.warn(`Failed to load: ${url}`);
            resolve();
          });
          void buffer;
        })
      ));
      console.log('Audio samples preloaded!');
    } catch (err) {
      console.warn('Some samples failed to preload:', err);
    }
  }

  setBpm(bpm) {
    const next = clampNumber(bpm, { min: 40, max: 200 });
    Tone.Transport.bpm.value = next;
  }

  setTimeSignature([num, den]) {
    const numerator = clampNumber(num, { min: 1, max: 12 });
    // Tone.js timeSignature is numerator, assumes quarter note beat.
    Tone.Transport.timeSignature = numerator;
    // Denominator is kept in project but not used here.
    void den;
  }

  setQuantization(q) {
    this._quantization = q ?? '1m';
  }

  getQuantization() {
    return this._quantization;
  }

  loadProject(project) {
    this._project = project;

    this._clipIndex.clear();
    this._loopNodesByClipId.clear();
    this._activeLoopByColumn.clear();
    this._queuedLoopByColumn.clear();

    for (const track of project.tracks) {
      for (const clip of track.clips) {
        this._clipIndex.set(clip.id, { clip, column: track.column, isCustom: false, track });
      }
    }

    for (const clip of project.customClips) {
      // custom clips use their own (custom) column index, but quantization rules are same.
      this._clipIndex.set(clip.id, { clip, column: clip.column, isCustom: true, track: null });
    }

    // Pre-create loop nodes to avoid first-trigger gaps.
    for (const { clip } of this._clipIndex.values()) {
      if (clip.type !== 'loop') continue;

      const node = this._createLoopNode(clip);
      this._loopNodesByClipId.set(clip.id, node);
    }
  }

  startTransport() {
    if (Tone.Transport.state !== 'started') {
      Tone.Transport.start();
    }
  }

  stopTransport() {
    Tone.Transport.stop();
    Tone.Transport.position = 0;

    for (const id of this._scheduledEventIds) {
      try {
        Tone.Transport.clear(id);
      } catch {
        // ignore
      }
    }
    this._scheduledEventIds.clear();

    // Stop all active loop players immediately
    for (const { node } of this._loopNodesByClipId.values()) {
      try {
        node.stop({ transportTick: 0, audioTime: Tone.now() });
      } catch {
        // ignore
      }
    }

    // Clear active state (but keep nodes loaded).
    for (const [column, clipId] of this._activeLoopByColumn.entries()) {
      this._setClipState(clipId, 'idle');
      void column;
    }
    for (const clipId of this._queuedLoopByColumn.values()) {
      this._setClipState(clipId, 'idle');
    }

    this._activeLoopByColumn.clear();
    this._queuedLoopByColumn.clear();
  }

  isTransportRunning() {
    return Tone.Transport.state === 'started';
  }

  triggerClip(clipId) {
    const entry = this._clipIndex.get(clipId);
    if (!entry) return;

    const { clip, column } = entry;

    const currentTicks = Tone.Transport.ticks;
    let playTick = currentTicks;
    if (clip.type === 'loop' || clip.type === 'stop') {
      playTick = this._nextTick('1m');
    } else if (clip.type === 'oneShot') {
      playTick = this._nextTick();
    }

    // Record the event if recording is active
    if (this._isRecording) {
      this._recordedEvents.push({
        clipId,
        ticksFromStart: currentTicks - this._recordingStartTicks,
        playTickFromStart: playTick - this._recordingStartTicks,
        position: Tone.Transport.position,
        timestamp: Tone.now(),
        type: clip.type,
      });
    }

    if (clip.type === 'stop') {
      this.stopColumn(column);
      return;
    }

    if (clip.type === 'oneShot') {
      this._triggerOneShot(clip);
      return;
    }

    if (clip.type === 'loop') {
      this._triggerLoop(clip, column);
    }
  }

  stopColumn(column) {
    const active = this._activeLoopByColumn.get(column);
    const queued = this._queuedLoopByColumn.get(column);

    // Always let loops finish the bar when stopping.
    const tick = this._nextTick('1m');

    if (queued) {
      this._queuedLoopByColumn.delete(column);
      this._setClipState(queued, 'idle');
    }

    if (active) {
      this._scheduleAtTick(tick, ({ audioTime, transportTick }) => {
        this._stopLoopAt(active, { audioTime, transportTick });
        this._activeLoopByColumn.delete(column);
      });
    }
  }

  // --- Internals ---

  _nextTick(quantizationOverride) {
    const now = Tone.Transport.ticks;
    const qTicks = parseQuantizationToTicks(quantizationOverride ?? this._quantization);
    return nextQuantizedTick({ nowTicks: now, quantizationTicks: qTicks, strictlyFuture: true });
  }

  _scheduleAtTick(tick, fn) {
    const transportTime = Tone.Ticks(tick);
    const id = Tone.Transport.scheduleOnce((audioTime) => fn({ audioTime, transportTick: tick }), transportTime);
    this._scheduledEventIds.add(id);
    return id;
  }

  _setClipState(clipId, state) {
    this._onClipStateChange(clipId, state);
  }

  _createLoopNode(clip) {
    const loopEnd = '1m';

    const gain = new Tone.Gain(1);
    gain.connect(this._master);
    this._loopGainsByClipId.set(clip.id, gain);

    if (clip.source?.kind === 'generated') {
      const node = createGeneratedLoop(clip.source.generator, { loopEnd });
      node.output.connect(gain);
      return {
        node: {
          start: ({ transportTick, audioTime }) => {
            const transportTime = Tone.Ticks(transportTick);
            gain.gain.setValueAtTime(0, audioTime);
            gain.gain.rampTo(1, LOOP_START_FADE_SECONDS, audioTime);
            node.start(transportTime);
          },
          stop: ({ transportTick, audioTime }) => {
            const transportTime = Tone.Ticks(transportTick);
            gain.gain.rampTo(0, LOOP_STOP_FADE_SECONDS, audioTime);
            node.stop(transportTime);
          },
          dispose: () => {
            node.dispose();
          },
        },
      };
    }

    if (clip.source?.kind === 'url') {
      const player = new Tone.Player(clip.source.url);
      player.loop = true;
      player.autostart = false;
      player.connect(gain);

      return {
        node: {
          start: ({ transportTick, audioTime }) => {
            void transportTick;
            try {
              player.stop();
            } catch {
              // ignore
            }
            gain.gain.setValueAtTime(0, audioTime);
            gain.gain.rampTo(1, LOOP_START_FADE_SECONDS, audioTime);
            // Start immediately at the scheduled audio time
            player.start(audioTime);
          },
          stop: ({ transportTick, audioTime }) => {
            void transportTick;
            gain.gain.rampTo(0, LOOP_STOP_FADE_SECONDS, audioTime);
            // Stop after fade
            try {
              player.stop(audioTime + LOOP_STOP_FADE_SECONDS + 0.01);
            } catch {
              try { player.stop(); } catch { /* ignore */ }
            }
          },
          dispose: () => player.dispose(),
        },
      };
    }

    // Fallback: silent generated loop.
    const node = createGeneratedLoop('default', { loopEnd });
    node.output.connect(gain);
    return {
      node: {
        start: ({ transportTick, audioTime }) => {
          const transportTime = Tone.Ticks(transportTick);
          gain.gain.setValueAtTime(0, audioTime);
          gain.gain.rampTo(1, LOOP_START_FADE_SECONDS, audioTime);
          node.start(transportTime);
        },
        stop: ({ transportTick, audioTime }) => {
          const transportTime = Tone.Ticks(transportTick);
          gain.gain.rampTo(0, LOOP_STOP_FADE_SECONDS, audioTime);
          node.stop(transportTime);
        },
        dispose: () => node.dispose(),
      },
    };
  }

  _triggerOneShot(clip) {
    const tick = this._nextTick();
    this._setClipState(clip.id, 'queued');

    this._scheduleAtTick(tick, ({ audioTime }) => {
      this._setClipState(clip.id, 'playing');

      // Calculate duration based on clip bars
      const bars = typeof clip.source?.bars === 'number' ? clip.source.bars : 0.5;
      const barSeconds = Tone.Time('1m').toSeconds();
      const durationMs = Math.max(200, Math.floor(bars * barSeconds * 1000));
      // Add buffer time for disposal (100ms after playback ends)
      const disposeMs = durationMs + 100;

      if (clip.source?.kind === 'generated') {
        playGeneratedOneShot(clip.source.generator, { destination: this._master, time: audioTime });
      } else if (clip.source?.kind === 'url') {
        const player = new Tone.Player(clip.source.url).connect(this._master);
        player.start(audioTime);
        // Dispose after calculated duration + buffer
        setTimeout(() => {
          try { player.dispose(); } catch { /* ignore */ }
        }, disposeMs);
      }

      // Update state after playback duration
      setTimeout(() => this._setClipState(clip.id, 'idle'), durationMs);
    });
  }

  _stopLoopAt(clipId, { transportTick, audioTime }) {
    const loop = this._loopNodesByClipId.get(clipId);
    if (!loop) return;
    try {
      loop.node.stop({ transportTick, audioTime });
    } catch {
      // ignore
    }
    this._setClipState(clipId, 'idle');
  }

  _startLoopAt(clipId, { transportTick, audioTime }) {
    const loop = this._loopNodesByClipId.get(clipId);
    if (!loop) return;
    try {
      loop.node.start({ transportTick, audioTime });
    } catch {
      // ignore
    }
    this._setClipState(clipId, 'playing');
  }

  _triggerLoop(clip, column) {
    const active = this._activeLoopByColumn.get(column);
    const queued = this._queuedLoopByColumn.get(column);

    // Toggle off if same loop is active (schedule stop at quantization).
    if (active === clip.id) {
      // Always finish the bar before stopping.
      const tick = this._nextTick('1m');
      this._setClipState(clip.id, 'queued');
      this._scheduleAtTick(tick, ({ audioTime, transportTick }) => {
        this._stopLoopAt(clip.id, { audioTime, transportTick });
        this._activeLoopByColumn.delete(column);
      });
      return;
    }

    // Replace: clear previous queued loop.
    if (queued && queued !== clip.id) {
      this._setClipState(queued, 'idle');
    }

    this._queuedLoopByColumn.set(column, clip.id);
    this._setClipState(clip.id, 'queued');

    // ALWAYS wait until the end of the bar before switching samples.
    // This matches Novation viral-hiphop behavior: the current loop finishes
    // its full cycle before the new sample starts.
    const tick = this._nextTick('1m');

    this._scheduleAtTick(tick, ({ audioTime, transportTick }) => {
      const stillQueued = this._queuedLoopByColumn.get(column) === clip.id;
      if (!stillQueued) return;

      // Stop currently active loop at this boundary.
      const currentActive = this._activeLoopByColumn.get(column);
      if (currentActive && currentActive !== clip.id) {
        this._stopLoopAt(currentActive, { audioTime, transportTick });
      }

      this._queuedLoopByColumn.delete(column);
      this._activeLoopByColumn.set(column, clip.id);
      this._startLoopAt(clip.id, { audioTime, transportTick });
    });
  }

  // =========================================================================
  // GAME MODE: Preview clip for Simon Says demonstration
  // =========================================================================

  /**
   * Calculate the duration of a clip in milliseconds based on bars and current BPM.
   * @param {object} clip - The clip object
   * @returns {number} Duration in milliseconds
   */
  _getClipDurationMs(clip) {
    const bars = clip.source?.bars ?? 1;
    const bpm = Tone.Transport.bpm.value;
    const beatsPerBar = Tone.Transport.timeSignature;
    const secondsPerBeat = 60 / bpm;
    const secondsPerBar = secondsPerBeat * beatsPerBar;
    return Math.round(bars * secondsPerBar * 1000);
  }

  /**
   * Get the duration of a clip in milliseconds.
   * @param {string} clipId - The clip ID
   * @returns {number} Duration in ms, or 1000 as fallback
   */
  getClipDurationMs(clipId) {
    const entry = this._clipIndex.get(clipId);
    if (!entry) return 1000;
    return this._getClipDurationMs(entry.clip);
  }

  /**
   * Play a clip as an overlay (fire-and-forget). The clip plays to completion
   * and auto-disposes. Multiple clips can layer on top of each other.
   * @param {string} clipId - The clip ID to play
   * @returns {Promise<void>} - Resolves immediately after starting playback
   */
  async playClipOverlay(clipId) {
    const entry = this._clipIndex.get(clipId);
    if (!entry) return;

    const { clip } = entry;
    if (!clip.source) return;

    const durationMs = this._getClipDurationMs(clip);
    const now = Tone.now();

    if (clip.source.kind === 'url') {
      const player = new Tone.Player(clip.source.url);
      player.loop = false;
      player.connect(this._master);
      
      // Wait for buffer to load if needed
      await new Promise((resolve) => {
        if (player.loaded) {
          resolve();
        } else {
          player.buffer.onload = resolve;
          setTimeout(resolve, 500);
        }
      });

      player.start(now);

      // Auto-dispose after playback completes (fire and forget)
      setTimeout(() => {
        try {
          player.stop(Tone.now() + 0.05);
          setTimeout(() => {
            try { player.dispose(); } catch { /* ignore */ }
          }, 100);
        } catch {
          try { player.dispose(); } catch { /* ignore */ }
        }
      }, durationMs);

      return; // Return immediately, don't wait for playback to finish
    }

    if (clip.source.kind === 'generated') {
      playGeneratedOneShot(clip.source.generator, { destination: this._master, time: now });
    }
  }

  /**
   * Play a clip's full loop immediately (bypassing quantization).
   * Used in Game Mode to demonstrate sequences without affecting the main transport.
   * @param {string} clipId - The clip ID to preview
   * @param {number} [overrideDurationMs] - Optional override duration (if not provided, plays full loop)
   * @returns {Promise<void>} - Resolves when the preview is complete
   */
  async previewClip(clipId, overrideDurationMs = null) {
    const entry = this._clipIndex.get(clipId);
    if (!entry) return;

    const { clip } = entry;
    if (!clip.source) return;

    // Calculate full loop duration or use override
    const durationMs = overrideDurationMs ?? this._getClipDurationMs(clip);

    const now = Tone.now();

    if (clip.source.kind === 'url') {
      const player = new Tone.Player(clip.source.url);
      player.loop = false; // Play once, not continuously
      player.connect(this._master);
      
      // Wait for buffer to load if needed
      await new Promise((resolve) => {
        if (player.loaded) {
          resolve();
        } else {
          player.buffer.onload = resolve;
          // Fallback timeout
          setTimeout(resolve, 500);
        }
      });

      player.start(now);

      // Schedule stop after full loop duration
      const fadeTime = 0.05;
      
      return new Promise((resolve) => {
        setTimeout(() => {
          try {
            player.stop(Tone.now() + fadeTime);
            setTimeout(() => {
              try { player.dispose(); } catch { /* ignore */ }
            }, 100);
          } catch {
            try { player.dispose(); } catch { /* ignore */ }
          }
          resolve();
        }, durationMs);
      });
    }

    if (clip.source.kind === 'generated') {
      playGeneratedOneShot(clip.source.generator, { destination: this._master, time: now });
      return new Promise((resolve) => setTimeout(resolve, durationMs));
    }
  }

  /**
   * Get all playable clip IDs (loops and one-shots, excluding stops)
   * Used by Game Mode to build random sequences
   * @returns {string[]} Array of clip IDs
   */
  getPlayableClipIds() {
    const ids = [];
    for (const [clipId, { clip }] of this._clipIndex.entries()) {
      if (clip.type === 'loop' || clip.type === 'oneShot') {
        ids.push(clipId);
      }
    }
    return ids;
  }

  /**
   * Get clip info by ID
   * @param {string} clipId 
   * @returns {{ clip, column, isCustom, track } | undefined}
   */
  getClipInfo(clipId) {
    return this._clipIndex.get(clipId);
  }

  // =========================================================================
  // RECORDING
  // =========================================================================

  /**
   * Start recording pad triggers
   */
  startRecording() {
    this._isRecording = true;
    this._recordedEvents = [];
    this._recordingStartTicks = Tone.Transport.ticks;
  }

  /**
   * Stop recording and return the recorded sequence
   * @returns {object} Recording data with events, bpm, duration
   */
  stopRecording() {
    this._isRecording = false;
    return this.getRecordedSequence();
  }

  /**
   * Check if currently recording
   * @returns {boolean}
   */
  isRecording() {
    return this._isRecording;
  }

  /**
   * Get the current recorded sequence data
   * @returns {object} Recording data
   */
  getRecordedSequence() {
    return {
      bpm: this._project?.global?.bpm ?? 130,
      timeSignature: this._project?.global?.timeSignature ?? [4, 4],
      events: [...this._recordedEvents],
      durationTicks: Tone.Transport.ticks - this._recordingStartTicks,
      recordedAt: new Date().toISOString(),
    };
  }

  /**
   * Play back a recorded sequence
   * @param {object} recording - Recording data from stopRecording()
   * @param {function} onEventPlay - Callback when each event plays (for UI feedback)
   */
  playRecording(recording, onEventPlay = () => {}) {
    if (!recording || !recording.events || recording.events.length === 0) {
      return;
    }

    const { events, bpm } = recording;

    // Set the BPM to match the recording
    this.setBpm(bpm);

    const baseTick = Tone.Transport.ticks;

    events.forEach((event) => {
      const rawTick = event.playTickFromStart ?? event.ticksFromStart ?? 0;
      const eventTick = Math.max(0, Math.round(Number(rawTick) || 0));
      const absoluteTick = baseTick + eventTick;

      const id = Tone.Transport.scheduleOnce(() => {
        if (event.type === 'stop') {
          const entry = this._clipIndex.get(event.clipId);
          if (entry) {
            this.stopColumn(entry.column);
          }
        } else {
          this.triggerClip(event.clipId);
        }
        onEventPlay(event.clipId);
      }, Tone.Ticks(absoluteTick));

      this._scheduledEventIds.add(id);
    });
  }

  /**
   * Synchronous version of playClipOverlay - doesn't wait for buffer loading
   * Buffers should already be loaded from preload
   * @param {string} clipId - The clip ID to play  
   * @param {number} time - Audio context time to start playback
   */
  _playClipOverlaySync(clipId, time) {
    const entry = this._clipIndex.get(clipId);
    if (!entry) return;

    const { clip } = entry;
    if (!clip.source) return;

    const durationMs = this._getClipDurationMs(clip);
    const audioTime = time ?? Tone.now();

    if (clip.source.kind === 'url') {
      const player = new Tone.Player(clip.source.url);
      player.loop = false;
      player.connect(this._master);
      
      // Start immediately - buffer should already be cached from preload
      // If not loaded yet, Tone.js will handle it gracefully
      try {
        player.start(audioTime);
      } catch {
        // If buffer not ready, try starting as soon as it's available
        player.autostart = true;
      }

      // Auto-dispose after playback completes
      setTimeout(() => {
        try {
          player.stop(Tone.now() + 0.05);
          setTimeout(() => {
            try { player.dispose(); } catch { /* ignore */ }
          }, 100);
        } catch {
          try { player.dispose(); } catch { /* ignore */ }
        }
      }, durationMs);
      
      return;
    }

    if (clip.source.kind === 'generated') {
      playGeneratedOneShot(clip.source.generator, { destination: this._master, time: audioTime });
    }
  }

  /**
   * Get BPM value
   * @returns {number}
   */
  getBpm() {
    return Tone.Transport.bpm.value;
  }

  /**
   * Render a recording to an audio buffer (WAV export)
   * @param {object} recording - Recording data from stopRecording()
   * @param {function} onProgress - Progress callback (0-1)
   * @returns {Promise<Blob>} WAV audio blob
   */
  async renderRecordingToAudio(recording, onProgress = () => {}) {
    if (!recording || !recording.events || recording.events.length === 0) {
      throw new Error('No recording to render');
    }

    const { events, bpm } = recording;
    
    // Calculate duration in seconds
    const ticksPerBeat = 480;
    const secondsPerBeat = 60 / bpm;
    const secondsPerTick = secondsPerBeat / ticksPerBeat;
    
    // Find the last event and add some padding for the audio to play
    const lastEventTicks = Math.max(...events.map(e => e.ticksFromStart));
    // Add 2 bars worth of time for loops to play
    const barsToAdd = 2;
    const ticksPerBar = ticksPerBeat * 4; // Assuming 4/4 time
    const totalTicks = lastEventTicks + (ticksPerBar * barsToAdd);
    const durationSeconds = totalTicks * secondsPerTick;

    onProgress(0.1);

    // Pre-load all audio buffers needed
    const urlsNeeded = new Set();
    for (const event of events) {
      const entry = this._clipIndex.get(event.clipId);
      if (entry?.clip?.source?.kind === 'url') {
        urlsNeeded.add(entry.clip.source.url);
      }
    }

    // Load buffers
    const bufferCache = new Map();
    const loadPromises = Array.from(urlsNeeded).map(async (url) => {
      try {
        const buffer = await Tone.ToneAudioBuffer.fromUrl(url);
        bufferCache.set(url, buffer);
      } catch (e) {
        console.warn('Failed to load buffer:', url, e);
      }
    });
    await Promise.all(loadPromises);

    onProgress(0.3);

    // Render offline
    const renderedBuffer = await Tone.Offline(({ transport }) => {
      transport.bpm.value = bpm;
      
      // Create a master gain
      const master = new Tone.Gain(0.9).toDestination();

      // Schedule all events
      events.forEach((event) => {
        const rawTick = event.playTickFromStart ?? event.ticksFromStart ?? 0;
        const timeInSeconds = Math.max(0, Number(rawTick) || 0) * secondsPerTick;
        const entry = this._clipIndex.get(event.clipId);
        
        if (!entry || !entry.clip?.source) return;
        if (event.type === 'stop') return; // Skip stop events for rendering

        const clip = entry.clip;

        if (clip.source.kind === 'url') {
          const cachedBuffer = bufferCache.get(clip.source.url);
          if (cachedBuffer) {
            const player = new Tone.Player(cachedBuffer).connect(master);
            player.start(timeInSeconds);
          }
        } else if (clip.source.kind === 'generated') {
          playGeneratedOneShot(clip.source.generator, { destination: master, time: timeInSeconds });
        }
      });

      transport.start(0);
    }, durationSeconds);

    onProgress(0.8);

    // Convert to WAV blob
    const wavBlob = await this._bufferToWav(renderedBuffer);
    
    onProgress(1.0);
    return wavBlob;
  }

  /**
   * Convert Tone.js buffer to WAV blob
   * @param {Tone.ToneAudioBuffer} buffer
   * @returns {Promise<Blob>}
   */
  async _bufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    
    // Get audio data
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    // Create WAV file
    const wavBuffer = new ArrayBuffer(44 + length * numChannels * 2);
    const view = new DataView(wavBuffer);

    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
    view.setUint16(32, numChannels * 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, length * numChannels * 2, true);

    // Write audio data (interleaved)
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([wavBuffer], { type: 'audio/wav' });
  }
}
