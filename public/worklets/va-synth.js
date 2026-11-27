/*
 * HALCYON VA-8 — 8-voice virtual-analog polysynth engine.
 *
 * Per voice:  OSC1 (saw / square+PW / tri / sine / STACK = 7 detuned saws spread in stereo)
 *             OSC2 (saw / square / tri / sine, semitone + fine, hard sync, FM from OSC1)
 *             SUB (square, −1 oct), NOISE, RING (OSC1 × OSC2) → mixer → drive
 *             FILTER 1 (LP24 / LP12 / BP / HP) and FILTER 2 (LP / BP / HP, offset from F1)
 *             routed SERIAL / PARALLEL / F1 ONLY, stereo
 *             filter ADSR + amp ADSR, velocity, key tracking, glide
 * Global:     LFO1 (→ pitch, cutoff), LFO2 (→ PW, amp, pan), arpeggiator, voice modes.
 *
 * Messages in : {type:'params', values:{...}}  {type:'noteOn', note, vel}  {type:'noteOff', note}  {type:'allOff'}
 * Messages out: {type:'status', voices, arpNote}
 */

const TAU = Math.PI * 2;
const NVOICES = 8;
const STACK = [-1, -0.62, -0.3, 0, 0.3, 0.62, 1];
const ARP_DIV = [1, 0.5, 1 / 3, 0.25, 1 / 6, 0.125]; // beats per step: 1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32

const DEFAULTS = {
  o1Wave: 4,
  o1Semi: 0,
  o1Detune: 0.35,
  o1Spread: 0.7,
  o1PW: 0.5,
  o2Wave: 0,
  o2Semi: 7,
  o2Fine: 0,
  o2Sync: 0,
  o2FM: 0,
  mixO1: 0.8,
  mixO2: 0.0,
  mixSub: 0.0,
  mixNoise: 0,
  mixRing: 0,
  drive: 1,
  f1Mode: 0,
  cutoff: 3000,
  res: 0.25,
  envAmt: 0.3,
  keyTrack: 0.5,
  f2Mode: 0,
  f2Offset: 0,
  f2Res: 0.2,
  routing: 2,
  fA: 0.01,
  fD: 0.6,
  fS: 0.3,
  fR: 0.6,
  aA: 0.005,
  aD: 0.5,
  aS: 0.8,
  aR: 0.6,
  velAmp: 0.5,
  l1Shape: 0,
  l1Rate: 5,
  l1Pitch: 0,
  l1Cut: 0,
  l2Shape: 1,
  l2Rate: 0.3,
  l2PW: 0,
  l2Amp: 0,
  l2Pan: 0,
  voiceMode: 0,
  glide: 0,
  octave: 0,
  arpOn: 0,
  arpMode: 0,
  arpRate: 3,
  arpOct: 1,
  arpGate: 0.6,
  arpHold: 0,
  tempo: 128,
  volume: 0.7,
};

function polyblep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

class Env {
  constructor() {
    this.stage = 0; // 0 idle 1 attack 2 decay/sustain 3 release
    this.lvl = 0;
  }
  tick(aInc, dC, s, rC) {
    switch (this.stage) {
      case 1:
        this.lvl += aInc;
        if (this.lvl >= 1) {
          this.lvl = 1;
          this.stage = 2;
        }
        break;
      case 2:
        this.lvl = s + (this.lvl - s) * dC;
        break;
      case 3:
        this.lvl *= rC;
        if (this.lvl < 1e-5) {
          this.lvl = 0;
          this.stage = 0;
        }
        break;
      default:
        break;
    }
    return this.lvl;
  }
}

class Voice {
  constructor() {
    this.note = 60;
    this.vel = 1;
    this.gate = false;
    this.age = 0;
    this.pitch = 60;
    this.target = 60;
    this.ph = STACK.map(() => Math.random());
    this.ph2 = 0;
    this.phSub = 0;
    this.aenv = new Env();
    this.fenv = new Env();
    // filter state per channel: [F1a ic1, ic2, F1b ic1, ic2, F2 ic1, ic2]
    this.fL = new Float64Array(6);
    this.fR = new Float64Array(6);
    this.c1 = { a1: 0, a2: 0, a3: 0, k: 1 };
    this.c1b = { a1: 0, a2: 0, a3: 0, k: 1.414 };
    this.c2 = { a1: 0, a2: 0, a3: 0, k: 1 };
  }
  get active() {
    return this.aenv.stage !== 0;
  }
}

