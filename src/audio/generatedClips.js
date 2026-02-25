import * as Tone from 'tone';

function makeDrumKit() {
  const gain = new Tone.Gain(0.9);
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 10,
    envelope: { attack: 0.001, decay: 0.25, sustain: 0.0, release: 0.2 },
  });
  const snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0.0 },
  });
  const hat = new Tone.MetalSynth({
    frequency: 250,
    envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 2000,
    octaves: 1.5,
  });

  kick.connect(gain);
  snare.connect(gain);
  hat.connect(gain);

  return {
    output: gain,
    triggerKick: (time) => kick.triggerAttackRelease('C1', '16n', time),
    triggerSnare: (time) => snare.triggerAttackRelease('16n', time, 0.7),
    triggerHat: (time) => hat.triggerAttackRelease('16n', time, 0.25),
    dispose: () => {
      kick.dispose();
      snare.dispose();
      hat.dispose();
      gain.dispose();
    },
  };
}

function makeSynthVoice(type) {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.3 },
  });
  const filter = new Tone.Filter(1200, 'lowpass');
  const gain = new Tone.Gain(0.7);
  synth.chain(filter, gain);
  return {
    output: gain,
    trigger: (notes, dur, time, vel = 0.8) => synth.triggerAttackRelease(notes, dur, time, vel),
    dispose: () => {
      synth.dispose();
      filter.dispose();
      gain.dispose();
    },
  };
}

export function createGeneratedLoop(generator, { loopEnd = '1m' } = {}) {
  // Returns a node with start/stop, and an audio output.
  switch (generator) {
    case 'drumsA':
    case 'drumsB':
    case 'drumsFill': {
      const kit = makeDrumKit();
      const part = new Tone.Part((time, value) => {
        if (value.k) kit.triggerKick(time);
        if (value.s) kit.triggerSnare(time);
        if (value.h) kit.triggerHat(time);
      }, []);

      const steps = generator === 'drumsB'
        ? [
            { t: '0:0:0', v: { k: 1, h: 1 } },
            { t: '0:0:2', v: { h: 1 } },
            { t: '0:1:0', v: { s: 1, h: 1 } },
            { t: '0:1:2', v: { h: 1 } },
            { t: '0:2:0', v: { k: 1, h: 1 } },
            { t: '0:2:2', v: { h: 1 } },
            { t: '0:3:0', v: { s: 1, h: 1 } },
            { t: '0:3:2', v: { h: 1 } },
          ]
        : [
            { t: '0:0:0', v: { k: 1, h: 1 } },
            { t: '0:0:2', v: { h: 1 } },
            { t: '0:1:0', v: { s: 1, h: 1 } },
            { t: '0:1:2', v: { h: 1 } },
            { t: '0:2:0', v: { k: 1, h: 1 } },
            { t: '0:2:2', v: { h: 1 } },
            { t: '0:3:0', v: { s: 1, h: 1 } },
            { t: '0:3:2', v: { h: 1 } },
          ];

      const fill = [
        { t: '0:3:0', v: { s: 1, h: 1 } },
        { t: '0:3:1', v: { s: 1 } },
        { t: '0:3:2', v: { s: 1, h: 1 } },
        { t: '0:3:3', v: { s: 1 } },
      ];

      const events = generator === 'drumsFill' ? fill : steps;
      part.clear();
      events.forEach((e) => part.add(e.t, e.v));

      part.loop = generator !== 'drumsFill';
      part.loopEnd = loopEnd;

      return {
        output: kit.output,
        start: (time) => part.start(time),
        stop: (time) => part.stop(time),
        dispose: () => {
          part.dispose();
          kit.dispose();
        },
      };
    }

    case 'bassA':
    case 'bassB': {
      const voice = makeSynthVoice('sawtooth');
      const pattern = generator === 'bassB'
        ? [
            { t: '0:0:0', n: ['C2'] },
            { t: '0:1:0', n: ['Eb2'] },
            { t: '0:2:0', n: ['F2'] },
            { t: '0:3:0', n: ['G2'] },
          ]
        : [
            { t: '0:0:0', n: ['C2'] },
            { t: '0:2:0', n: ['F2'] },
            { t: '0:3:0', n: ['G2'] },
          ];

      const part = new Tone.Part((time, value) => {
        voice.trigger(value.n, '8n', time, 0.7);
      }, pattern.map((p) => [p.t, { n: p.n }]));

      part.loop = true;
      part.loopEnd = loopEnd;

      return {
        output: voice.output,
        start: (time) => part.start(time),
        stop: (time) => part.stop(time),
        dispose: () => {
          part.dispose();
          voice.dispose();
        },
      };
    }

    case 'chordsA':
    case 'chordsB': {
      const voice = makeSynthVoice('triangle');
      const chords = generator === 'chordsB'
        ? [
            { t: '0:0:0', n: ['C4', 'G4', 'Bb4'] },
            { t: '0:2:0', n: ['Ab3', 'Eb4', 'C5'] },
          ]
        : [
            { t: '0:0:0', n: ['C4', 'E4', 'G4'] },
            { t: '0:2:0', n: ['F3', 'A3', 'C4'] },
          ];

      const part = new Tone.Part((time, value) => {
        voice.trigger(value.n, '2n', time, 0.45);
      }, chords.map((c) => [c.t, { n: c.n }]));

      part.loop = true;
      part.loopEnd = loopEnd;

      return {
        output: voice.output,
        start: (time) => part.start(time),
        stop: (time) => part.stop(time),
        dispose: () => {
          part.dispose();
          voice.dispose();
        },
      };
    }

    case 'leadA':
    case 'leadB': {
      const voice = makeSynthVoice('square');
      const notes = generator === 'leadB'
        ? [
            { t: '0:0:0', n: ['G4'] },
            { t: '0:0:2', n: ['Bb4'] },
            { t: '0:1:0', n: ['C5'] },
            { t: '0:2:0', n: ['D5'] },
            { t: '0:3:0', n: ['C5'] },
          ]
        : [
            { t: '0:0:0', n: ['E4'] },
            { t: '0:1:0', n: ['G4'] },
            { t: '0:2:0', n: ['A4'] },
            { t: '0:3:0', n: ['G4'] },
          ];

      const part = new Tone.Part((time, value) => {
        voice.trigger(value.n, '8n', time, 0.4);
      }, notes.map((n) => [n.t, { n: n.n }]));

      part.loop = true;
      part.loopEnd = loopEnd;

      return {
        output: voice.output,
        start: (time) => part.start(time),
        stop: (time) => part.stop(time),
        dispose: () => {
          part.dispose();
          voice.dispose();
        },
      };
    }

    case 'customLoop1':
    case 'customLoop2': {
      const voice = makeSynthVoice(generator === 'customLoop1' ? 'sine' : 'sawtooth');
      const part = new Tone.Part((time, value) => {
        voice.trigger(value.n, '8n', time, 0.35);
      }, [
        ['0:0:0', { n: ['C5'] }],
        ['0:1:0', { n: ['D5'] }],
        ['0:2:0', { n: ['E5'] }],
        ['0:3:0', { n: ['G5'] }],
      ]);

      part.loop = true;
      part.loopEnd = loopEnd;

      return {
        output: voice.output,
        start: (time) => part.start(time),
        stop: (time) => part.stop(time),
        dispose: () => {
          part.dispose();
          voice.dispose();
        },
      };
    }

    default: {
      const voice = makeSynthVoice('sine');
      const part = new Tone.Part((time) => {
        voice.trigger(['C4'], '8n', time, 0.2);
      }, [['0:0:0', {}]]);
      part.loop = true;
      part.loopEnd = loopEnd;
      return {
        output: voice.output,
        start: (time) => part.start(time),
        stop: (time) => part.stop(time),
        dispose: () => {
          part.dispose();
          voice.dispose();
        },
      };
    }
  }
}

