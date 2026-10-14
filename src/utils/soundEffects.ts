let ctx: AudioContext | null = null;
function ac() {
  if (typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain = 0.3, endFreq?: number) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.linearRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Bright rising two-tone "ding-dong". */
export function playCorrectSound() {
  tone(880, 0, 0.35, "sine", 0.35);
  tone(1318.5, 0.18, 0.6, "sine", 0.35);
}

/** Low, dull quiz buzzer "mööp". */
export function playWrongSound() {
  tone(150, 0, 0.7, "sawtooth", 0.25, 110);
  tone(155, 0, 0.7, "square", 0.12, 112);
}

/** Soft tick for the last seconds of a countdown. */
export function playTick() {
  tone(1200, 0, 0.06, "triangle", 0.15);
}