function coefs(c, fc, k) {
  const g = Math.tan((Math.PI * fc) / sampleRate);
  c.k = k;
  c.a1 = 1 / (1 + g * (g + k));
  c.a2 = g * c.a1;
  c.a3 = g * c.a2;
}

const out3 = { lp: 0, bp: 0, hp: 0 };
function svf(st, i, v0, c) {
  const ic1 = st[i];
  const ic2 = st[i + 1];
  const v3 = v0 - ic2;
  const v1 = c.a1 * ic1 + c.a2 * v3;
  const v2 = ic2 + c.a2 * ic1 + c.a3 * v3;
  st[i] = 2 * v1 - ic1;
  st[i + 1] = 2 * v2 - ic2;
  out3.lp = v2;
  out3.bp = v1;
  out3.hp = v0 - c.k * v1 - v2;
}

class VASynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = { ...DEFAULTS };
    this.voices = Array.from({ length: NVOICES }, () => new Voice());
    this.ageCounter = 0;
    this.lastNote = 60;
    this.monoStack = [];
    // LFO state
    this.l1 = 0;
    this.l2 = 0;
    this.sh1 = 0;
    this.sh2 = 0;
    // arpeggiator
    this.physical = [];
    this.arpList = [];
    this.arpIdx = -1;
    this.arpDir = 1;
    this.arpCounter = 0;
    this.arpOffAt = -1;
    this.arpNote = -1;
    this.statusCount = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    if (!m) return;
    if (m.type === 'params') Object.assign(this.p, m.values);
    else if (m.type === 'noteOn') this.keyOn(m.note, m.vel ?? 0.8);
    else if (m.type === 'noteOff') this.keyOff(m.note);
    else if (m.type === 'allOff') {
      this.physical = [];
      this.arpList = [];
      this.monoStack = [];
      this.stopArpNote();
      for (const v of this.voices) this.release(v);
    }
  }

  /* ---------------------------------------------------- key handling */
  keyOn(note, vel) {
    if (this.p.arpOn > 0.5) {
      if (this.p.arpHold > 0.5 && this.physical.length === 0) this.arpList = [];
      this.physical.push(note);
      if (!this.arpList.includes(note)) this.arpList.push(note);
      this.arpVel = vel;
      if (this.arpList.length === 1 && this.arpNote < 0) this.arpCounter = 0; // start right away
      return;
    }
    this.voiceOn(note, vel);
  }

  keyOff(note) {
    this.physical = this.physical.filter((n) => n !== note);
    if (this.p.arpOn > 0.5) {
      if (this.p.arpHold < 0.5) this.arpList = this.arpList.filter((n) => n !== note);
      return;
    }
    this.voiceOff(note);
  }

  voiceOn(note, vel) {
    const mode = Math.round(this.p.voiceMode);
    if (mode > 0) {
      // MONO / LEGATO: one voice, last-note priority
      const v = this.voices[0];
      this.monoStack = this.monoStack.filter((n) => n !== note);
      this.monoStack.push(note);
      const legato = mode === 2 && v.gate;
      this.startVoice(v, note, vel, !legato);
      return;
    }
    let v = this.voices.find((x) => x.gate && x.note === note) || this.voices.find((x) => !x.active);
    if (!v) v = this.voices.reduce((a, b) => (a.age < b.age ? a : b));
    this.startVoice(v, note, vel, true);
  }

  startVoice(v, note, vel, retrigger) {
    const from = v.active ? v.pitch : this.lastNote;
    v.note = note;
    v.target = note;
    v.pitch = this.p.glide > 0.001 ? from : note;
    v.vel = vel;
    v.gate = true;
    v.age = ++this.ageCounter;
    if (retrigger) {
      v.aenv.stage = 1;
      v.fenv.stage = 1;
      if (Math.round(this.p.o1Wave) !== 4) v.ph[3] = 0;
    }
    this.lastNote = note;
  }

  voiceOff(note) {
    const mode = Math.round(this.p.voiceMode);
    if (mode > 0) {
      const v = this.voices[0];
      this.monoStack = this.monoStack.filter((n) => n !== note);
      if (this.monoStack.length) {
        const n = this.monoStack[this.monoStack.length - 1];
        this.startVoice(v, n, v.vel, mode === 1);
      } else if (v.note === note) this.release(v);
      return;
    }
    for (const v of this.voices) if (v.gate && v.note === note) this.release(v);
  }

  release(v) {
    v.gate = false;
    if (v.aenv.stage !== 0) v.aenv.stage = 3;
    if (v.fenv.stage !== 0) v.fenv.stage = 3;
  }

  /* ---------------------------------------------------- arpeggiator */
  stopArpNote() {
    if (this.arpNote >= 0) this.voiceOff(this.arpNote);
    this.arpNote = -1;
  }

  arpStep(stepLen) {
    this.stopArpNote();
    const list = this.arpList;
    if (!list.length) return;
    const mode = Math.round(this.p.arpMode);
    const base = mode === 4 ? list.slice() : list.slice().sort((a, b) => a - b);
    const seq = [];
    const octs = Math.max(1, Math.round(this.p.arpOct));
    for (let o = 0; o < octs; o++) for (const n of base) seq.push(n + 12 * o);
    const len = seq.length;
    if (mode === 3) this.arpIdx = Math.floor(Math.random() * len);
    else if (mode === 1) this.arpIdx = this.arpIdx <= 0 || this.arpIdx >= len ? len - 1 : this.arpIdx - 1;
    else if (mode === 2) {
      if (len === 1) this.arpIdx = 0;
      else {
        let n = this.arpIdx + this.arpDir;
        if (n >= len) {
          this.arpDir = -1;
          n = len - 2;
        } else if (n < 0) {
          this.arpDir = 1;
          n = 1;
        }
        this.arpIdx = n;
      }
    } else this.arpIdx = (this.arpIdx + 1) % len;
    const note = seq[Math.min(len - 1, Math.max(0, this.arpIdx))];
    this.voiceOn(note, this.arpVel ?? 0.8);
    this.arpNote = note;
    this.arpOffAt = Math.max(1, Math.round(stepLen * this.p.arpGate));
  }

  /* ---------------------------------------------------------- render */
  lfo(shape, ph, sh) {
    switch (shape) {
      case 1:
        return 1 - 4 * Math.abs(ph - 0.5);
      case 2:
        return 2 * ph - 1;
      case 3:
        return ph < 0.5 ? 1 : -1;
      case 4:
        return sh;
      default:
        return Math.sin(TAU * ph);
    }
  }

  process(_inputs, outputs) {
    const L = outputs[0][0];
    const R = outputs[0][1];
    const n = L.length;
    const p = this.p;
    const sr = sampleRate;
    L.fill(0);
    R.fill(0);

    // --- per-block constants
    const o1Wave = Math.round(p.o1Wave);
    const o2Wave = Math.round(p.o2Wave);
    const f1Mode = Math.round(p.f1Mode);
    const f2Mode = Math.round(p.f2Mode);
    const routing = Math.round(p.routing);
    const sync = p.o2Sync > 0.5;
    const fEnvA = 1 / (Math.max(p.fA, 0.0005) * sr);
    const fEnvD = Math.exp(-4.6 / (Math.max(p.fD, 0.001) * sr));
    const fEnvR = Math.exp(-4.6 / (Math.max(p.fR, 0.001) * sr));
    const aEnvA = 1 / (Math.max(p.aA, 0.0005) * sr);
    const aEnvD = Math.exp(-4.6 / (Math.max(p.aD, 0.001) * sr));
    const aEnvR = Math.exp(-4.6 / (Math.max(p.aR, 0.001) * sr));
    const glideC = p.glide > 0.001 ? 1 - Math.exp(-1 / (p.glide * 0.3 * sr)) : 1;
    const k1 = 2 - 1.97 * p.res;
    const k2 = 2 - 1.97 * p.f2Res;
    const detune = p.o1Detune * 0.6; // semitones at the outer saws
    const spread = p.o1Spread;
    const stackNorm = (1 / Math.sqrt(STACK.length)) * 1.25;
    const nyq = sr * 0.45;
    const octShift = Math.round(p.octave) * 12;

    // --- arpeggiator clock
    const arpOn = p.arpOn > 0.5;
    const arpLen = Math.max(1, Math.round(((sr * 60) / p.tempo) * ARP_DIV[Math.round(p.arpRate)]));

    for (let i = 0; i < n; i++) {
      if (arpOn) {
        if (this.arpCounter <= 0) {
          this.arpCounter = arpLen;
          this.arpStep(arpLen);
        }
        this.arpCounter--;
        if (this.arpOffAt > 0 && --this.arpOffAt === 0) this.stopArpNote();
      } else if (this.arpNote >= 0) this.stopArpNote();

      // global LFOs
      this.l1 += p.l1Rate / sr;
      if (this.l1 >= 1) {
        this.l1 -= 1;
        this.sh1 = Math.random() * 2 - 1;
      }
      this.l2 += p.l2Rate / sr;
      if (this.l2 >= 1) {
        this.l2 -= 1;
        this.sh2 = Math.random() * 2 - 1;
      }
      const lfo1 = this.lfo(Math.round(p.l1Shape), this.l1, this.sh1);
      const lfo2 = this.lfo(Math.round(p.l2Shape), this.l2, this.sh2);
      const pan = lfo2 * p.l2Pan;
      const trem = 1 - p.l2Amp * (0.5 - 0.5 * lfo2);

      for (let vi = 0; vi < NVOICES; vi++) {
        const v = this.voices[vi];
        if (!v.active) continue;

        const fenv = v.fenv.tick(fEnvA, fEnvD, p.fS, fEnvR);
        const aenv = v.aenv.tick(aEnvA, aEnvD, p.aS, aEnvR);
        v.pitch += (v.target - v.pitch) * glideC;

        // filter coefficients every 16 samples
        if ((i & 15) === 0) {
          const oct = fenv * p.envAmt * 6 + p.keyTrack * ((v.pitch - 60) / 12) + lfo1 * p.l1Cut * 3;
          let fc = p.cutoff * Math.pow(2, oct);
          fc = fc < 20 ? 20 : fc > nyq ? nyq : fc;
          let fc2 = fc * Math.pow(2, p.f2Offset / 12);
          fc2 = fc2 < 20 ? 20 : fc2 > nyq ? nyq : fc2;
          coefs(v.c1, fc, k1);
          coefs(v.c1b, fc, 1.414);
          coefs(v.c2, fc2, k2);
        }

        // --- oscillators
        const basePitch = v.pitch + octShift + p.o1Semi + lfo1 * p.l1Pitch;
        const f1 = 440 * Math.pow(2, (basePitch - 69) / 12);
        let o1L = 0;
        let o1R = 0;
        let o1Mono; // assigned by every oscillator branch below
        let wrapped = false;
        if (o1Wave === 4) {
          for (let s = 0; s < STACK.length; s++) {
            const off = STACK[s];
            const fs = f1 * Math.pow(2, (off * detune) / 12);
            const dt = Math.min(fs / sr, 0.45);
            const t = v.ph[s];
            const saw = 2 * t - 1 - polyblep(t, dt);
            const gr = 0.5 + 0.5 * off * spread;
            o1L += saw * (1 - gr);
            o1R += saw * gr;
            v.ph[s] = t + dt;
            if (v.ph[s] >= 1) {
              v.ph[s] -= 1;
              if (s === 3) wrapped = true;
            }
          }
          o1L *= stackNorm * 2;
          o1R *= stackNorm * 2;
          o1Mono = (o1L + o1R) * 0.5;
        } else {
          const dt = Math.min(f1 / sr, 0.45);
          const t = v.ph[3];
          if (o1Wave === 0) o1Mono = 2 * t - 1 - polyblep(t, dt);
          else if (o1Wave === 1) {
            const pw = Math.min(0.95, Math.max(0.05, p.o1PW + lfo2 * p.l2PW));
            o1Mono = (t < pw ? 1 : -1) + polyblep(t, dt) - polyblep((t - pw + 1) % 1, dt);
          } else if (o1Wave === 2) o1Mono = 1 - 4 * Math.abs(t - 0.5);
          else o1Mono = Math.sin(TAU * t);
          v.ph[3] = t + dt;
          if (v.ph[3] >= 1) {
            v.ph[3] -= 1;
            wrapped = true;
          }
          o1L = o1R = o1Mono;
        }

        let f2 = 440 * Math.pow(2, (basePitch - p.o1Semi + p.o2Semi + p.o2Fine / 100 - 69) / 12);
        if (p.o2FM > 0) f2 += o1Mono * p.o2FM * f2 * 3;
        const dt2 = Math.min(Math.abs(f2) / sr, 0.45) || 1e-9;
        if (sync && wrapped) v.ph2 = 0;
        const t2 = v.ph2;
        let o2;
        if (o2Wave === 0) o2 = 2 * t2 - 1 - polyblep(t2, dt2);
        else if (o2Wave === 1) o2 = (t2 < 0.5 ? 1 : -1) + polyblep(t2, dt2) - polyblep((t2 + 0.5) % 1, dt2);
        else if (o2Wave === 2) o2 = 1 - 4 * Math.abs(t2 - 0.5);
        else o2 = Math.sin(TAU * t2);
        v.ph2 += f2 / sr;
        v.ph2 -= Math.floor(v.ph2);

        v.phSub += f1 / sr / 2;
        if (v.phSub >= 1) v.phSub -= 1;
        const sub = v.phSub < 0.5 ? 1 : -1;
        const noise = Math.random() * 2 - 1;
        const ring = o1Mono * o2;

        const common = o2 * p.mixO2 + sub * p.mixSub + noise * p.mixNoise + ring * p.mixRing;
        let xL = Math.tanh((o1L * p.mixO1 + common) * 0.5 * p.drive);
        let xR = Math.tanh((o1R * p.mixO1 + common) * 0.5 * p.drive);

        // --- filters (stereo)
        let yL = 0;
        let yR = 0;
        for (let ch = 0; ch < 2; ch++) {
          const st = ch === 0 ? v.fL : v.fR;
          const x = ch === 0 ? xL : xR;
          let f1out;
          if (f1Mode === 0) {
            svf(st, 0, x, v.c1b);
            svf(st, 2, out3.lp, v.c1);
            f1out = out3.lp;
          } else {
            svf(st, 2, x, v.c1);
            f1out = f1Mode === 1 ? out3.lp : f1Mode === 2 ? out3.bp : out3.hp;
          }
          let y = f1out;
          if (routing !== 2) {
            svf(st, 4, routing === 0 ? f1out : x, v.c2);
            const f2out = f2Mode === 0 ? out3.lp : f2Mode === 1 ? out3.bp : out3.hp;
            y = routing === 0 ? f2out : (f1out + f2out) * 0.6;
          }
          if (ch === 0) yL = y;
          else yR = y;
        }

        const amp = aenv * (1 - p.velAmp + p.velAmp * v.vel) * trem;
        L[i] += yL * amp * (1 - pan);
        R[i] += yR * amp * (1 + pan);
      }

      const vol = p.volume * p.volume * 1.5; // tanh soft-clip below keeps full chords in range
      L[i] = Math.tanh(L[i] * vol);
      R[i] = Math.tanh(R[i] * vol);
    }

    // guard against blow-ups
    for (const v of this.voices) {
      if (!Number.isFinite(v.fL[2]) || !Number.isFinite(v.fR[2])) {
        v.fL.fill(0);
        v.fR.fill(0);
      }
    }
    this.statusCount += n;
    if (this.statusCount >= 4096) {
      this.statusCount = 0;
      this.port.postMessage({
        type: 'status',
        voices: this.voices.filter((v) => v.active).length,
        arpNote: this.arpNote,
      });
    }
    return true;
  }
}

registerProcessor('va-synth', VASynthProcessor);
