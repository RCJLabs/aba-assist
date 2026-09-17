import { browser } from '$app/environment';
import { putDrillAttempt } from '$lib/db/index.js';
import {
	toAttempt,
	toObservationAttempt,
	toPlotAttempt,
	type FinishedObservation,
	type FinishedPlot,
	type FinishedSitting
} from '$lib/drills/record.js';

/**
 * Writing a finished drill sitting.
 *
 * All that is left here after `$lib/drills/record.ts` took the mapping: a component may not
 * touch the database directly, so this is the door it goes through.
 */
export { pairKey, toAttempt, type FinishedSitting } from '$lib/drills/record.js';

/**
 * Store one sitting. Returns false if it could not be written.
 *
 * Failure is reported rather than thrown: a blocked IndexedDB is an ordinary state on this
 * app's platform — a private window, a browser with site storage off — and losing a drill
 * score is not worth an error screen over a page whose whole content is still on screen.
 */
export async function recordSitting(sitting: FinishedSitting): Promise<boolean> {
	if (!browser || sitting.questions.length === 0) return false;
	try {
		await putDrillAttempt(toAttempt(sitting, Date.now()));
		return true;
	} catch {
		return false;
	}
}

export { toObservationAttempt, toPlotAttempt, type FinishedObservation, type FinishedPlot };

/** Store one measurement sitting. Same failure posture as a pair sitting: reported, never thrown. */
export async function recordObservation(sitting: FinishedObservation): Promise<boolean> {
	if (!browser || sitting.opportunities <= 0) return false;
	try {
		await putDrillAttempt(toObservationAttempt(sitting, Date.now()));
		return true;
	} catch {
		return false;
	}
}

/** Store one graph sitting. Same failure posture: reported, never thrown. */
export async function recordPlot(sitting: FinishedPlot): Promise<boolean> {
	if (!browser || sitting.opportunities <= 0) return false;
	try {
		await putDrillAttempt(toPlotAttempt(sitting, Date.now()));
		return true;
	} catch {
		return false;
	}
}
