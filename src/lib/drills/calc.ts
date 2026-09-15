/**
 * Generated arithmetic drills for the measurement domain.
 *
 * The bank can ask whether a reader recognises a rate; it cannot give them practice
 * working one out, and it runs out. These problems are generated, so the supply is
 * endless and no two sittings are the same — and because nothing here is authored prose
 * about clinical practice, it adds nothing to the review queue.
 *
 * Every problem carries its own worked solution. That is the point: somebody who gets it
 * wrong needs to see where, and a bare "incorrect" teaches nothing. The numbers are
 * chosen to come out clean, so a wrong answer means a wrong method rather than a slip.
 */

export type DrillKind =
	| 'rate'
	| 'percentage'
	| 'mean-duration'
	| 'mean-latency'
	| 'interval-percentage'
	| 'ioa-total-count'
	| 'ioa-mean-count'
	| 'ioa-exact-agreement'
	| 'ioa-interval';

export interface DrillKindInfo {
	id: DrillKind;
	label: string;
	/** What the measure is, in one line, for somebody who has just got it wrong. */
	blurb: string;
	taskRefs: string[];
	termId: string;
}

export const DRILL_KINDS: DrillKindInfo[] = [
	{
		id: 'rate',
		label: 'Rate',
		blurb:
			'How often the behaviour happened per unit of time: the count divided by how long you observed.',
		taskRefs: ['A.6'],
		termId: 'frequency-and-rate'
	},
	{
		id: 'percentage',
		label: 'Percentage of opportunities',
		blurb:
			'What share of the chances the learner got it right: correct divided by total, times a hundred.',
		taskRefs: ['A.6'],
		termId: 'percentage'
	},
	{
		id: 'mean-duration',
		label: 'Mean duration',
		blurb: 'The average length of an episode: total time divided by the number of episodes.',
		taskRefs: ['A.6'],
		termId: 'duration'
	},
	{
		id: 'mean-latency',
		label: 'Mean latency',
		blurb: 'The average wait between the instruction and the response starting.',
		taskRefs: ['A.6'],
		termId: 'latency'
	},
	{
		id: 'interval-percentage',
		label: 'Percentage of intervals',
		blurb:
			'What sampling procedures report: intervals scored divided by intervals observed, times a hundred.',
		taskRefs: ['A.2', 'A.6'],
		termId: 'partial-interval-recording'
	},
	{
		id: 'ioa-total-count',
		label: 'Agreement — total count',
		blurb:
			'The roughest agreement check: the smaller total divided by the larger, times a hundred.',
		taskRefs: ['A.8'],
		termId: 'interobserver-agreement'
	},
	{
		id: 'ioa-mean-count',
		label: 'Agreement — mean count per interval',
		blurb:
			'Agreement worked out inside each interval and then averaged, so offsetting errors cannot cancel out.',
		taskRefs: ['A.8'],
		termId: 'interobserver-agreement'
	},
	{
		id: 'ioa-exact-agreement',
		label: 'Agreement — exact count',
		blurb:
			'The strictest count check: only intervals where both observers wrote the same number count as agreement.',
		taskRefs: ['A.8'],
		termId: 'interobserver-agreement'
	},
	{
		id: 'ioa-interval',
		label: 'Agreement — interval by interval',
		blurb:
			'For scored intervals: the intervals you both marked the same way, out of all intervals.',
		taskRefs: ['A.8'],
		termId: 'interobserver-agreement'
	}
];

export const drillKind = (id: DrillKind): DrillKindInfo =>
	DRILL_KINDS.find((k) => k.id === id) ?? DRILL_KINDS[0];

export interface Drill {
	kind: DrillKind;
	question: string;
	/** The data, as label/value rows, so the numbers are readable rather than buried. */
	given: { label: string; value: string }[];
	answer: number;
	unit: string;
	/** How close counts as right. Generated numbers are clean, so this is for rounding. */
	tolerance: number;
	/** Shown after answering, right or wrong. */
	working: string[];
}

