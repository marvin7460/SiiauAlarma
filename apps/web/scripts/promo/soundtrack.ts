/**
 * The promo video's soundtrack, synthesized from scratch: no samples and no licenses to worry
 * about. A 128 BPM pop-electronic loop in C major (C–G–Am–F) plus sound effects on the video's
 * events. The tempo grid starts on the logo (4.0 s), so the drop lands exactly on the 0 → 1
 * (19.0 s) and the last chord on 34.0 s. The event times mirror video.html.
 */
import { writeFile } from "node:fs/promises";

export const SAMPLE_RATE = 48_000;
const SR = SAMPLE_RATE;
const TAU = Math.PI * 2;
const DURATION = 36;
const LENGTH = DURATION * SR;

const BPM = 128;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const GRID_START = 4.0;
const at = (bar: number, beat = 0): number => GRID_START + bar * BAR + beat * BEAT;

// ---- Building blocks ----------------------------------------------------------------------

/** Deterministic noise (mulberry32), so every render sounds the same. */
function makeNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return (((x ^ (x >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}
const noise = makeNoise(7);

const midi = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

/** RBJ biquad filter. */
class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  set(type: "lp" | "hp" | "bp", frequency: number, q = 0.707): this {
    const w = (TAU * Math.min(frequency, SR * 0.45)) / SR;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    let b: [number, number, number];
    if (type === "lp") b = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    else if (type === "hp") b = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else b = [alpha, 0, -alpha];
    this.b0 = b[0] / a0;
    this.b1 = b[1] / a0;
    this.b2 = b[2] / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
    return this;
  }

  run(x: number): number {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

function render(seconds: number, sample: (t: number, i: number) => number): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = sample(i / SR, i);
  return out;
}

/** Scales a sound so its loudest sample is 1, so gains below mean the same for every sound. */
function normalize(...channels: Float32Array[]): Float32Array[] {
  let peak = 1e-9;
  for (const channel of channels) for (const x of channel) peak = Math.max(peak, Math.abs(x));
  for (const channel of channels)
    for (let i = 0; i < channel.length; i++) channel[i] = (channel[i] ?? 0) / peak;
  return channels;
}
const norm = (sound: Float32Array): Float32Array => normalize(sound)[0] ?? sound;

/** PolyBLEP correction around a waveform's jump, so oscillators don't alias. */
function blep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}
/** Band-limited saw; `phase` in cycles, `dt` = frequency / sample rate. */
const saw = (phase: number, dt: number): number => {
  const t = phase % 1;
  return 2 * t - 1 - blep(t, dt);
};
/** Band-limited square. */
const square = (phase: number, dt: number): number => {
  const t = phase % 1;
  return (t < 0.5 ? 1 : -1) + blep(t, dt) - blep((t + 0.5) % 1, dt);
};

// ---- Instruments ----------------------------------------------------------------------------

function kick(): Float32Array {
  let phase = 0;
  return norm(
    render(0.45, (t) => {
      phase += (TAU * (46 + 110 * Math.exp(-t / 0.028))) / SR;
      const body = Math.sin(phase) * Math.min(1, t / 0.0015) * Math.exp(-t / 0.17);
      return body + noise() * Math.exp(-t / 0.0015) * 0.25;
    }),
  );
}

function clap(): Float32Array {
  const band = new Biquad().set("bp", 1400, 0.9);
  return norm(
    render(0.35, (t) => {
      let envelope = 0;
      for (const start of [0, 0.011, 0.022]) {
        if (t >= start) envelope = Math.max(envelope, Math.exp(-(t - start) / 0.0045));
      }
      if (t >= 0.03) envelope = Math.max(envelope, 0.8 * Math.exp(-(t - 0.03) / 0.09));
      return band.run(noise()) * envelope;
    }),
  );
}

function hat(decay: number, length: number, cutoff = 7500): Float32Array {
  const high = new Biquad().set("hp", cutoff, 0.7);
  return norm(render(length, (t) => high.run(noise()) * Math.exp(-t / decay)));
}

function bassNote(frequency: number, duration: number): Float32Array {
  const low = new Biquad();
  let a = 0;
  let b = 0.37;
  let sub = 0;
  return norm(
    render(duration + 0.05, (t, i) => {
      if (i % 32 === 0) low.set("lp", 220 + 1100 * Math.exp(-t / 0.05), 0.9);
      const da = frequency / SR;
      const db = (frequency * 1.006) / SR;
      a = (a + da) % 1;
      b = (b + db) % 1;
      sub += (TAU * frequency) / SR;
      const release = t < duration ? 1 : Math.max(0, 1 - (t - duration) / 0.05);
      const envelope = Math.min(1, t / 0.004) * release;
      return (low.run((saw(a, da) + saw(b, db)) * 0.5) + Math.sin(sub) * 0.45) * envelope;
    }),
  );
}

/** A soft, wide chord: three detuned saws per note, low-passed. Returns [left, right]. */
function pad(notes: number[], duration: number, cutoff: number): [Float32Array, Float32Array] {
  const voices = notes.flatMap((note, n) =>
    [-9, 0, 9].map((cents, k) => ({
      step: (midi(note) * Math.pow(2, cents / 1200)) / SR,
      phase: (n * 0.31 + k * 0.17) % 1,
      pan: (k - 1) * 0.7,
    })),
  );
  const lowL = new Biquad().set("lp", cutoff, 0.6);
  const lowR = new Biquad().set("lp", cutoff, 0.6);
  const length = Math.ceil((duration + 0.4) * SR);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SR;
    let l = 0;
    let r = 0;
    for (const voice of voices) {
      voice.phase = (voice.phase + voice.step) % 1;
      const x = saw(voice.phase, voice.step);
      l += x * (1 - voice.pan) * 0.5;
      r += x * (1 + voice.pan) * 0.5;
    }
    const release = t < duration ? 1 : Math.max(0, 1 - (t - duration) / 0.4);
    const envelope = Math.min(1, t / 0.08) * release;
    left[i] = lowL.run(l) * envelope;
    right[i] = lowR.run(r) * envelope;
  }
  const [nl, nr] = normalize(left, right);
  return [nl ?? left, nr ?? right];
}

function pluck(frequency: number, length = 0.45, brightness = 5000): Float32Array {
  const low = new Biquad();
  let a = 0;
  let b = 0;
  return norm(
    render(length, (t, i) => {
      if (i % 16 === 0) low.set("lp", 500 + brightness * Math.exp(-t / 0.05), 1.1);
      const da = frequency / SR;
      const db = (frequency * 2.002) / SR;
      a = (a + da) % 1;
      b = (b + db) % 1;
      const x = saw(a, da) * 0.7 + square(b, db) * 0.3;
      return low.run(x) * Math.min(1, t / 0.002) * Math.exp(-t / 0.16);
    }),
  );
}

/** FM bell, for the logo's ring. */
function bell(frequency: number, length = 2.4): Float32Array {
  return norm(
    render(length, (t) => {
      const index = 2.8 * Math.exp(-t / 0.35);
      const tone = Math.sin(TAU * frequency * t + index * Math.sin(TAU * frequency * 1.4 * t));
      const overtone = 0.35 * Math.sin(TAU * frequency * 2.76 * t) * Math.exp(-t / 0.4);
      return (tone + overtone) * Math.min(1, t / 0.002) * Math.exp(-t / 0.9);
    }),
  );
}

/** Two-note notification chime. */
function ding(first: number, second: number): Float32Array {
  const tone = (frequency: number, t: number): number =>
    t < 0
      ? 0
      : (Math.sin(TAU * frequency * t) + 0.25 * Math.sin(TAU * 2 * frequency * t)) *
        Math.min(1, t / 0.003) *
        Math.exp(-t / 0.3);
  return norm(render(1.1, (t) => tone(midi(first), t) * 0.8 + tone(midi(second), t - 0.085)));
}

function pop(from = 1100, to = 420): Float32Array {
  let phase = 0;
  return norm(
    render(0.14, (t) => {
      phase += (TAU * (to + (from - to) * Math.exp(-t / 0.018))) / SR;
      return Math.sin(phase) * Math.min(1, t / 0.001) * Math.exp(-t / 0.045);
    }),
  );
}

function tap(): Float32Array {
  let phase = 0;
  return norm(
    render(0.12, (t) => {
      phase += (TAU * (160 + 300 * Math.exp(-t / 0.01))) / SR;
      return Math.sin(phase) * Math.exp(-t / 0.03) * 0.7 + noise() * Math.exp(-t / 0.0025) * 0.5;
    }),
  );
}

function tick(): Float32Array {
  const high = new Biquad().set("hp", 2500, 0.8);
  return norm(
    render(0.03, (t) => {
      return (
        high.run(noise()) * Math.exp(-t / 0.0018) +
        Math.sin(TAU * 3200 * t) * Math.exp(-t / 0.003) * 0.5
      );
    }),
  );
}

function whoosh(length: number, from: number, to: number): Float32Array {
  const band = new Biquad();
  return norm(
    render(length, (t, i) => {
      const k = t / length;
      if (i % 32 === 0) band.set("bp", from * Math.pow(to / from, k), 0.8);
      return band.run(noise()) * Math.pow(Math.sin(Math.PI * k), 2);
    }),
  );
}

function riser(length: number): Float32Array {
  const band = new Biquad();
  let phase = 0;
  return norm(
    render(length, (t, i) => {
      const k = t / length;
      if (i % 32 === 0) band.set("bp", 300 * Math.pow(25, k), 1.2);
      phase += (TAU * 180 * Math.pow(4, k)) / SR;
      return (band.run(noise()) * 0.8 + Math.sin(phase) * 0.15) * k * k;
    }),
  );
}

function impact(): Float32Array {
  const low = new Biquad().set("lp", 900, 0.7);
  let phase = 0;
  return norm(
    render(1.6, (t) => {
      phase += (TAU * (42 + 60 * Math.exp(-t / 0.05))) / SR;
      return Math.sin(phase) * Math.exp(-t / 0.55) + low.run(noise()) * Math.exp(-t / 0.12) * 0.7;
    }),
  );
}

// ---- Effects --------------------------------------------------------------------------------

/** A small Freeverb: eight damped combs and four allpasses per side. */
function reverb(input: Float32Array, feedback = 0.8, damp = 0.3): [Float32Array, Float32Array] {
  const side = (spread: number): Float32Array => {
    const scale = SR / 44_100;
    const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => ({
      buffer: new Float32Array(Math.round((d + spread) * scale)),
      index: 0,
      store: 0,
    }));
    const allpasses = [556, 441, 341, 225].map((d) => ({
      buffer: new Float32Array(Math.round((d + spread) * scale)),
      index: 0,
    }));
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const x = (input[i] ?? 0) * 0.015;
      let y = 0;
      for (const comb of combs) {
        const delayed = comb.buffer[comb.index] ?? 0;
        comb.store = delayed * (1 - damp) + comb.store * damp;
        comb.buffer[comb.index] = x + comb.store * feedback;
        comb.index = (comb.index + 1) % comb.buffer.length;
        y += delayed;
      }
      for (const allpass of allpasses) {
        const delayed = allpass.buffer[allpass.index] ?? 0;
        allpass.buffer[allpass.index] = y + delayed * 0.5;
        allpass.index = (allpass.index + 1) % allpass.buffer.length;
        y = delayed - y;
      }
      out[i] = y;
    }
    return out;
  };
  return [side(0), side(23)];
}

