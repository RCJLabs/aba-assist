import { browser } from '$app/environment';
import {
	plan as makePlan,
	positionAt,
	tally,
	type Method,
	type Plan,
	type Tally
} from '$lib/tools/interval.js';

const PREFS_KEY = 'aba-assist:interval-prefs';

export type TimerStatus = 'idle' | 'running' | 'finished';

interface Prefs {
	method: Method;
	intervalSeconds: number;
	totalMinutes: number;
	vibrate: boolean;
	sound: boolean;
}

const DEFAULTS: Prefs = {
	method: 'partial',
	intervalSeconds: 10,
	totalMinutes: 5,
	vibrate: true,
	// Off by default. A beep in a session is a stimulus change the plan did not ask for,
	// and it is audible to everybody in the room including the learner.
	sound: false
};

/**
 * The interval recording timer.
 *
 * Deliberately records nothing that outlives the run. The tally on screen is there so a
 * technician can copy totals onto whatever data sheet their organisation actually uses —
 * a per-interval record of one person's behaviour is client data, and the promise that
 * this app holds none is worth more than the convenience of keeping it. Only the
 * preferences persist.
 *
 * Timing is a start timestamp plus arithmetic, never a counter that gets decremented.
 * Browsers throttle timers in a background tab to about once a minute, phones lock, and a
 * tab can be discarded and restored — a counter would drift under all three, and a
 * drifting interval timer silently invalidates the data somebody collected with it.
 */
class IntervalTimer {
	status = $state<TimerStatus>('idle');
	method = $state<Method>(DEFAULTS.method);
	intervalSeconds = $state<number>(DEFAULTS.intervalSeconds);
	totalMinutes = $state<number>(DEFAULTS.totalMinutes);
	vibrate = $state(DEFAULTS.vibrate);
	sound = $state(DEFAULTS.sound);

	/** One entry per planned interval: true, false, or not yet scored. */
	marks = $state<(boolean | null)[]>([]);
	now = $state(0);
	startedAt = $state(0);
	/** Bumped at each boundary, so the page can flash without watching the clock. */
	cueCount = $state(0);
	wakeLockHeld = $state(false);

	#ticker: ReturnType<typeof setInterval> | null = null;
	#audio: AudioContext | null = null;
	#wakeLock: WakeLockSentinel | null = null;
	#lastIndex = -1;

