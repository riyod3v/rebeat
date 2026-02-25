import * as Tone from 'tone';

export const Quantization = {
  none: 'none',
  bar: '1m',
  halfBar: '2n',
  quarter: '4n',
  eighth: '8n',
};

export function parseQuantizationToTicks(quantization) {
  if (!quantization || quantization === 'none') return 0;

  // Support a small, explicit set + basic Xm parsing.
  if (typeof quantization !== 'string') return 0;

  const ppq = Tone.Transport.PPQ;
  const timeSig = Tone.Transport.timeSignature;
  const numerator = Array.isArray(timeSig) ? timeSig[0] : timeSig;
  const measureTicks = ppq * Number(numerator || 4);

  const mMatch = quantization.match(/^(\d+)m$/);
  if (mMatch) {
    const measures = Number(mMatch[1]);
    return Math.max(0, measures) * measureTicks;
  }

  switch (quantization) {
    case '1m':
      return measureTicks;
    case '2n':
      return ppq * 2;
    case '4n':
      return ppq;
    case '8n':
      return Math.floor(ppq / 2);
    case '16n':
      return Math.floor(ppq / 4);
    default:
      return 0;
  }
}

export function nextQuantizedTick({ nowTicks, quantizationTicks, strictlyFuture = true }) {
  if (!quantizationTicks || quantizationTicks <= 0) return nowTicks;
  const remainder = ((nowTicks % quantizationTicks) + quantizationTicks) % quantizationTicks;
  if (remainder === 0) return strictlyFuture ? nowTicks + quantizationTicks : nowTicks;
  return nowTicks + (quantizationTicks - remainder);
}

export function ticksToSeconds(ticks) {
  return Tone.Transport.ticksToSeconds(ticks);
}