/** Ping-pong delay: left and right echoes alternate. */
function pingPong(
  input: Float32Array,
  time: number,
  feedback: number,
): [Float32Array, Float32Array] {
  const d = Math.round(time * SR);
  const left = new Float32Array(input.length);
  const right = new Float32Array(input.length);
  for (let i = d; i < input.length; i++) {
    left[i] = (input[i - d] ?? 0) + (right[i - d] ?? 0) * feedback;
    right[i] = (left[i - d] ?? 0) * feedback;
  }
  return [left, right];
}

// ---- Mixing ---------------------------------------------------------------------------------

class Bus {
  readonly left = new Float32Array(LENGTH);
  readonly right = new Float32Array(LENGTH);

  /** Adds a mono sound at `time`, panned from -1 (left) to 1 (right). */
  mono(time: number, sound: Float32Array, gain: number, pan = 0): void {
    const angle = ((pan + 1) * Math.PI) / 4;
    this.stereo(
      time,
      sound,
      sound,
      gain * Math.cos(angle) * Math.SQRT2,
      gain * Math.sin(angle) * Math.SQRT2,
    );
  }

  stereo(
    time: number,
    left: Float32Array,
    right: Float32Array,
    gainL: number,
    gainR = gainL,
  ): void {
    const start = Math.round(time * SR);
    for (let i = 0; i < left.length; i++) {
      const j = start + i;
      if (j < 0 || j >= LENGTH) continue;
      this.left[j] = (this.left[j] ?? 0) + (left[i] ?? 0) * gainL;
      this.right[j] = (this.right[j] ?? 0) + (right[i] ?? 0) * gainR;
    }
  }