	load(): void {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(PREFS_KEY);
			if (raw) {
				const p = JSON.parse(raw) as Partial<Prefs>;
				if (p.method) this.method = p.method;
				if (typeof p.intervalSeconds === 'number') this.intervalSeconds = p.intervalSeconds;
				if (typeof p.totalMinutes === 'number') this.totalMinutes = p.totalMinutes;
				if (typeof p.vibrate === 'boolean') this.vibrate = p.vibrate;
				if (typeof p.sound === 'boolean') this.sound = p.sound;
			}
		} catch {
			// Blocked or corrupt; the defaults are fine.
		}
	}

	savePrefs(): void {
		if (!browser) return;
		try {
			localStorage.setItem(
				PREFS_KEY,
				JSON.stringify({
					method: this.method,
					intervalSeconds: this.intervalSeconds,
					totalMinutes: this.totalMinutes,
					vibrate: this.vibrate,
					sound: this.sound
				} satisfies Prefs)
			);
		} catch {
			// Blocked; the settings just do not survive this visit.
		}
	}

	get plan(): Plan {
		return makePlan(this.intervalSeconds, this.totalMinutes);
	}

	get position() {
		return positionAt(this.now - this.startedAt, this.plan);
	}

	get tally(): Tally {
		return tally(this.marks);
	}

	get elapsedMs(): number {
		return Math.max(0, this.now - this.startedAt);
	}

	/**
	 * Start a run.
	 *
	 * Called from a tap, which matters for two reasons beyond intent: an AudioContext
	 * cannot be created outside a user gesture on iOS, and a wake lock request is only
	 * granted to a visible, interacted-with page.
	 */
	async start(): Promise<void> {
		if (!browser) return;
		const p = this.plan;
		this.marks = Array.from({ length: p.intervals }, () => null);
		this.startedAt = Date.now();
		this.now = this.startedAt;
		this.#lastIndex = 0;
		this.cueCount = 0;
		this.status = 'running';
		this.savePrefs();

		if (this.sound) this.#unlockAudio();
		await this.#acquireWakeLock();
		this.#ticker = setInterval(() => this.tick(), 200);
	}

	/**
	 * Re-read the clock and fire a cue for every boundary that has passed.
	 *
	 * Runs at 200ms so the countdown looks smooth, but nothing depends on the rate: the
	 * interval index comes from elapsed time, so a tick that arrives late — or a whole
	 * minute of ticks that never arrived because the tab was hidden — lands on the right
	 * interval anyway. `resync` exists for exactly that case.
	 */
	tick(): void {
		this.now = Date.now();
		const { index, finished } = this.position;
		if (index !== this.#lastIndex) {
			this.#lastIndex = index;
			this.#cue();
		}
		if (finished) this.finish();
	}

	/** After the page was hidden: catch up without replaying a minute of cues. */
	resync(): void {
		if (this.status !== 'running') return;
		this.now = Date.now();
		const { index, finished } = this.position;
		this.#lastIndex = index;
		if (finished) this.finish();
		else void this.#acquireWakeLock();
	}

	#cue(): void {
		this.cueCount += 1;
		if (this.vibrate) {
			try {
				navigator.vibrate?.(180);
			} catch {
				// Unsupported or blocked; the visual cue still fires.
			}
		}
		if (this.sound) this.#beep();
	}

	#unlockAudio(): void {
		try {
			this.#audio ??= new AudioContext();
			void this.#audio.resume();
		} catch {
			this.#audio = null;
		}
	}

	/**
	 * A short tone, synthesised rather than played from a file.
	 *
	 * No asset to ship, nothing to fetch, and it works offline on the first run — which
	 * matters because the building this gets used in often has no signal.
	 */
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

	/** Keep the screen on. This is a tool somebody watches for ten minutes without touching. */
	async #acquireWakeLock(): Promise<void> {
		if (!browser || this.#wakeLock) return;
		try {
			this.#wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
			this.wakeLockHeld = this.#wakeLock !== null;
			this.#wakeLock?.addEventListener('release', () => {
				this.#wakeLock = null;
				this.wakeLockHeld = false;
			});
		} catch {
			// Unsupported, or refused because the page is not visible.
			this.wakeLockHeld = false;
		}
	}

	#releaseWakeLock(): void {
		try {
			void this.#wakeLock?.release();
		} catch {
			// Already gone.
		}
		this.#wakeLock = null;
		this.wakeLockHeld = false;
	}

	/** Score the interval that just ended. Re-tapping the same answer clears it. */
	score(index: number, value: boolean): void {
		if (index < 0 || index >= this.marks.length) return;
		const next = [...this.marks];
		next[index] = next[index] === value ? null : value;
		this.marks = next;
	}

	/**
	 * Step one interval through not-scored, occurred, did not occur, and back.
	 *
	 * Three states rather than two because an interval nobody scored is not the same as
	 * one scored as a no, and because the grid is where mistakes get fixed — going round
	 * gets you to any answer without having to remember which control clears it.
	 */
	cycle(index: number): void {
		if (index < 0 || index >= this.marks.length) return;
		const next = [...this.marks];
		const at = next[index];
		next[index] = at === null ? true : at === true ? false : null;
		this.marks = next;
	}

	/** Score the interval currently being observed, which is what a thumb reaches for. */
	scoreCurrent(value: boolean): void {
		if (this.status !== 'running') return;
		this.score(this.position.index, value);
	}

	finish(): void {
		if (this.status !== 'running') return;
		this.stopClock();
		this.status = 'finished';
	}

	stopClock(): void {
		if (this.#ticker !== null) clearInterval(this.#ticker);
		this.#ticker = null;
		this.#releaseWakeLock();
	}

	/** Back to setup. The marks go with it — this was never a record. */
	reset(): void {
		this.stopClock();
		this.status = 'idle';
		this.marks = [];
		this.startedAt = 0;
		this.now = 0;
		this.cueCount = 0;
		this.#lastIndex = -1;
	}
}

export const intervalTimer = new IntervalTimer();
