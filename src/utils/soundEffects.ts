/**
 * Sound effects loaded from /public/sounds/*.mp3 (drop your own files there).
 * Falls back to a short synthesized tone if a file is missing or blocked.
 */
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

const missing = new Set<string>();

function playFile(src: string, fallback: () => void) {
  if (typeof window === "undefined") return;
  if (missing.has(src)) return fallback();
  const a = new Audio(src);
  let fellBack = false;
  const fb = () => { if (!fellBack) { fellBack = true; missing.add(src); fallback(); } };
  a.addEventListener("error", fb, { once: true });
  a.play().catch((e: unknown) => {
    // NotAllowedError = autoplay blocked; don't mark file as missing
    if (e instanceof DOMException && e.name === "NotAllowedError") return;
    fb();
  });
}

export function playCorrectSound() {
  playFile("/sounds/correct.mp3", () => {
    tone(880, 0, 0.35, "sine", 0.35);
    tone(1318.5, 0.18, 0.6, "sine", 0.35);
  });
}

export function playWrongSound() {
  playFile("/sounds/wrong.mp3", () => {
    tone(150, 0, 0.7, "sawtooth", 0.25, 110);
    tone(155, 0, 0.7, "square", 0.12, 112);
  });
}

/** Soft tick for the last seconds of a countdown. */
export function playTick() {
  tone(1200, 0, 0.06, "triangle", 0.15);
}

/** Drum roll from /sounds/drumroll.mp3 (looped), synth fallback. Returns a stop function. */
export function startDrumRoll(): () => void {
  if (typeof window === "undefined") return () => {};
  let stopSynth: (() => void) | null = null;
  let stopped = false;
  const a = new Audio("/sounds/drumroll.mp3");
  a.loop = true;
  const fb = () => { if (!stopped && !stopSynth) stopSynth = synthDrumRoll(); };
  a.addEventListener("error", fb, { once: true });
  a.play().catch((e: unknown) => {
    if (e instanceof DOMException && e.name === "NotAllowedError") return;
    fb();
  });
  return () => { stopped = true; a.pause(); a.currentTime = 0; stopSynth?.(); };
}

function synthDrumRoll(): () => void {
  const c = ac();
  if (!c) return () => {};
  const len = c.sampleRate * 0.05;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const master = c.createGain();
  master.gain.value = 0.18;
  master.connect(c.destination);
  let alive = true;
  let n = 0;
  const hit = () => {
    if (!alive) return;
    const s = c.createBufferSource();
    s.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.5 + 0.5 * Math.abs(Math.sin(n++ / 20));
    s.connect(g).connect(master);
    s.start();
  };
  const id = window.setInterval(hit, 55);
  return () => { alive = false; window.clearInterval(id); master.disconnect(); };
}

/** Victory fanfare from /sounds/fanfare.mp3, synth fallback. */
export function playFanfare() {
  playFile("/sounds/fanfare.mp3", () => {
    const notes: [number, number, number][] = [
      [523.25, 0, 0.18], [523.25, 0.2, 0.18], [523.25, 0.4, 0.18], [659.25, 0.6, 0.5],
      [587.33, 1.15, 0.18], [659.25, 1.35, 0.18], [783.99, 1.55, 1.2],
    ];
    for (const [f, t, d] of notes) {
      tone(f, t, d, "sawtooth", 0.12);
      tone(f * 2, t, d, "triangle", 0.08);
    }
  });
}
