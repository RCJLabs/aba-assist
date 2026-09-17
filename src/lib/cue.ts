/**
 * The end-of-interval cue: a buzz, a tone, or both.
 *
 * Extracted because two features need the same one and neither should own it. The interval
 * timer cues a real session, where the reader is watching a learner; the measurement
 * rehearsal cues a simulated one, where they are watching the screen. Same signal, and
 * they disagree only about the default — see `sound` at each call site.
 *
 * The tone is synthesised rather than played from a file: no asset to ship, nothing to
 * fetch, and it works offline on the very first run, which matters because the buildings
 * this gets used in often have no signal.
 */
export class Cue {
	#audio: AudioContext | null = null;

	/**
	 * Open the audio device.
	 *
	 * Must be called from inside a tap. iOS refuses to create an AudioContext outside a user
	 * gesture, and a cue that silently never sounds is worse than one that was never offered.
	 */
	unlock(): void {
		try {
			this.#audio ??= new AudioContext();
			void this.#audio.resume();
		} catch {
			this.#audio = null;
		}
	}

	fire(options: { vibrate?: boolean; sound?: boolean } = {}): void {
		if (options.vibrate) {
			try {
				navigator.vibrate?.(180);
			} catch {
				// Unsupported or blocked; the other cues still fire.
			}
		}
		if (options.sound) this.#beep();
	}

	#beep(): void {
		const ctx = this.#audio;
		if (!ctx) return;
		try {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.frequency.value = 880;
			gain.gain.setValueAtTime(0.0001, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
			osc.connect(gain).connect(ctx.destination);
			osc.start();
			osc.stop(ctx.currentTime + 0.18);
		} catch {
			// Audio unavailable; the other cues still fire.
		}
	}
}