export type Rng = () => number;

const pick = <T>(list: readonly T[], rng: Rng): T =>
	list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

const intBetween = (lo: number, hi: number, rng: Rng): number =>
	lo + Math.min(hi - lo, Math.floor(rng() * (hi - lo + 1)));

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number) => Math.round(n);

/** Behaviours the problems are about, so the wording is not always the same sentence. */
const BEHAVIOURS = [
	'hand raising',
	'requesting with a picture card',
	'leaving the seat',
	'completing a step unprompted',
	'calling out',
	'greeting a peer'
];

function makeRate(rng: Rng): Drill {
	/*
	 * The rate is chosen first and the count derived from it, with the halves dropped
	 * whenever they would not divide into the observation time. Otherwise a "clean"
	 * problem can land on 2.5 occurrences, and a reader who does the arithmetic correctly
	 * gets marked wrong by a rounding step they never saw.
	 */
	const minutes = pick([5, 10, 15, 20, 30], rng);
	const rates = [0.5, 1, 1.5, 2, 2.5, 3, 4].filter((r) => Number.isInteger(r * minutes));
	const perMinute = pick(rates, rng);
	const count = perMinute * minutes;
	const behaviour = pick(BEHAVIOURS, rng);
	return {
		kind: 'rate',
		question: `You observed ${behaviour} for the whole session and counted every occurrence. What was the rate, per minute?`,
		given: [
			{ label: 'Occurrences counted', value: String(count) },
			{ label: 'Observation length', value: `${minutes} minutes` }
		],
		answer: round1(count / minutes),
		unit: 'per minute',
		tolerance: 0.05,
		working: [
			'Rate is a count divided by the time you spent observing.',
			`${count} ÷ ${minutes} = ${round1(count / minutes)} per minute.`,
			'Reporting the observation time matters: the same count over twice the time is half the rate.'
		]
	};
}

function makePercentage(rng: Rng): Drill {
	// Same rule: only shares that give a whole number of correct responses.
	const total = pick([10, 20, 25, 40, 50], rng);
	const shares = [10, 20, 25, 40, 50, 60, 70, 75, 80, 90].filter((p) =>
		Number.isInteger((total * p) / 100)
	);
	const share = pick(shares, rng);
	const correct = (total * share) / 100;
	return {
		kind: 'percentage',
		question: 'What percentage of the opportunities did the learner respond correctly to?',
		given: [
			{ label: 'Correct responses', value: String(correct) },
			{ label: 'Opportunities presented', value: String(total) }
		],
		answer: pct((100 * correct) / total),
		unit: '%',
		tolerance: 0.5,
		working: [
			'A percentage of opportunities is the correct responses divided by the chances to respond.',
			`${correct} ÷ ${total} = ${round1((correct / total) * 100) / 100}, and × 100 = ${pct((100 * correct) / total)}%.`,
			'A percentage says nothing about how many chances there were. Ten out of ten and one out of one are both 100%.'
		]
	};
}

function makeMean(kind: 'mean-duration' | 'mean-latency', rng: Rng): Drill {
	const n = pick([4, 5, 6, 8], rng);
	const mean = pick([6, 8, 10, 12, 15, 20, 25], rng);
	const total = n * mean;
	const duration = kind === 'mean-duration';
	return {
		kind,
		question: duration
			? 'What was the mean duration of an episode, in seconds?'
			: 'What was the mean latency from the instruction to the start of the response, in seconds?',
		given: [
			{ label: duration ? 'Episodes recorded' : 'Instructions given', value: String(n) },
			{
				label: duration ? 'Total time in the behaviour' : 'Total waiting time',
				value: `${total} seconds`
			}
		],
		answer: total / n,
		unit: 'seconds',
		tolerance: 0.05,
		working: [
			duration
				? 'Mean duration is the total time in the behaviour divided by how many episodes there were.'
				: 'Mean latency is the total of the waits divided by how many instructions there were.',
			`${total} ÷ ${n} = ${total / n} seconds.`,
			'An average hides the spread: several short episodes and one very long one can give the same mean as several middling ones.'
		]
	};
}

