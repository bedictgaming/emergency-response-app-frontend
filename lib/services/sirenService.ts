/**
 * Emergency Siren Audio Synthesizer (Web Audio API)
 * Generates an authentic, loud, piercing emergency siren sound
 * without relying on external audio files or CORS.
 */

export interface SirenState {
  playing: boolean;
  audioReady: boolean;
  unavailable: boolean;
}

class SirenManager {
  private audioCtx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying: boolean = false;
  private modulationInterval: ReturnType<typeof setInterval> | null = null;
  private autoStopTimeout: ReturnType<typeof setTimeout> | null = null;
  private unavailable = false;
  private listeners: Set<(state: SirenState) => void> = new Set();

  public getState(): SirenState {
    const audioReady = this.audioCtx?.state === 'running' && !this.unavailable;
    return { playing: this.isPlaying && audioReady, audioReady, unavailable: this.unavailable };
  }

  /** Call only from a sound-control click or trusted gesture restoring saved consent; never background alerts. */
  public async enableAudio(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) throw new Error('Web Audio unavailable');
        this.audioCtx = new AudioContextClass();
        this.audioCtx.addEventListener('statechange', () => {
          // Do not leave oscillators queued to restart an acknowledged alert after interruption.
          if (this.audioCtx?.state !== 'running' && this.isPlaying) this.stopSiren();
          else this.notify();
        });
      }
      const ctx = this.audioCtx;
      if (ctx.state !== 'running') {
        await Promise.race([
          ctx.resume(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Audio activation timed out')), 3000);
          }),
        ]);
      }
      this.unavailable = ctx.state !== 'running';
      this.notify();
      return !this.unavailable;
    } catch {
      this.unavailable = true;
      this.notify();
      return false;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  public subscribe(cb: (state: SirenState) => void): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => this.listeners.delete(cb);
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((cb) => cb(state));
  }

  public getIsPlaying(): boolean {
    return this.getState().playing;
  }

  /**
   * Starts the loud emergency siren.
   * Alternates frequency rapidly between 750Hz and 1400Hz with high gain for maximum urgency.
   */
  public startSiren(options?: { durationSeconds?: number }): void {
    if (typeof window === 'undefined') return;
    const ctx = this.audioCtx;
    if (!ctx || ctx.state !== 'running') {
      this.notify();
      return;
    }

    // If already playing, refresh autoStop if provided
    if (this.isPlaying) {
      if (options?.durationSeconds) {
        if (this.autoStopTimeout) clearTimeout(this.autoStopTimeout);
        this.autoStopTimeout = setTimeout(() => this.stopSiren(), options.durationSeconds * 1000);
      } else if (this.autoStopTimeout) {
        // A live report replaces a short speaker test; do not stop the real alert on its timer.
        clearTimeout(this.autoStopTimeout);
        this.autoStopTimeout = null;
      }
      return;
    }

    try {
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
      this.osc1 = osc1;
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(800, now);

      // Secondary oscillator: Square wave slightly detuned for deep civil defense siren harmonic
      const osc2 = ctx.createOscillator();
      this.osc2 = osc2;
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
      this.stopSiren();
      this.unavailable = true;
      this.notify();
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

    // Capture this playback's nodes: a delayed cleanup must not stop a newer siren.
    const nodes = [this.osc1, this.osc2];
    const gain = this.gainNode;
    for (const node of nodes) {
      try { node?.stop((this.audioCtx?.currentTime ?? 0) + 0.08); } catch {}
    }
    this.osc1 = null;
    this.osc2 = null;
    this.gainNode = null;
    this.isPlaying = false;
    this.notify();
    setTimeout(() => {
      for (const node of nodes) { try { node?.disconnect(); } catch {} }
      try { gain?.disconnect(); } catch {}
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
