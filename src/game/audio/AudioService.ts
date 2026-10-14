// Áudio procedural via WebAudio: efeitos sintetizados e música ambiente generativa por região.
// O contexto só é criado após um gesto do usuário (política de autoplay dos navegadores móveis)
// e nada bloqueia o carregamento do jogo.
export type SfxName =
  | 'hit' | 'swing' | 'bow' | 'wand' | 'energy' | 'fire' | 'ice' | 'earth' | 'holy' | 'heal' | 'buff' | 'brutal' | 'whirl'
  | 'hurt' | 'block' | 'miss' | 'monsterDeath' | 'death' | 'levelup' | 'coin' | 'pickup' | 'ui' | 'error' | 'door' | 'equip' | 'potion' | 'skill';

export type MusicTrack = 'town' | 'wild' | 'temple' | null;

export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
}

const SETTINGS_KEY = 'rpgzim:audio';
const DEFAULTS: AudioSettings = { master: 0.8, sfx: 0.8, music: 0.45, muted: false };

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AudioSettings>) };
  } catch {
    /* armazenamento indisponível */
  }
  return { ...DEFAULTS };
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioService {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private noise!: AudioBuffer;
  private settings: AudioSettings;
  private track: MusicTrack = null;
  private wantedTrack: MusicTrack = null;
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private lastPlay: Record<string, number> = {};
  private listeners = new Set<() => void>();

  constructor(settings: AudioSettings = loadAudioSettings()) {
    this.settings = settings;
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  getSettings(): AudioSettings {
    return this.settings;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setSettings(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignora */
    }
    this.applyVolumes();
    for (const l of this.listeners) l();
  }

  /** Deve ser chamado num gesto do usuário (toque/clique/tecla). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain.connect(this.master);
        this.musicGain.connect(this.master);
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (this.wantedTrack !== this.track) this.setMusic(this.wantedTrack);
    } catch {
      this.ctx = null;
    }
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.musicGain.gain.setTargetAtTime(s.music * 0.5, t, 0.3);
  }

  // ------------------------------------------------------------------ primitivas de síntese
  private tone(type: OscillatorType, f0: number, f1: number, start: number, dur: number, vol: number, out: AudioNode = this.sfxGain, attack = 0.005): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(out);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  private noiseBurst(start: number, dur: number, vol: number, filter: BiquadFilterType, f0: number, f1 = f0, q = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bq = ctx.createBiquadFilter();
    bq.type = filter;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, start);
    if (f1 !== f0) bq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(bq).connect(g).connect(this.sfxGain);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.05);
  }

  play(name: SfxName): void {
    if (!this.ctx || this.ctx.state !== 'running' || this.settings.muted) return;
    // evita empilhar o mesmo som no mesmo instante (ex.: área atingindo 5 monstros)
    const nowMs = performance.now();
    if (nowMs - (this.lastPlay[name] ?? 0) < 45) return;
    this.lastPlay[name] = nowMs;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'hit':
        this.noiseBurst(t, 0.09, 0.5, 'lowpass', 1400, 300);
        this.tone('sine', 140, 55, t, 0.12, 0.5);
        break;
      case 'swing':
        this.noiseBurst(t, 0.13, 0.22, 'bandpass', 2400, 500, 2);
        break;
      case 'bow':
        this.tone('triangle', 330, 180, t, 0.12, 0.25);
        this.noiseBurst(t, 0.05, 0.25, 'highpass', 3000);
        break;
      case 'wand':
      case 'fire':
        this.noiseBurst(t, 0.28, 0.35, 'bandpass', 900, 300, 1.5);
        this.tone('sawtooth', 220, 70, t, 0.25, 0.12);
        break;
      case 'energy':
        this.tone('square', 660, 990, t, 0.12, 0.12);
        this.tone('sine', 1320, 1980, t + 0.05, 0.18, 0.15);
        break;
      case 'ice':
        [1800, 2400, 3000].forEach((f, i) => this.tone('sine', f, f * 0.98, t + i * 0.04, 0.25, 0.1));
        this.noiseBurst(t, 0.15, 0.15, 'highpass', 5000);
        break;
      case 'earth':
        this.noiseBurst(t, 0.3, 0.45, 'lowpass', 300, 80);
        this.tone('sine', 90, 45, t, 0.3, 0.4);
        break;
      case 'holy':
        [880, 1320, 1760].forEach((f, i) => this.tone('sine', f, f, t + i * 0.03, 0.6, 0.1));
        break;
      case 'heal':
        [72, 76, 79, 84].forEach((n, i) => this.tone('triangle', NOTE(n), NOTE(n), t + i * 0.07, 0.3, 0.12));
        break;
      case 'buff':
        this.tone('sine', 400, 1200, t, 0.45, 0.15);
        this.tone('triangle', 600, 1800, t + 0.08, 0.4, 0.08);
        break;
      case 'brutal':
        this.tone('sawtooth', 110, 50, t, 0.25, 0.3);
        this.noiseBurst(t, 0.18, 0.5, 'lowpass', 1800, 200);
        break;
      case 'whirl':
        this.noiseBurst(t, 0.4, 0.3, 'bandpass', 400, 2400, 3);
        break;
      case 'hurt':
        this.tone('square', 300, 140, t, 0.1, 0.18);
        this.noiseBurst(t, 0.08, 0.3, 'lowpass', 1200);
        break;
      case 'block':
        this.tone('sine', 1500, 1400, t, 0.12, 0.2);
        this.tone('sine', 2250, 2200, t, 0.1, 0.12);
        this.noiseBurst(t, 0.05, 0.25, 'highpass', 2500);
        break;
      case 'miss':
        this.noiseBurst(t, 0.1, 0.12, 'bandpass', 1800, 900, 2);
        break;
      case 'monsterDeath':
        this.tone('sawtooth', 380, 70, t, 0.35, 0.18);
        this.noiseBurst(t + 0.05, 0.25, 0.2, 'lowpass', 800, 100);
        break;
      case 'death':
        [64, 60, 57, 52].forEach((n, i) => this.tone('triangle', NOTE(n), NOTE(n) * 0.98, t + i * 0.22, 0.5, 0.18));
        break;
      case 'levelup':
        [72, 76, 79, 84].forEach((n, i) => this.tone('square', NOTE(n), NOTE(n), t + i * 0.09, 0.18, 0.09));
        [72, 76, 79, 84].forEach((n) => this.tone('triangle', NOTE(n), NOTE(n), t + 0.4, 0.8, 0.08, this.sfxGain, 0.02));
        break;
      case 'skill':
        [79, 84].forEach((n, i) => this.tone('triangle', NOTE(n), NOTE(n), t + i * 0.08, 0.25, 0.12));
        break;
      case 'coin':
        this.tone('sine', 1318, 1318, t, 0.08, 0.15);
        this.tone('sine', 1760, 1760, t + 0.07, 0.18, 0.15);
        break;
      case 'pickup':
        this.tone('sine', 880, 1320, t, 0.1, 0.15);
        break;
      case 'ui':
        this.tone('sine', 1200, 1000, t, 0.03, 0.07);
        break;
      case 'error':
        this.tone('square', 150, 140, t, 0.12, 0.08);
        break;
      case 'door':
        this.noiseBurst(t, 0.18, 0.15, 'lowpass', 500, 200);
        this.tone('triangle', 180, 140, t, 0.15, 0.06);
        break;
      case 'equip':
        this.noiseBurst(t, 0.04, 0.2, 'highpass', 3000);
        this.tone('sine', 900, 700, t + 0.02, 0.08, 0.1);
        break;
      case 'potion':
        for (let i = 0; i < 4; i++) this.tone('sine', 400 + i * 120, 600 + i * 150, t + i * 0.05, 0.07, 0.08);
        break;
    }
  }

  // ------------------------------------------------------------------ música generativa
  setMusic(track: MusicTrack): void {
    this.wantedTrack = track;
    if (!this.ctx) return;
    if (track === this.track && this.scheduler) return;
    this.track = track;
    if (this.scheduler) clearInterval(this.scheduler);
    this.scheduler = null;
    if (!track) return;
    this.nextNoteTime = this.ctx.currentTime + 0.3;
    this.step = 0;
    this.scheduler = setInterval(() => this.schedule(), 120);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.track) return;
    const cfg = MUSIC[this.track];
    const stepDur = 60 / cfg.bpm / 2; // colcheias
    while (this.nextNoteTime < ctx.currentTime + 0.5) {
      const bar = Math.floor(this.step / 8) % cfg.chords.length;
      const chord = cfg.chords[bar]!;
      const beat = this.step % 8;
      const t = this.nextNoteTime;
      if (beat === 0) {
        this.tone('sine', NOTE(chord[0]! - 12), NOTE(chord[0]! - 12), t, stepDur * 7.5, 0.14, this.musicGain, 0.08);
        if (cfg.pad) for (const n of chord) this.tone('triangle', NOTE(n), NOTE(n), t, stepDur * 8, 0.035, this.musicGain, 0.4);
      }
      if (beat === 4 && cfg.bass) this.tone('sine', NOTE(chord[0]! - 12), NOTE(chord[0]! - 12), t, stepDur * 3.5, 0.1, this.musicGain, 0.05);
      if (Math.random() < cfg.density && !(beat % 2 === 1 && Math.random() < 0.5)) {
        const pool = [...chord, ...cfg.scale.filter((n) => Math.abs(n - chord[1]!) <= 7)];
        const n = pool[Math.floor(Math.random() * pool.length)]! + 12;
        this.tone(cfg.lead, NOTE(n), NOTE(n) * 0.998, t, stepDur * (Math.random() < 0.3 ? 3 : 1.6), 0.07, this.musicGain, 0.01);
      }
      this.nextNoteTime += stepDur;
      this.step++;
    }
  }
}

const MUSIC: Record<Exclude<MusicTrack, null>, { bpm: number; chords: number[][]; scale: number[]; density: number; lead: OscillatorType; pad: boolean; bass: boolean }> = {
  // vila: tom maior, alegre e calmo
  town: { bpm: 86, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], scale: [60, 62, 64, 67, 69, 72], density: 0.5, lead: 'triangle', pad: false, bass: true },
  // bosque: dórico, esparso e misterioso
  wild: { bpm: 72, chords: [[62, 65, 69], [60, 64, 67], [62, 65, 69], [57, 60, 64]], scale: [62, 64, 65, 67, 69, 71, 72], density: 0.32, lead: 'sine', pad: true, bass: true },
  // templo: acordes lentos e etéreos
  temple: { bpm: 56, chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], scale: [57, 59, 60, 62, 64, 67], density: 0.22, lead: 'sine', pad: true, bass: false },
};
