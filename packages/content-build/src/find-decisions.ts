import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Finding the decisions file without being told where it is.
 *
 * The queue itself is now about as easy as it can be made — a sitting with a finish line,
 * every decision on one key. What was left was everything after it: export a file, go and
 * find where the browser put it, remember a command, type the path. Four steps of
 * administration on the end of a fifteen-minute job is how a fifteen-minute job stops
 * happening.
 *
 * So the file is looked for rather than asked for. `--file=` still works and still wins,
 * because a reviewer who knows exactly which file they mean should not have their choice
 * guessed at.
 */

/** What the app names its exports: `aba-assist-review-2026-09-18.json`. */
export const DECISIONS_PATTERN = /^aba-assist-review-\d{4}-\d{2}-\d{2}.*\.json$/;

/**
 * Where a browser is likely to have put it, most likely first.
 *
 * `Downloads` first because that is where every desktop browser puts a download without
 * asking. The project root is included last for the case of a file deliberately dropped
 * beside the repo, which is what somebody does on the second or third pass once they
 * have a routine.
 */
export function searchDirs(root: string, home = homedir()): string[] {
	// Deduplicated here rather than at the point of searching, so the list printed when
	// nothing is found is the same list that was actually looked at — running from the
	// project root otherwise names it twice and reads like a bug.
	return [
		...new Set([join(home, 'Downloads'), join(home, 'downloads'), home, process.cwd(), root])
	];
}

export interface FoundFile {
	path: string;
	modifiedAt: number;
}

/**
 * The newest decisions file in the likely places, or null.
 *
 * Newest by modification time rather than by the date in the name: two exports on the
 * same day share a name until the browser disambiguates them, and the copy the reviewer
 * just made is the one they mean. A directory that does not exist or cannot be read is
 * skipped rather than fatal — most of these will not exist on any given machine.
 */
export async function findNewestDecisions(dirs: readonly string[]): Promise<FoundFile | null> {
	let best: FoundFile | null = null;
	const seen = new Set<string>();

	for (const dir of dirs) {
		if (seen.has(dir)) continue;
		seen.add(dir);
		let names: string[];
		try {
			names = await readdir(dir);
		} catch {
			continue;
		}
		for (const name of names) {
			if (!DECISIONS_PATTERN.test(name)) continue;
			const path = join(dir, name);
			try {
				const info = await stat(path);
				if (!info.isFile()) continue;
				if (best === null || info.mtimeMs > best.modifiedAt) {
					best = { path, modifiedAt: info.mtimeMs };
				}
			} catch {
				// Vanished between listing and reading, or unreadable. Not ours to report.
			}
		}
	}

	return best;
}

/** How long ago, in words, so an old file being picked up is obvious rather than silent. */
export function describeAge(modifiedAt: number, now: number): string {
	const minutes = Math.max(0, Math.round((now - modifiedAt) / 60_000));
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
	const days = Math.round(hours / 24);
	return `${days} day${days === 1 ? '' : 's'} ago`;
}
