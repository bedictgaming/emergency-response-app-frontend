/**
 * Emergency Siren Audio Synthesizer (Web Audio API)
 * Generates an authentic, loud, piercing emergency siren sound
 * without relying on external audio files or CORS.
 */

class SirenManager {
  private audioCtx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying: boolean = false;
  private modulationInterval: ReturnType<typeof setInterval> | null = null;
  private autoStopTimeout: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<(playing: boolean) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      // Auto-unlock AudioContext on first user gesture
      const unlockAudio = () => {
        this.getAudioContext();
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      };
      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public subscribe(cb: (playing: boolean) => void): () => void {
    this.listeners.add(cb);
    cb(this.isPlaying);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.isPlaying));
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Starts the loud emergency siren.
   * Alternates frequency rapidly between 750Hz and 1400Hz with high gain for maximum urgency.
   */
  public startSiren(options?: { durationSeconds?: number }): void {
    if (typeof window === 'undefined') return;

    // If already playing, refresh autoStop if provided
    if (this.isPlaying) {
      if (options?.durationSeconds) {
        if (this.autoStopTimeout) clearTimeout(this.autoStopTimeout);
        this.autoStopTimeout = setTimeout(() => this.stopSiren(), options.durationSeconds * 1000);
      }
      return;
    }

    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;

      // Master Gain for maximum audible loudness
      const masterGain = ctx.createGain();
      // Ramp volume up quickly to avoid harsh click
      masterGain.gain.setValueAtTime(0.01, now);
      masterGain.gain.exponentialRampToValueAtTime(0.9, now + 0.1);
      masterGain.connect(ctx.destination);
      this.gainNode = masterGain;

      // Primary oscillator: Sawtooth wave for piercing emergency tone
      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(800, now);

      // Secondary oscillator: Square wave slightly detuned for deep civil defense siren harmonic
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(790, now);

      osc1.connect(masterGain);
      osc2.connect(masterGain);

      osc1.start(now);
      osc2.start(now);

      this.osc1 = osc1;
      this.osc2 = osc2;
      this.isPlaying = true;
      this.notify();

      // Continuous pitch sweep: 750Hz <-> 1350Hz wail cycle
      let goingUp = true;
      const sweepCycle = () => {
        if (!this.isPlaying || !this.audioCtx || !this.osc1 || !this.osc2) return;
        const t = this.audioCtx.currentTime;
        const targetFreq = goingUp ? 1350 : 750;
        const sweepDuration = 0.55; // 0.55s per sweep cycle

        this.osc1.frequency.cancelScheduledValues(t);
        this.osc1.frequency.linearRampToValueAtTime(targetFreq, t + sweepDuration);

        this.osc2.frequency.cancelScheduledValues(t);
        this.osc2.frequency.linearRampToValueAtTime(targetFreq * 0.98, t + sweepDuration);

        goingUp = !goingUp;
      };

      sweepCycle();
      this.modulationInterval = setInterval(sweepCycle, 550);

      // Optional auto-stop timer
      if (options?.durationSeconds) {
        if (this.autoStopTimeout) clearTimeout(this.autoStopTimeout);
        this.autoStopTimeout = setTimeout(() => {
          this.stopSiren();
        }, options.durationSeconds * 1000);
      }
    } catch (err) {
      console.warn('Could not start emergency siren audio:', err);
    }
  }

  /**
   * Immediately stops the siren and silences audio.
   */
  public stopSiren(): void {
    if (this.modulationInterval) {
      clearInterval(this.modulationInterval);
      this.modulationInterval = null;
    }
    if (this.autoStopTimeout) {
      clearTimeout(this.autoStopTimeout);
      this.autoStopTimeout = null;
    }

    if (this.gainNode && this.audioCtx) {
      try {
        const now = this.audioCtx.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      } catch {
        // Ignore ramp error
      }
    }

    setTimeout(() => {
      if (this.osc1) {
        try { this.osc1.stop(); this.osc1.disconnect(); } catch {}
        this.osc1 = null;
      }
      if (this.osc2) {
        try { this.osc2.stop(); this.osc2.disconnect(); } catch {}
        this.osc2 = null;
      }
      this.gainNode = null;
      this.isPlaying = false;
      this.notify();
    }, 90);
  }

  /**
   * Test the siren for 3 seconds so the admin can verify speakers and allow audio.
   */
  public testSiren(): void {
    if (this.isPlaying) {
      this.stopSiren();
    } else {
      this.startSiren({ durationSeconds: 3.5 });
    }
  }
}

export const sirenManager = new SirenManager();