export function playGeneratedOneShot(generator, { destination, time }) {
  // For one-shots we just trigger a synth/noise at the scheduled time.
  switch (generator) {
    case 'bassHit': {
      const synth = new Tone.MonoSynth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.005, decay: 0.12, sustain: 0, release: 0.05 },
        filterEnvelope: { attack: 0.01, decay: 0.08, sustain: 0, release: 0.05, baseFrequency: 200, octaves: 2 },
      }).connect(destination);
      synth.triggerAttackRelease('C2', '16n', time, 0.9);
      window.setTimeout(() => synth.dispose(), 2500);
      return;
    }
    case 'chordsStab': {
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.0, release: 0.2 },
      }).connect(destination);
      synth.triggerAttackRelease(['C4', 'E4', 'G4'], '4n', time, 0.6);
      window.setTimeout(() => synth.dispose(), 3000);
      return;
    }
    case 'leadFx':
    case 'rise':
    case 'drop': {
      const noise = new Tone.NoiseSynth({
        noise: { type: 'pink' },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.0 },
      }).connect(destination);
      noise.triggerAttackRelease(generator === 'rise' ? '2n' : '8n', time, 0.5);
      window.setTimeout(() => noise.dispose(), 2500);
      return;
    }
    case 'customHit1':
    case 'customHit2': {
      const synth = new Tone.FMSynth().connect(destination);
      synth.triggerAttackRelease(generator === 'customHit1' ? 'C5' : 'G4', '16n', time, 0.35);
      window.setTimeout(() => synth.dispose(), 2000);
      return;
    }
    default: {
      const synth = new Tone.Synth().connect(destination);
      synth.triggerAttackRelease('C4', '16n', time, 0.2);
      window.setTimeout(() => synth.dispose(), 2000);
    }
  }
}
