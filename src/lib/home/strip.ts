/**
 * The one line of personal state the home page shows, loaded after the page is already
 * complete.
 *
 * The database layer is imported dynamically on purpose. A home page that cannot render
 * until IndexedDB has answered is a blank page for a first-time visitor and for a search
 * engine, and this is the app's main way of reaching the people who need it. So the page
 * renders in full with no data at all, and this fills a strip in afterwards if there is
 * anything to say.
 */
import { domainCoverage, tasksExamined, type CoverageDomain } from '$lib/study/coverage.js';

export interface HomeStrip {
	dueCards: number;
	attempts: number;
	/** The area worth working on, or null while there is not enough to say. */
	weakest: { letter: string; name: string; accuracy: number } | null;
	/**
	 * Task codes this reader has been asked about, area by area.
	 *
	 * Empty until storage has answered, which is why the dial is drawn from the outline
	 * first and filled in afterwards: the ring's shape is the exam and is known at build
	 * time; only the fill depends on the device.
	 */
	coverage: CoverageDomain[];
}

export const EMPTY: HomeStrip = { dueCards: 0, attempts: 0, weakest: null, coverage: [] };

export interface OutlineDomain {
	letter: string;
	name: string;
	examWeightPercent: number | null;
	examItems: number | null;
	tasks: { code: string }[];
}

export async function loadStrip(
	credential: string,
	domains: OutlineDomain[]
): Promise<HomeStrip> {
	try {
		// Split out of the entry bundle: nothing here is needed to paint the page.
		const [{ getAllCards, recentAttempts }, { domainStats }] = await Promise.all([
			import('$lib/db/index.js'),
			import('$lib/study/plan.js')
		]);
		const [cards, history] = await Promise.all([getAllCards(), recentAttempts(200)]);

		const now = Date.now();
		const mine = history.filter((a) => a.credential === credential);
		const stats = domainStats(domains, history, credential, [], new Set());

		// Only areas with enough answers to report, weakest first; ties go to the heavier
		// area, because that is where the time is better spent.
		const measured = stats
			.filter((s) => s.accuracy !== null)
			.sort((a, b) => a.accuracy! - b.accuracy! || (b.weight ?? 0) - (a.weight ?? 0));

		return {
			dueCards: cards.filter((c) => c.due <= now && c.state !== 0).length,
			attempts: mine.length,
			coverage: domainCoverage(domains, tasksExamined(history, credential)),
			weakest: measured[0]
				? {
						letter: measured[0].letter,
						name: measured[0].name,
						accuracy: measured[0].accuracy!
					}
				: null
		};
	} catch {
		// No storage, or nothing stored. Either way there is nothing to add.
		return EMPTY;
	}
}