  add(other: Bus, gain = 1, envelope?: Float32Array): void {
    for (let i = 0; i < LENGTH; i++) {
      const g = gain * (envelope?.[i] ?? 1);
      this.left[i] = (this.left[i] ?? 0) + (other.left[i] ?? 0) * g;
      this.right[i] = (this.right[i] ?? 0) + (other.right[i] ?? 0) * g;
    }
  }
}

/** A mono send: sounds that also go to the reverb or the delay. */
class Send {
  readonly signal = new Float32Array(LENGTH);

  mono(time: number, sound: Float32Array, gain: number): void {
    const start = Math.round(time * SR);
    for (let i = 0; i < sound.length; i++) {
      const j = start + i;
      if (j >= 0 && j < LENGTH) this.signal[j] = (this.signal[j] ?? 0) + (sound[i] ?? 0) * gain;
    }
  }
}

// ---- The arrangement ----------------------------------------------------------------------

const C_MAJOR = { name: "C", bass: 48, notes: [60, 64, 67, 72] };
const CHORDS = [
  C_MAJOR,
  { name: "G", bass: 43, notes: [59, 62, 67, 71] },
  { name: "Am", bass: 45, notes: [60, 64, 69, 72] },
  { name: "F", bass: 41, notes: [60, 65, 69, 72] },
];
const chordOf = (bar: number) => CHORDS[((bar % 4) + 4) % 4] ?? C_MAJOR;