function makeIntervalPercentage(rng: Rng): Drill {
	const method = pick(
		['partial interval', 'whole interval', 'momentary time sampling'] as const,
		rng
	);
	const total = pick([10, 20, 25, 40, 50], rng);
	const scored = intBetween(1, total - 1, rng);
	return {
		kind: 'interval-percentage',
		question: `You ran ${method} recording. What percentage of intervals were scored?`,
		given: [
			{ label: 'Intervals scored', value: String(scored) },
			{ label: 'Intervals observed', value: String(total) }
		],
		answer: pct((100 * scored) / total),
		unit: '%',
		tolerance: 0.5,
		working: [
			'Sampling procedures report intervals, not occurrences: scored intervals divided by intervals observed.',
			`${scored} ÷ ${total} × 100 = ${pct((100 * scored) / total)}%.`,
			'This is an estimate of time, not a count. Partial interval tends to overestimate and whole interval to underestimate.'
		]
	};
}

function makeIoaTotalCount(rng: Rng): Drill {
	const larger = intBetween(12, 40, rng);
	const smaller = larger - intBetween(1, Math.max(1, Math.floor(larger / 4)), rng);
	return {
		kind: 'ioa-total-count',
		question:
			'Two observers counted the same session independently. What is total count agreement, to the nearest whole percent?',
		given: [
			{ label: 'Observer A counted', value: String(larger) },
			{ label: 'Observer B counted', value: String(smaller) }
		],
		answer: pct((100 * smaller) / larger),
		unit: '%',
		tolerance: 0.5,
		working: [
			'Total count agreement is the smaller total divided by the larger, times a hundred.',
			`${smaller} ÷ ${larger} × 100 = ${pct((100 * smaller) / larger)}%.`,
			'It is the most forgiving of the count methods: two observers can disagree about every single occurrence and still reach 100%, as long as their totals match.'
		]
	};
}

/**
 * Pairs whose agreement is an exact whole percentage.
 *
 * So that the working reproduces the answer. Averaging rounded per-interval figures can
 * land a whole percent away from averaging the exact ones, and a reader who follows the
 * steps and gets a different number to the one on screen has been taught that the app
 * cannot be trusted rather than how the method works.
 */
const CLEAN_PAIRS: readonly [number, number][] = [
	[0, 3],
	[1, 2],
	[1, 4],
	[3, 4],
	[1, 5],
	[2, 5],
	[3, 5],
	[4, 5],
	[2, 4],
	[3, 6],
	[4, 4],
	[5, 5],
	[2, 8],
	[6, 8]
];

function makeIoaMeanCount(rng: Rng): Drill {
	const n = pick([4, 5], rng);
	const a: number[] = [];
	const b: number[] = [];
	for (let i = 0; i < n; i++) {
		// The first interval never uses the zero pair, so the drill cannot come out as a
		// session where the two observers agreed about nothing at all — arithmetically
		// fine, and useless to practise on.
		const [lo, hi] = pick(i === 0 ? CLEAN_PAIRS.filter(([l]) => l > 0) : CLEAN_PAIRS, rng);
		// Which observer counted more varies, or the drill teaches that B is always lower.
		const flip = rng() < 0.5;
		a.push(flip ? lo : hi);
		b.push(flip ? hi : lo);
	}
	const perInterval = a.map((x, i) => {
		const lo = Math.min(x, b[i]);
		const hi = Math.max(x, b[i]);
		return hi === 0 ? 100 : (100 * lo) / hi;
	});
	const mean = perInterval.reduce((s, x) => s + x, 0) / n;
	return {
		kind: 'ioa-mean-count',
		question:
			'Both observers counted within each interval. What is mean count-per-interval agreement, to the nearest whole percent?',
		given: [
			{ label: 'Observer A', value: a.join(', ') },
			{ label: 'Observer B', value: b.join(', ') }
		],
		answer: pct(mean),
		unit: '%',
		tolerance: 0.5,
		working: [
			'Work out agreement inside each interval first — smaller ÷ larger × 100 — then average those figures.',
			`Per interval: ${perInterval.map((p) => `${p}%`).join(', ')}.`,
			`Mean: (${perInterval.join(' + ')}) ÷ ${n} = ${pct(mean)}%.`,
			'Averaging inside the intervals stops an over-count in one part of the session cancelling out an under-count in another.'
		]
	};
}

