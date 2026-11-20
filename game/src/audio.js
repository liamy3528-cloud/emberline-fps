// Tiny synthesised sound: no audio files, no network. Everything is WebAudio
// oscillators and filtered noise, built lazily on the first user gesture so the
// page never asks for sound before the player clicks in. Pass { enabled: false }
// for deterministic captures, where sound would only spam the console.
export function createAudio(options = {}) {
  const enabled = options.enabled !== false;
  let ctx = null;
  let master = null;

  function ensure() {
    if (!enabled || ctx) return Boolean(ctx);
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBurst(seconds, filterFreq, gainValue) {
    if (!ensure()) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function tone(freq, seconds, type, gainValue, slideTo) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds + 0.02);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    shot(kind) {
      if (kind === 'shotgun') { noiseBurst(0.22, 900, 0.9); tone(90, 0.18, 'sine', 0.7, 45); }
      else if (kind === 'smg') { noiseBurst(0.08, 2400, 0.45); tone(180, 0.06, 'square', 0.18, 120); }
      else if (kind === 'pistol') { noiseBurst(0.1, 1800, 0.55); tone(150, 0.08, 'square', 0.22, 90); }
      else { noiseBurst(0.12, 1600, 0.6); tone(140, 0.09, 'sawtooth', 0.25, 70); }
    },
    distantShot() { noiseBurst(0.14, 500, 0.18); },
    reload() { tone(1200, 0.05, 'square', 0.12); setTimeout(() => tone(900, 0.05, 'square', 0.12), 180); },
    dryClick() { tone(2000, 0.03, 'square', 0.1); },
    hit() { tone(2600, 0.05, 'sine', 0.22); },
    kill() { tone(1800, 0.07, 'sine', 0.25); setTimeout(() => tone(2400, 0.09, 'sine', 0.25), 70); },
    hurt() { tone(220, 0.15, 'sawtooth', 0.3, 110); },
    plantTick() { tone(1100, 0.06, 'sine', 0.2); },
    plantDone() { tone(880, 0.12, 'sine', 0.25); setTimeout(() => tone(1320, 0.16, 'sine', 0.25), 120); },
    beep() { tone(980, 0.08, 'sine', 0.22); },
    explosion() {
      noiseBurst(0.9, 300, 1.0);
      tone(60, 0.8, 'sine', 0.9, 28);
      setTimeout(() => noiseBurst(0.5, 180, 0.5), 120);
    },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.25), i * 110)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.22), i * 130)); },
    flash() { noiseBurst(0.3, 3000, 0.4); tone(3200, 0.25, 'sine', 0.12, 2400); },
    buy() { tone(1500, 0.06, 'sine', 0.2); setTimeout(() => tone(1900, 0.08, 'sine', 0.2), 70); },
    denied() { tone(220, 0.12, 'square', 0.18); },
  };
}