export function makeSoundtrack(): [Float32Array, Float32Array] {
  const drums = new Bus();
  const music = new Bus(); // ducked by the kick
  const sfx = new Bus();
  const reverbSend = new Send();
  const delaySend = new Send();
  const kicks: number[] = [];

  const sounds = {
    kick: kick(),
    clap: clap(),
    hat: hat(0.014, 0.09),
    openHat: hat(0.09, 0.35),
    crash: hat(0.8, 2.2, 4000),
    tick: tick(),
    tap: tap(),
    pop: pop(),
    popHigh: pop(1800, 900),
    impact: impact(),
  };
  const hit = (time: number): void => {
    drums.mono(time, sounds.kick, 0.55);
    kicks.push(time);
  };

  // Intro (0–4 s): a low drone, ticks that speed up with the reload counter, a riser.
  const [droneL, droneR] = pad([48, 55, 60], 3.9, 520);
  const drone = new Bus();
  drone.stereo(0, droneL, droneR, 0.34);
  for (let i = 0; i < 4 * SR; i++) {
    const fade = Math.min(1, i / SR / 3.5);
    drone.left[i] = (drone.left[i] ?? 0) * fade;
    drone.right[i] = (drone.right[i] ?? 0) * fade;
  }
  sfx.add(drone);
  // The video's counter: n = 1 + floor(((t - 1.3) / 2.6)^1.6 × 46). One tick per reload.
  for (let k = 1; k <= 46; k++) {
    const time = 1.3 + 2.6 * Math.pow(k / 46, 1 / 1.6);
    sfx.mono(time, sounds.tick, 0.3, k % 2 === 0 ? 0.25 : -0.25);
  }
  [0.1, 0.25, 0.43, 0.61, 0.79].forEach((time, i) => {
    sfx.mono(time, pop(700 + i * 80, 300 + i * 40), 0.12);
  });
  sfx.mono(1.05, whoosh(0.4, 400, 1600), 0.12);
  sfx.mono(2.1, riser(1.9), 0.42);
  // A muffled heartbeat under the hook, one per beat, until the logo.
  for (let time = 0.95; time < 3.8; time += BEAT) sfx.mono(time, sounds.kick, 0.3);

  // Logo (≈4 s): the circle wipe, a hit, the bell.
  sfx.mono(3.5, whoosh(0.55, 300, 3000), 0.3);
  sfx.mono(GRID_START, sounds.impact, 0.75);
  drums.mono(GRID_START, sounds.crash, 0.22);
  sfx.mono(4.22, pop(900, 300), 0.3);
  const ring = bell(midi(76));
  sfx.mono(4.75, ring, 0.32);
  reverbSend.mono(4.75, ring, 0.5);
  sfx.mono(4.92, sounds.popHigh, 0.18, 0.3);
  [84, 88, 91, 96].forEach((note, i) => {
    const sparkle = pluck(midi(note), 0.5, 7000);
    sfx.mono(4.8 + i * 0.05, sparkle, 0.07, i % 2 ? 0.4 : -0.4);
    reverbSend.mono(4.8 + i * 0.05, sparkle, 0.3);
  });

  // Music: bars 0–15, a breakdown in bar 7, the drop on bar 8 (19.0 s), the last chord on 34.0 s.
  for (let bar = 0; bar < 16; bar++) {
    const chord = chordOf(bar);
    const breakdown = bar === 7;
    const full = bar >= 2;
    const start = at(bar);

    const cutoff = breakdown ? 700 : bar >= 8 ? 2600 : 1800;
    const [l, r] = pad(chord.notes, BAR, cutoff);
    music.stereo(start, l, r, breakdown ? 0.2 : 0.17);

    if (!breakdown) {
      for (let beat = 0; beat < 4; beat++) {
        hit(at(bar, beat));
        music.mono(at(bar, beat + 0.5), bassNote(midi(chord.bass), BEAT * 0.42), 0.3);
        drums.mono(at(bar, beat + 0.5), sounds.hat, 0.11, 0.2);
        if (full) {
          drums.mono(at(bar, beat + 0.25), sounds.hat, 0.045, -0.2);
          drums.mono(at(bar, beat + 0.75), sounds.hat, 0.045, -0.2);
        }
        if (full && beat % 2 === 1) {
          drums.mono(at(bar, beat), sounds.clap, 0.42);
          reverbSend.mono(at(bar, beat), sounds.clap, 0.25);
        }
      }
      if (full) drums.mono(at(bar, 3.5), sounds.openHat, 0.08, 0.3);
    }

    // A 16th-note arpeggio over the chord, one octave up, from bar 2.
    if (full && !breakdown) {
      const tones = chord.notes.map((note) => note + 12);
      const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
      for (let step = 0; step < 16; step++) {
        const note = tones[pattern[step % 8] ?? 0] ?? 72;
        const sound = pluck(midi(note), 0.3, bar >= 8 ? 6000 : 3800);
        const time = at(bar, step / 4);
        music.mono(time, sound, step % 4 === 0 ? 0.1 : 0.07, step % 2 ? 0.35 : -0.35);
        delaySend.mono(time, sound, 0.04);
      }
    }
  }

  // Breakdown → drop: a clap roll, a riser, the 0 → 1 hit.
  sfx.mono(at(7, 0.5), riser(BAR - BEAT * 0.5), 0.34);
  for (let step = 0; step < 8; step++) {
    drums.mono(at(7, 2 + step / 4), sounds.clap, 0.08 + step * 0.04);
  }
  drums.mono(at(8), sounds.crash, 0.3);
  sfx.mono(at(8), sounds.impact, 0.7);
  drums.mono(at(12), sounds.crash, 0.2);

  // The end: one last chord, hit and ring.
  const end = at(16);
  hit(end);
  sfx.mono(end, sounds.impact, 0.6);
  drums.mono(end, sounds.crash, 0.28);
  const [endL, endR] = pad([48, 60, 64, 67, 72], 0.6, 2400);
  music.stereo(end, endL, endR, 0.18);
  const lastBell = bell(midi(72), 2);
  sfx.mono(end, lastBell, 0.25);
  reverbSend.mono(end, lastBell, 0.6);

  // ---- Sound effects on the video's events -------------------------------------------------
  const swish = (time: number, gain = 0.16): void => {
    sfx.mono(time, whoosh(0.3, 900, 3500), gain);
  };
  const touch = (time: number): void => {
    sfx.mono(time, sounds.tap, 0.38);
  };
  // 3–4. The phone.
  sfx.mono(7.0, whoosh(0.7, 250, 2500), 0.28);
  touch(9.15);
  swish(9.45);
  sfx.mono(10.15, pop(1300, 600), 0.2);
  touch(11.1);
  swish(11.45);
  swish(12.6, 0.12);
  [72, 76, 79].forEach((note, i) => {
    const sound = pluck(midi(note), 0.4, 6000);
    sfx.mono(13.05 + i * 0.22, sound, 0.2, 0.4);
    reverbSend.mono(13.05 + i * 0.22, sound, 0.35);
  });
  sfx.mono(13.7, pop(1300, 600), 0.2);
  swish(14.95, 0.1);
  touch(15.7);
  swish(16.0);
  const success = ding(79, 84);
  sfx.mono(16.45, success, 0.3);
  reverbSend.mono(16.45, success, 0.4);
  // 5. 0 → 1, then three alerts.
  sfx.mono(17.55, whoosh(0.5, 300, 3000), 0.26);
  sfx.mono(17.95, pop(700, 250), 0.25);
  for (let k = 0; k < 7; k++)
    sfx.mono(18.55 + 0.45 * (1 - Math.pow(1 - k / 7, 1.5)), sounds.tick, 0.18);
  sfx.mono(20.1, whoosh(0.5, 2500, 400), 0.14);
  [
    [20.9, 74, 79],
    [21.55, 71, 79],
    [22.2, 79, 86],
  ].forEach(([time = 0, first = 0, second = 0], i) => {
    const chime = ding(first, second);
    sfx.mono(time, chime, 0.32, (i - 1) * 0.3);
    reverbSend.mono(time, chime, 0.35);
  });
  // 6. Features: one note each, rising.
  sfx.mono(24.85, whoosh(0.55, 3000, 500), 0.24);
  [77, 81, 84, 89, 93].forEach((note, i) => {
    const sound = pluck(midi(note), 0.35, 5000);
    sfx.mono(25.55 + i * 0.32, sound, 0.13, 0.3);
    sfx.mono(25.55 + i * 0.32, sounds.pop, 0.08);
  });
  // 7. Call to action.
  sfx.mono(30.45, whoosh(0.7, 250, 3500), 0.28);
  sfx.mono(30.68, pop(900, 300), 0.28);
  const small = bell(midi(84), 1.6);
  sfx.mono(30.9, small, 0.14);
  reverbSend.mono(30.9, small, 0.4);
  sfx.mono(31.82, pop(1000, 380), 0.3);

  // ---- Master ---------------------------------------------------------------------------------
  // Sidechain: the music ducks under every kick, the classic "pumping" sound.
  const duck = new Float32Array(LENGTH).fill(1);
  for (const time of kicks) {
    const start = Math.round(time * SR);
    for (let i = 0; i < 0.35 * SR && start + i < LENGTH; i++) {
      const t = i / SR;
      const amount = 0.4 * (t < 0.01 ? t / 0.01 : Math.exp(-(t - 0.01) / 0.11));
      duck[start + i] = Math.min(duck[start + i] ?? 1, 1 - amount);
    }
  }

  const master = new Bus();
  master.add(drums);
  master.add(music, 1, duck);
  master.add(sfx);
  const [revL, revR] = reverb(reverbSend.signal);
  master.stereo(0, revL, revR, 0.6);
  const [delL, delR] = pingPong(delaySend.signal, BEAT * 0.75, 0.4);
  master.stereo(0, delL, delR, 0.5);

  // High-pass at 30 Hz, fade the last second, soft-clip.
  const rumbleL = new Biquad().set("hp", 30);
  const rumbleR = new Biquad().set("hp", 30);
  for (let i = 0; i < LENGTH; i++) {
    const t = i / SR;
    const fade = t > DURATION - 1 ? Math.max(0, (DURATION - t) / 1) : 1;
    master.left[i] = Math.tanh(rumbleL.run(master.left[i] ?? 0) * 1.1) * fade;
    master.right[i] = Math.tanh(rumbleR.run(master.right[i] ?? 0) * 1.1) * fade;
  }
  normalize(master.left, master.right);
  for (const channel of [master.left, master.right]) {
    for (let i = 0; i < channel.length; i++) channel[i] = (channel[i] ?? 0) * 0.9;
  }
  return [master.left, master.right];
}

/** 16-bit stereo WAV. */
export async function writeSoundtrack(file: string): Promise<void> {
  const [left, right] = makeSoundtrack();
  const data = Buffer.alloc(LENGTH * 4);
  for (let i = 0; i < LENGTH; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i] ?? 0)) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i] ?? 0)) * 32767), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  await writeFile(file, Buffer.concat([header, data]));
}