function makeIoaExact(rng: Rng): Drill {
	const n = pick([10, 20], rng);
	const same = intBetween(Math.floor(n / 2), n - 1, rng);
	return {
		kind: 'ioa-exact-agreement',
		question:
			'Two observers recorded a count in each interval. In how many percent of intervals did they agree exactly?',
		given: [
			{ label: 'Intervals observed', value: String(n) },
			{ label: 'Intervals where both wrote the same number', value: String(same) }
		],
		answer: pct((100 * same) / n),
		unit: '%',
		tolerance: 0.5,
		working: [
			'Exact count agreement counts an interval only when both observers recorded the identical number.',
			`${same} ÷ ${n} × 100 = ${pct((100 * same) / n)}%.`,
			'It is the strictest of the count methods, and it will read lower than the others on the same data.'
		]
	};
}

function makeIoaInterval(rng: Rng): Drill {
	const n = pick([10, 20], rng);
	const agreements = intBetween(Math.floor(n / 2), n - 1, rng);
	return {
		kind: 'ioa-interval',
		question:
			'Two observers scored each interval as occurred or did not occur. What is interval-by-interval agreement?',
		given: [
			{ label: 'Intervals observed', value: String(n) },
			{ label: 'Intervals scored the same way by both', value: String(agreements) }
		],
		answer: pct((100 * agreements) / n),
		unit: '%',
		tolerance: 0.5,
		working: [
			'Count the intervals the two observers scored the same way — whether that was occurred or did not occur — and divide by the number of intervals.',
			`${agreements} ÷ ${n} × 100 = ${pct((100 * agreements) / n)}%.`,
			'On a behaviour that is rare, two observers can agree on almost every interval simply by both scoring nothing, which is why occurrence-only agreement is often reported as well.'
		]
	};
}

export function makeDrill(kind: DrillKind, rng: Rng = Math.random): Drill {
	switch (kind) {
		case 'rate':
			return makeRate(rng);
		case 'percentage':
			return makePercentage(rng);
		case 'mean-duration':
		case 'mean-latency':
			return makeMean(kind, rng);
		case 'interval-percentage':
			return makeIntervalPercentage(rng);
		case 'ioa-total-count':
			return makeIoaTotalCount(rng);
		case 'ioa-mean-count':
			return makeIoaMeanCount(rng);
		case 'ioa-exact-agreement':
			return makeIoaExact(rng);
		case 'ioa-interval':
			return makeIoaInterval(rng);
	}
}

/** Right or wrong, allowing for the rounding the question asked for. */
export function isCorrect(drill: Drill, given: number): boolean {
	return Number.isFinite(given) && Math.abs(given - drill.answer) <= drill.tolerance;
}

/**
 * Accepts what somebody actually types: a stray percent sign, a comma for a decimal
 * point, surrounding spaces. Returns NaN for anything that is not a number, which the
 * page treats as "not answered yet" rather than as wrong.
 */
export function parseAnswer(input: string): number {
	const cleaned = input.trim().replace(/%/g, '').replace(',', '.');
	if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return NaN;
	return Number(cleaned);
}
