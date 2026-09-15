/**
 * The app-wide exam mode, and the one piece of it that lives outside the filter.
 *
 * Picking a credential on the home page is meant to mean one thing, but the app keeps two
 * credential states: the content filter, which decides what the glossary, search,
 * flashcards, quiz and plan show, and the tracker's own role, which decides whose
 * supervision and development requirements are being checked. Choosing Analyst on the home
 * page and then finding the tracker still set to Technician is exactly the inconsistency
 * that makes a mode switch feel decorative.
 *
 * The key is written directly rather than by importing the tracker, which would pull the
 * database layer and the credential corpus into the home page's bundle — the thing the
 * performance budget exists to stop. The tracker reads this key when it loads, and owns
 * the key's definition; this module only names it.
 */
export const TRACKER_ROLE_KEY = 'aba-assist:tracker-credential';

/** Credentials the tracker can model. It has no "everything" option, and should not. */
const TRACKED = new Set(['RBT', 'BCaBA', 'BCBA']);

/**
 * Point the tracker at the same credential, where the choice names one.
 *
 * "Everything" leaves it alone: the tracker has to be checking somebody's requirements,
 * and silently resetting it to a default would lose a deliberate choice made on /tools.
 */
export function rememberTrackerRole(credential: string): void {
	if (!TRACKED.has(credential)) return;
	try {
		localStorage.setItem(TRACKER_ROLE_KEY, credential);
	} catch {
		// Storage blocked; the tracker keeps its own default.
	}
}
