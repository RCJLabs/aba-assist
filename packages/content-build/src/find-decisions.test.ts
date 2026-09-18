import { mkdtemp, mkdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	DECISIONS_PATTERN,
	describeAge,
	findNewestDecisions,
	searchDirs
} from './find-decisions.js';

const NOW = Date.parse('2026-09-18T19:00:00Z');
const MIN = 60_000;

/** A file with a controlled modification time, since "newest" is the whole question. */
async function put(dir: string, name: string, minutesAgo: number): Promise<string> {
	const path = join(dir, name);
	await writeFile(path, '{"reviewer":"tester","decisions":[]}');
	const when = new Date(Date.now() - minutesAgo * MIN);
	await utimes(path, when, when);
	return path;
}

describe('what counts as a decisions file', () => {
	it('matches what the app names its exports', () => {
		expect(DECISIONS_PATTERN.test('aba-assist-review-2026-09-18.json')).toBe(true);
	});

	it('matches a browser-disambiguated second copy', () => {
		// Downloading twice in a day is the ordinary case, and the copy named "(1)" is
		// usually the one meant.
		expect(DECISIONS_PATTERN.test('aba-assist-review-2026-09-18 (1).json')).toBe(true);
	});

	it('ignores anything else in the downloads folder', () => {
		for (const name of [
			'aba-assist-backup-2026-09-18.json',
			'review.json',
			'aba-assist-review.json',
			'aba-assist-review-2026-09-18.json.part',
			'notes.txt'
		]) {
			expect(DECISIONS_PATTERN.test(name)).toBe(false);
		}
	});
});

describe('where it looks', () => {
	it('tries the downloads folder first', () => {
		const dirs = searchDirs('/repo', '/home/someone');
		expect(dirs[0]).toBe(join('/home/someone', 'Downloads'));
	});

	it('names each place once', () => {
		/*
		 * Run from the project root, the working directory and the root are the same path.
		 * The list is printed when nothing is found, and naming a folder twice reads as a
		 * bug in the thing that is supposed to be helping.
		 */
		const dirs = searchDirs(process.cwd(), '/home/someone');
		expect(new Set(dirs).size).toBe(dirs.length);
	});
});

describe('finding the newest', () => {
	it('returns null when there is nothing to find', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'aba-find-'));
		expect(await findNewestDecisions([dir])).toBeNull();
	});

	it('skips directories that do not exist rather than failing', async () => {
		// Most of the places searched will not exist on any given machine.
		expect(await findNewestDecisions(['/no/such/place', '/nor/this'])).toBeNull();
	});

	it('picks the most recently modified, not the latest name', async () => {
		/*
		 * Two exports on the same day share a name until the browser disambiguates them,
		 * and re-exporting after fixing a flag is normal. The copy just made is the one
		 * the reviewer means, whatever it ended up called.
		 */
		const dir = await mkdtemp(join(tmpdir(), 'aba-find-'));
		await put(dir, 'aba-assist-review-2026-09-18.json', 120);
		const fresh = await put(dir, 'aba-assist-review-2026-09-01.json', 1);
		const found = await findNewestDecisions([dir]);
		expect(found?.path).toBe(fresh);
	});

	it('searches every place, not just the first with a hit', async () => {
		const older = await mkdtemp(join(tmpdir(), 'aba-find-a-'));
		const newer = await mkdtemp(join(tmpdir(), 'aba-find-b-'));
		await put(older, 'aba-assist-review-2026-09-18.json', 300);
		const fresh = await put(newer, 'aba-assist-review-2026-09-18.json', 2);
		expect((await findNewestDecisions([older, newer]))?.path).toBe(fresh);
	});

	it('ignores a directory that merely looks like one of ours', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'aba-find-'));
		await mkdir(join(dir, 'aba-assist-review-2026-09-18.json'));
		expect(await findNewestDecisions([dir])).toBeNull();
	});
});

describe('saying how old it is', () => {
	it('says just now for something seconds old', () => {
		expect(describeAge(NOW - 20_000, NOW)).toBe('just now');
	});

	it('counts minutes, then hours, then days', () => {
		expect(describeAge(NOW - 5 * MIN, NOW)).toBe('5 minutes ago');
		expect(describeAge(NOW - 3 * 60 * MIN, NOW)).toBe('3 hours ago');
		expect(describeAge(NOW - 50 * 60 * MIN, NOW)).toBe('2 days ago');
	});

	it('does not write "1 minutes"', () => {
		expect(describeAge(NOW - MIN, NOW)).toBe('1 minute ago');
		expect(describeAge(NOW - 60 * MIN, NOW)).toBe('1 hour ago');
	});

	it('reports a file from the future as just now rather than a negative age', () => {
		expect(describeAge(NOW + 10 * MIN, NOW)).toBe('just now');
	});
});
