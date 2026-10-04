/* =========================================================
   audio.js · SFX sintetizados con WebAudio (sin archivos)
   El AudioContext sólo se crea tras la primera interacción.
   ========================================================= */

let ac = null;
let master = null;
let noiseBuffer = null;
let unlocked = false;
let muted = false;

const LEVEL = 0.42;

function ensureCtx() {
  if (ac) return ac;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : LEVEL;
    master.connect(ac.destination);
  } catch (err) {
    ac = null;
  }
  return ac;
}

export function unlockAudio() {
  const c = ensureCtx();
  if (!c) return;
  unlocked = true;
  if (c.state === 'suspended') c.resume().catch(() => {});
}

export function isAudioMuted() {
  return muted;
}

export function setAudioMuted(value) {
  muted = !!value;
  if (master) master.gain.value = muted ? 0 : LEVEL;
}

function blip(opts) {
  if (!ac) return;
  const type = opts.type || 'square';
  const f0 = opts.f0 || 440;
  const f1 = opts.f1 || 0;
  const dur = opts.dur || 0.12;
  const vol = opts.vol == null ? 0.3 : opts.vol;
  const delay = opts.delay || 0;
  const t0 = ac.currentTime + delay;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 > 0 && f1 !== f0) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noiseHit(dur, vol, startFreq) {
  if (!ac) return;
  if (!noiseBuffer) {
    const len = Math.floor(ac.sampleRate * 0.4);
    noiseBuffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  const t0 = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(startFreq, t0);
  filter.frequency.exponentialRampToValueAtTime(110, t0 + dur);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t0);
  src.stop(t0 + dur);
}

export function playSfx(name) {
  if (muted || !unlocked || !ac) return;
  if (ac.state === 'suspended') ac.resume().catch(() => {});

  switch (name) {
    case 'eat':
      blip({ type: 'square', f0: 520, f1: 880, dur: 0.09, vol: 0.22 });
      break;
    case 'gold':
      blip({ type: 'triangle', f0: 784, dur: 0.08, vol: 0.3 });
      blip({ type: 'triangle', f0: 988, dur: 0.08, vol: 0.3, delay: 0.08 });
      blip({ type: 'triangle', f0: 1319, dur: 0.16, vol: 0.3, delay: 0.16 });
      break;
    case 'clock':
      blip({ type: 'square', f0: 880, dur: 0.05, vol: 0.22 });
      blip({ type: 'square', f0: 1108, dur: 0.05, vol: 0.22, delay: 0.08 });
      blip({ type: 'square', f0: 1319, dur: 0.14, vol: 0.24, delay: 0.16 });
      break;
    case 'start':
      blip({ type: 'square', f0: 392, dur: 0.09, vol: 0.24 });
      blip({ type: 'square', f0: 587, dur: 0.13, vol: 0.24, delay: 0.1 });
      break;
    case 'pause':
      blip({ type: 'square', f0: 440, f1: 300, dur: 0.12, vol: 0.2 });
      break;
    case 'resume':
      blip({ type: 'square', f0: 300, f1: 440, dur: 0.12, vol: 0.2 });
      break;
    case 'die':
      blip({ type: 'sawtooth', f0: 300, f1: 60, dur: 0.4, vol: 0.3 });
      noiseHit(0.35, 0.32, 1400);
      break;
    case 'record':
      [523, 659, 784, 1047].forEach((freq, i) => {
        blip({ type: 'square', f0: freq, dur: 0.13, vol: 0.24, delay: i * 0.1 });
      });
      break;
    case 'btn':
      blip({ type: 'square', f0: 660, dur: 0.05, vol: 0.15 });
      break;
    default:
      break;
  }
}
