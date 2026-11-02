/** Крошечный синтезатор звуков на WebAudio — без звуковых файлов. */
class Sfx {
  ctx: AudioContext | null = null;
  noise: AudioBuffer | null = null;
  muted = false;
  private master: GainNode | null = null;

  init() {
    if (this.ctx) return;
    try {
      const C = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new C();
      const c = this.ctx!;
      this.master = c.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(c.destination);
      const len = c.sampleRate * 2;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.ambient();
    } catch { this.ctx = null; }
  }

  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6;
    return this.muted;
  }

  /** Тихий вой ветра над пустошью. */
  private ambient() {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.7;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08;
    const lfoG = c.createGain(); lfoG.gain.value = 250;
    lfo.connect(lfoG); lfoG.connect(f.frequency);
    const g = c.createGain(); g.gain.value = 0.05;
    src.connect(f); f.connect(g); g.connect(this.master!);
    src.start(); lfo.start();
  }

  private burst(dur: number, freq: number, vol: number, type: BiquadFilterType = 'lowpass') {
    if (!this.ctx || !this.noise) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master!);
    src.start(t, Math.random()); src.stop(t + dur);
  }

  private tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master!);
    o.start(t); o.stop(t + dur);
  }

  shot() { this.burst(0.28, 1700, 0.55); this.tone(140, 40, 0.15, 0.25, 'square'); }
  rifle() { this.burst(0.45, 1100, 0.65); this.tone(90, 30, 0.2, 0.25, 'square'); }
  slash() { this.burst(0.14, 3500, 0.3, 'highpass'); }
  hit() { this.tone(220, 60, 0.12, 0.18, 'sawtooth'); }
  magic() { this.tone(260, 900, 0.5, 0.12, 'sine'); this.tone(130, 460, 0.6, 0.08, 'triangle'); }
  whisper() { this.burst(0.9, 600, 0.25, 'bandpass'); this.tone(70, 50, 0.9, 0.12, 'sawtooth'); }
  boom() { this.burst(1.0, 420, 0.9); this.tone(60, 20, 0.6, 0.4, 'sine'); }
  summon() { this.tone(90, 35, 1.1, 0.22, 'sawtooth'); this.burst(0.8, 300, 0.3); }
  click() { this.tone(900, 600, 0.05, 0.06, 'square'); }
  step() { this.burst(0.05, 500, 0.05); }
}

export const SFX = new Sfx();
