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
import { cockpitRows } from './rows.js';
import type { Figure } from '$lib/ui/figures.js';
import type { DevelopmentRequirement, SupervisionRequirement } from '$lib/tracker/rules.js';
import { TRACKER_ROLE_KEY } from '$lib/state/mode.js';

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
	/** The figures under the dial, ready to render. Empty until storage has answered. */
	rows: Figure[];
}

export const EMPTY: HomeStrip = {
	dueCards: 0,
	attempts: 0,
	weakest: null,
	coverage: [],
	rows: []
};

export interface OutlineDomain {
	letter: string;
	name: string;
	examWeightPercent: number | null;
	examItems: number | null;
	tasks: { code: string }[];
}

/**
 * How many competency tasks the reader has ticked, where there is an assessment at all.
 *
 * Only the technician credential has one, so this returns null for everybody else rather
 * than inventing a denominator. The tick is the reader's own judgement and the row says
 * so — the real assessment is a person watching them work.
 */
function competencyProgress(
	credential: string,
	corpus: typeof import('$lib/content/corpus.js'),
	readiness: typeof import('$lib/state/readiness.js')
): { ready: number; total: number } | null {
	const assessment = corpus.competencyFor(credential);
	if (!assessment) return null;
	const saved = readiness.loadReadiness();
	const tasks = assessment.sections.flatMap((s) => s.tasks);
	return {
		ready: tasks.filter((t) => saved[readiness.readinessKey(assessment.id, t.number)]).length,
		total: tasks.length
	};
}

/**
 * The credential whose requirements the tracker rows report on.
 *
 * Not the exam mode. Supervision, development units and the competency assessment are
 * about the credential somebody holds, not the paper they are studying for — and the two
 * can differ, most obviously for a technician working towards the analyst exam. The mode
 * switch writes this key when a credential is picked, so the two agree by default without
 * the home page overruling a deliberate choice made on /tools.
 */
function trackerCredential(): string {
	try {
		const saved = localStorage.getItem(TRACKER_ROLE_KEY);
		if (saved === 'RBT' || saved === 'BCaBA' || saved === 'BCBA') return saved;
	} catch {
		// Storage blocked; the tracker's own default applies.
	}
	return 'RBT';
}

export async function loadStrip(
	credential: string,
	domains: OutlineDomain[],
	/** False in "Everything" mode, where nobody has said which paper they are sitting. */
	examChosen = true
): Promise<HomeStrip> {
	try {
		/*
		 * All split out of the entry bundle: none of it is needed to paint the page, and
		 * the credential corpus in particular is the largest thing the home page could
		 * accidentally pull in. The dial and the tiles render before any of this resolves.
		 */
		const [
			{ getAll, getAllCards, recentAttempts },
			{ domainStats },
			rules,
			corpus,
			readiness
		] = await Promise.all([
			import('$lib/db/index.js'),
			import('$lib/study/plan.js'),
			import('$lib/tracker/rules.js'),
			import('$lib/content/corpus.js'),
			import('$lib/state/readiness.js')
		]);
		const [cards, history, entries, serviceMonths, workplaces, cycles, units] =
			await Promise.all([
				getAllCards(),
				recentAttempts(200),
				getAll('supervisionEntries'),
				getAll('serviceMonths'),
				getAll('workplaces'),
				getAll('cycles'),
				getAll('developmentUnits')
			]);

		const now = Date.now();
		const mine = history.filter((a) => a.credential === credential);
		const stats = domainStats(domains, history, credential, [], new Set());

		// Only areas with enough answers to report, weakest first; ties go to the heavier
		// area, because that is where the time is better spent.
		const measured = stats
			.filter((s) => s.accuracy !== null)
			.sort((a, b) => a.accuracy! - b.accuracy! || (b.weight ?? 0) - (a.weight ?? 0));

		const dueCards = cards.filter((c) => c.due <= now && c.state !== 0).length;
		const weakest = measured[0]
			? {
					letter: measured[0].letter,
					name: measured[0].name,
					accuracy: measured[0].accuracy!
				}
			: null;

		/*
		 * Requirements come from the credential that was actually read into content, and
		 * only from that one — the same rule the tracker follows. Where a handbook has not
		 * been read, there is no requirement and the row simply does not appear, rather
		 * than the home page quoting somebody else's number at them.
		 */
		const held = trackerCredential();
		const facts = corpus.credentials[held.toLowerCase()];
		const supervision =
			(facts?.requirements?.supervision as SupervisionRequirement | null) ?? null;
		const development =
			(facts?.requirements?.development as DevelopmentRequirement | null) ?? null;
		const today = rules.todayIso();

		/*
		 * The running cycle, or the most recent one if they have all ended.
		 *
		 * The fallback is the point: a cycle that ended still owing units is the one state
		 * the reader cannot recover from — no grace period, nothing carries over — and
		 * dropping it because its end date has passed hides exactly the fact worth showing.
		 * Same rule the tracker's own `currentCycle` follows.
		 */
		const mineByEnd = cycles
			.filter((c) => c.credential === held)
			.sort((a, b) => a.endDate.localeCompare(b.endDate));
		const cycle = mineByEnd.find((c) => c.endDate >= today) ?? mineByEnd.at(-1);

		return {
			dueCards,
			attempts: mine.length,
			coverage: domainCoverage(domains, tasksExamined(history, credential)),
			weakest,
			rows: cockpitRows({
				dueCards,
				// Held back in "Everything" mode: the figure would be computed from the
				// technician outline, which is not an exam anybody named.
				weakest: examChosen ? weakest : null,
				weakestWeight: measured[0]?.weight ?? null,
				months: supervision ? rules.summariseMonths(entries, serviceMonths, supervision) : [],
				workplaceLabels: Object.fromEntries(workplaces.map((w) => [w.id, w.label])),
				supervision,
				cycle:
					cycle && development ? rules.summariseCycle(cycle, units, development, today) : null,
				development,
				competency: competencyProgress(held, corpus, readiness),
				today
			})
		};
	} catch {
		// No storage, or nothing stored. Either way there is nothing to add.
		return EMPTY;
	}
}
